import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { wc, wcConfigured, findCategoryIdByName, findProductBySku } from '@/lib/woocommerce'
import { buildWooPayload, validateForWeb, type CrmProductRow, type CrmSubData } from '@/lib/web-product-mapper'

/**
 * POST /api/web/publish
 * body: { product_id: string, force?: boolean }
 *
 * 將 CRM 產品上傳到 av-shop.com（一律建立為「草稿」，由人工在網站後台確認後發佈）
 * 已上傳過的商品（web_product_id 有值）會改為更新，且不會覆蓋網站上的發佈狀態。
 */
export async function POST(req: NextRequest) {
  if (!wcConfigured()) {
    return NextResponse.json(
      { error: 'WooCommerce 尚未設定：請在 .env.local 填入 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET' },
      { status: 400 }
    )
  }

  const { product_id, force } = await req.json().catch(() => ({}))
  if (!product_id) {
    return NextResponse.json({ error: '缺少 product_id' }, { status: 400 })
  }

  const supabase = createClient()

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', product_id)
    .single()

  if (error || !product) {
    return NextResponse.json({ error: '找不到產品' }, { status: 404 })
  }

  const [{ data: images }, { data: downloads }, { data: features }] = await Promise.all([
    supabase.from('product_images').select('image_url, sort_order').eq('product_id', product_id),
    supabase.from('product_downloads').select('file_name, file_url, sort_order').eq('product_id', product_id),
    supabase.from('product_features').select('feature_text, sort_order').eq('product_id', product_id),
  ])

  const sub: CrmSubData = {
    images: images ?? [],
    downloads: downloads ?? [],
    features: features ?? [],
  }

  const p = product as CrmProductRow

  const missing = validateForWeb(p, sub)
  if (missing.length > 0 && !force) {
    return NextResponse.json(
      { error: `尚缺必要欄位：${missing.join('、')}`, missing, need_force: true },
      { status: 422 }
    )
  }

  try {
    const categoryId = await findCategoryIdByName(p.web_category ?? '')

    // 已有網站 ID → 更新；沒有 → 先用 SKU 找，避免重複建立
    let existingId: number | null = p.web_product_id ? Number(p.web_product_id) : null
    if (!existingId) {
      const bySku = await findProductBySku(((p.web_sku || p.model) ?? '').trim())
      if (bySku?.id) existingId = bySku.id
    }

    const payload = buildWooPayload(p, sub, categoryId, { status: 'draft' })

    let result: any
    if (existingId) {
      // 更新既有商品：不動 status，避免把已上架商品打回草稿
      const { status, ...updatePayload } = payload
      result = await wc.put(`/products/${existingId}`, updatePayload)
    } else {
      result = await wc.post('/products', payload)
    }

    await supabase
      .from('products')
      .update({
        web_product_id: String(result.id),
        web_product_url: result.permalink ?? null,
        web_publish: result.status === 'publish',
      })
      .eq('id', product_id)

    return NextResponse.json({
      ok: true,
      mode: existingId ? 'updated' : 'created',
      web_product_id: result.id,
      web_status: result.status,
      permalink: result.permalink,
      edit_url: `${(process.env.WC_STORE_URL ?? '').replace(/\/$/, '')}/wp-admin/post.php?post=${result.id}&action=edit`,
      warnings: missing,
      category_matched: categoryId ? true : false,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '上傳失敗' }, { status: 500 })
  }
}
