import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/woocommerce/push
 * body: { product_ids: string[], publish?: boolean }
 *
 * 把 CRM 產品推到 av-shop.com（WooCommerce REST API v3）。
 * 已推過的（有 web_product_id）→ 更新；沒推過的 → 新建（預設草稿）。
 *
 * 需要的環境變數（設在 Vercel，勿寫進程式碼）：
 *   WC_STORE_URL        例：https://av-shop.com
 *   WC_CONSUMER_KEY     ck_xxx
 *   WC_CONSUMER_SECRET  cs_xxx
 */

function wcAuthHeader() {
  const k = process.env.WC_CONSUMER_KEY
  const s = process.env.WC_CONSUMER_SECRET
  if (!k || !s) return null
  return 'Basic ' + Buffer.from(`${k}:${s}`).toString('base64')
}

/** 把 CRM 產品組成 WooCommerce 商品 payload */
function buildPayload(p: any, features: string[], images: string[], publish: boolean) {
  const name = [
    p.brand ? `【${p.brand}】` : '',
    p.model ?? '',
    p.product_name ?? '',
  ].filter(Boolean).join(' ').trim()

  // 短描述：產品特色（chip）→ 條列
  const shortDesc = features.length
    ? `<ul>${features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
    : ''

  // 完整描述：商品介紹 HTML + 規格 HTML
  const desc = [
    p.web_description ?? '',
    p.web_spec_html ? `<h3>詳細規格</h3>${p.web_spec_html}` : '',
    p.web_bsmi_no ? `<p>BSMI 商檢字號：${escapeHtml(p.web_bsmi_no)}</p>` : '',
    p.web_ncc_no ? `<p>NCC 認證字號：${escapeHtml(p.web_ncc_no)}</p>` : '',
  ].filter(Boolean).join('\n')

  const imgs = [p.web_main_image_url, ...images].filter(Boolean).map((src: string) => ({ src }))

  const payload: any = {
    name,
    type: 'simple',
    status: publish ? 'publish' : 'draft',
    sku: p.web_sku || p.model || undefined,
    regular_price: p.web_sale_price != null ? String(p.web_sale_price) : (p.list_price != null ? String(p.list_price) : undefined),
    short_description: shortDesc,
    description: desc,
    manage_stock: true,
    stock_quantity: Number(p.stock_qty ?? 0),
    backorders: p.web_allow_backorder ? 'yes' : 'no',
  }

  // 限時促銷
  if (p.web_promo_price != null && Number(p.web_promo_price) > 0) {
    payload.sale_price = String(p.web_promo_price)
    if (p.web_promo_price_from) payload.date_on_sale_from = p.web_promo_price_from
    if (p.web_promo_price_to) payload.date_on_sale_to = p.web_promo_price_to
  }

  if (imgs.length) payload.images = imgs
  if (p.web_category) payload.categories = [{ name: p.web_category }]
  if (p.brand) payload.brands = [{ name: p.brand }]   // WooCommerce Brands（若外掛支援）

  return payload
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: Request) {
  const auth = wcAuthHeader()
  const store = process.env.WC_STORE_URL
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
    const [{ data: p }, { data: feats }, { data: imgs }] = await Promise.all([
      supabase.from('products').select('*').eq('id', id).single(),
      supabase.from('product_features').select('feature_text').eq('product_id', id).order('sort_order'),
      supabase.from('product_images').select('image_url').eq('product_id', id).order('sort_order'),
    ])
    if (!p) { results.push({ id, ok: false, error: '找不到產品' }); continue }

    const payload = buildPayload(
      p,
      (feats ?? []).map((f: any) => f.feature_text).filter(Boolean),
      (imgs ?? []).map((i: any) => i.image_url).filter(Boolean),
      !!publish,
    )

    const wcId = p.web_product_id
    const url = wcId
      ? `${store.replace(/\/$/, '')}/wp-json/wc/v3/products/${wcId}`
      : `${store.replace(/\/$/, '')}/wp-json/wc/v3/products`

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
        results.push({ id, name: p.product_name, ok: false, error: data?.message ?? `HTTP ${res.status}` })
        continue
      }

      await supabase.from('products').update({
        web_product_id: String(data.id),
        web_product_url: data.permalink ?? null,
        web_synced_at: new Date().toISOString(),
        web_sync_status: data.status ?? null,
      }).eq('id', id)

      results.push({
        id, name: p.product_name, ok: true,
        wc_id: data.id, url: data.permalink, status: data.status,
        action: wcId ? '已更新' : '已建立',
      })
    } catch (e: any) {
      results.push({ id, name: p.product_name, ok: false, error: e.message ?? '連線失敗' })
    }
  }

  const okCount = results.filter(r => r.ok).length
  return NextResponse.json({ ok: okCount, failed: results.length - okCount, results })
}

/** GET /api/woocommerce/push → 測試連線 */
export async function GET() {
  const auth = wcAuthHeader()
  const store = process.env.WC_STORE_URL
  if (!auth || !store) {
    return NextResponse.json({ connected: false, error: '尚未設定 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET' })
  }
  try {
    const res = await fetch(`${store.replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=1`, {
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
