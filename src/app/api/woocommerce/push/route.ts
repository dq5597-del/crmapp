import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildWooPayload, validateForWeb, type CrmProductRow, type CrmSubData } from '@/lib/web-product-mapper'

/**
 * POST /api/woocommerce/push
 * body: { product_ids: string[], publish?: boolean }
 *
 * 把 CRM 產品推到 av-shop.com（WooCommerce REST API v3）。
 * 已推過的（有 web_product_id）→ 更新（不覆蓋官網的發佈狀態）；沒推過的 → 新建為草稿。
 * 商品會帶 av_source=crm，出現在 WP 後台「商品 → CRM 待審」清單。
 *
 * 欄位對應集中在 src/lib/web-product-mapper.ts：
 *   product_features  → feature_1~10（特色標章）+ av_feature_item_1~8（產品特色列表）
 *   web_spec_html     → av_tab_specs（詳細規格分頁）
 *   catalog/manual/CAD→ av_download_*（檔案下載分頁）
 *
 * 需要的環境變數（設在 Vercel，勿寫進程式碼）：
 *   WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET
 */

function wcAuthHeader() {
  const k = process.env.WC_CONSUMER_KEY
  const s = process.env.WC_CONSUMER_SECRET
  if (!k || !s) return null
  return 'Basic ' + Buffer.from(`${k}:${s}`).toString('base64')
}

function storeBase() {
  return (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
}

/** 依分類名稱找官網分類 ID（找不到回 null，不自動新增分類） */
async function findCategoryId(name: string, auth: string): Promise<number | null> {
  if (!name?.trim()) return null
  try {
    const res = await fetch(
      `${storeBase()}/wp-json/wc/v3/products/categories?search=${encodeURIComponent(name.trim())}&per_page=20`,
      { headers: { Authorization: auth }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list) || list.length === 0) return null
    const exact = list.find((c: any) => c.name?.trim() === name.trim())
    return (exact ?? list[0]).id ?? null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const auth = wcAuthHeader()
  const store = storeBase()
  if (!auth || !store) {
    return NextResponse.json({
      error: '尚未設定官網 API 金鑰。請在 Vercel 環境變數加入 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET 後重新部署。',
    }, { status: 500 })
  }

  const { product_ids, publish } = await req.json()
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return NextResponse.json({ error: '沒有選擇要推送的產品' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const results: any[] = []

  for (const id of product_ids) {
    const [{ data: p }, { data: feats }, { data: imgs }, { data: dls }] = await Promise.all([
      supabase.from('products').select('*').eq('id', id).single(),
      supabase.from('product_features').select('feature_text, sort_order').eq('product_id', id).order('sort_order'),
      supabase.from('product_images').select('image_url, sort_order').eq('product_id', id).order('sort_order'),
      supabase.from('product_downloads').select('file_name, file_url, sort_order').eq('product_id', id).order('sort_order'),
    ])
    if (!p) { results.push({ id, ok: false, error: '找不到產品' }); continue }

    const sub: CrmSubData = {
      features: (feats ?? []) as any,
      images: (imgs ?? []) as any,
      downloads: (dls ?? []) as any,
    }
    const row = p as CrmProductRow
    const missing = validateForWeb(row, sub)

    const categoryId = await findCategoryId(row.web_category ?? '', auth)
    const payload: any = buildWooPayload(row, sub, categoryId, { status: publish ? 'publish' : 'draft' })

    // 官網分類找不到時，退回用名稱建立關聯（WooCommerce 會自行比對）
    if (!categoryId && row.web_category) {
      payload.categories = [{ name: row.web_category }]
    }
    // 庫存
    payload.manage_stock = true
    payload.stock_quantity = Number((p as any).stock_qty ?? 0)

    const wcId = row.web_product_id
    const url = wcId
      ? `${store}/wp-json/wc/v3/products/${wcId}`
      : `${store}/wp-json/wc/v3/products`

    // 更新既有商品時不動 status，避免把已上架商品打回草稿
    if (wcId) delete payload.status

    try {
      const res = await fetch(url, {
        method: wcId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        // 商品在官網被刪掉了 → 清掉連結，下次會重新建立
        if (res.status === 404 && wcId) {
          await supabase.from('products').update({ web_product_id: null, web_product_url: null }).eq('id', id)
        }
        results.push({ id, name: row.product_name, ok: false, error: data?.message ?? `HTTP ${res.status}` })
        continue
      }

      await supabase.from('products').update({
        web_product_id: String(data.id),
        web_product_url: data.permalink ?? null,
        web_synced_at: new Date().toISOString(),
        web_sync_status: data.status ?? null,
      }).eq('id', id)

      results.push({
        id,
        name: row.product_name,
        ok: true,
        wc_id: data.id,
        url: data.permalink,
        status: data.status,
        action: wcId ? '已更新' : '已建立',
        missing,                       // 缺少的欄位（僅提醒，不阻擋）
        category_matched: !!categoryId,
      })
    } catch (e: any) {
      results.push({ id, name: row.product_name, ok: false, error: e.message ?? '連線失敗' })
    }
  }

  const okCount = results.filter(r => r.ok).length
  return NextResponse.json({ ok: okCount, failed: results.length - okCount, results })
}

/** GET /api/woocommerce/push → 測試連線 */
export async function GET() {
  const auth = wcAuthHeader()
  const store = storeBase()
  if (!auth || !store) {
    return NextResponse.json({ connected: false, error: '尚未設定 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET' })
  }
  try {
    const res = await fetch(`${store}/wp-json/wc/v3/products?per_page=1`, {
      headers: { Authorization: auth },
    })
    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json({ connected: false, error: `HTTP ${res.status}：${t.slice(0, 120)}` })
    }
    return NextResponse.json({ connected: true, store })
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e.message })
  }
}
