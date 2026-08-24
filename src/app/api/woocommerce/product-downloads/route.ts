import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildWooDownloadMeta } from '@/lib/web-product-mapper'

const CRM_REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Guanghui-CRM/1.0 (+https://crmapp-topaz.vercel.app)',
}

export async function POST(req: Request) {
  const { product_id: productId } = await req.json()
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: '沒有收到 CRM 產品 ID' }, { status: 400 })
  }

  const store = (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
  const key = process.env.WC_CONSUMER_KEY ?? ''
  const secret = process.env.WC_CONSUMER_SECRET ?? ''
  if (!store || !key || !secret) {
    return NextResponse.json({ error: '尚未設定官網 WooCommerce API 金鑰' }, { status: 500 })
  }

  const supabase = createServerSupabaseClient()
  const [{ data: product, error: productError }, { data: downloads, error: downloadsError }] = await Promise.all([
    supabase.from('products').select('catalog_url,manual_url,web_product_id').eq('id', productId).single(),
    supabase.from('product_downloads').select('file_name,file_url,sort_order').eq('product_id', productId).order('sort_order'),
  ])
  if (productError || !product) {
    return NextResponse.json({ error: productError?.message ?? '找不到產品' }, { status: 404 })
  }
  if (downloadsError) {
    return NextResponse.json({ error: downloadsError.message }, { status: 500 })
  }
  if (!product.web_product_id) {
    return NextResponse.json({ synced: false, reason: '商品尚未同步至 WooCommerce' })
  }

  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`
  const response = await fetch(`${store}/wp-json/wc/v3/products/${product.web_product_id}`, {
    method: 'PUT',
    headers: { ...CRM_REQUEST_HEADERS, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta_data: buildWooDownloadMeta(product, downloads ?? []) }),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json({ error: data?.message ?? `官網型錄資料同步失敗（HTTP ${response.status}）` }, { status: 502 })
  }
  return NextResponse.json({ synced: true, web_product_id: String(product.web_product_id) })
}
