import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { wc, wcConfigured } from '@/lib/woocommerce'

/**
 * POST /api/web/orders/sync
 *
 * 從 av-shop.com 拉取訂單寫入 web_orders。
 * body（皆選填）：{ days?: number, per_page?: number }
 *   days     只同步最近 N 天的訂單，預設 90
 *   per_page 每頁筆數，預設 50，最多 100
 *
 * 已存在的訂單只更新「來自官網」的欄位，
 * 不會覆蓋 CRM 這邊人工填的發票號碼／日期／PDF。
 */

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

function metaValue(order: any, key: string): string {
  const list = Array.isArray(order?.meta_data) ? order.meta_data : []
  const hit = list.find((m: any) => m?.key === key)
  return hit?.value != null ? String(hit.value) : ''
}

function shippingText(order: any): string {
  const lines = Array.isArray(order?.shipping_lines) ? order.shipping_lines : []
  return lines.map((l: any) => l?.method_title).filter(Boolean).join('、')
}

function addressText(order: any): string {
  const s = order?.shipping ?? {}
  const parts = [s.postcode, s.state, s.city, s.address_1, s.address_2].filter(Boolean)
  return parts.join(' ').trim()
}

export async function POST(req: NextRequest) {
  if (!wcConfigured()) {
    return NextResponse.json({ error: 'WooCommerce 尚未設定（WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET）' }, { status: 500 })
  }

  const supabase = svc()
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 未設定' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const days = Math.min(Math.max(Number(body?.days) || 90, 1), 365)
  const perPage = Math.min(Math.max(Number(body?.per_page) || 50, 1), 100)

  const after = new Date(Date.now() - days * 86400000).toISOString()

  let orders: any[] = []
  try {
    orders = await wc.get(`/orders?after=${encodeURIComponent(after)}&per_page=${perPage}&orderby=date&order=desc`)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '讀取 WooCommerce 訂單失敗' }, { status: 502 })
  }

  if (!Array.isArray(orders)) {
    return NextResponse.json({ error: 'WooCommerce 回應格式不正確' }, { status: 502 })
  }

  let inserted = 0
  let updated = 0

  for (const o of orders) {
    const wcOrderId = String(o.id)

    const items = (Array.isArray(o.line_items) ? o.line_items : []).map((li: any) => ({
      name: li.name ?? '',
      sku: li.sku ?? '',
      qty: Number(li.quantity) || 0,
      price: Number(li.price) || 0,
      subtotal: Number(li.total) || 0,
    }))

    const fromWeb = {
      order_no: String(o.number ?? o.id),
      order_date: o.date_created_gmt ? `${o.date_created_gmt}Z` : null,
      wc_status: o.status ?? null,
      order_key: o.order_key ?? null,
      permalink: `${(process.env.WC_STORE_URL ?? '').replace(/\/$/, '')}/wp-admin/admin.php?page=wc-orders&action=edit&id=${wcOrderId}`,

      customer_name: [o.billing?.last_name, o.billing?.first_name].filter(Boolean).join(' ') || null,
      customer_company: o.billing?.company || null,
      customer_email: o.billing?.email || null,
      customer_phone: o.billing?.phone || null,
      shipping_address: addressText(o) || null,

      total: Number(o.total) || 0,
      item_count: items.reduce((sum: number, i: any) => sum + i.qty, 0),
      items,

      shipping_method: shippingText(o) || null,
      tracking_no: metaValue(o, '_gh_tracking_no') || metaValue(o, '_ecpay_shipping_no') || null,

      invoice_type: metaValue(o, '_gh_invoice_type') || null,
      invoice_tax_id: metaValue(o, '_gh_invoice_tax_id') || null,
      invoice_title: metaValue(o, '_gh_invoice_title') || null,
      invoice_carrier_type: metaValue(o, '_gh_invoice_carrier_type') || null,
      invoice_carrier: metaValue(o, '_gh_invoice_carrier') || null,
      invoice_donate: metaValue(o, '_gh_invoice_donate') || null,

      raw: o,
      synced_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('web_orders')
      .select('id')
      .eq('wc_order_id', wcOrderId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('web_orders').update(fromWeb).eq('id', existing.id)
      if (!error) updated++
    } else {
      const { error } = await supabase.from('web_orders').insert({ wc_order_id: wcOrderId, ...fromWeb })
      if (!error) inserted++
    }
  }

  return NextResponse.json({ ok: true, fetched: orders.length, inserted, updated })
}
