import type { SupabaseClient } from '@supabase/supabase-js'

/** 共用收付款方式選項（收款/付款登錄與應收/應付建立都用這組） */
export const PAYMENT_METHODS = ['現金', '匯款', '開票（票期）', '刷卡', '支票', '其他']

/** 這些狀態視為「成立」，會自動產生應收/應付 */
const SALES_ACTIVE_STATUSES = ['已確認', '出貨中', '已完成']
const PURCHASE_ACTIVE_STATUSES = ['已確認', '已到貨']

/**
 * 銷貨單成立時自動產生應收帳款（若該銷貨單已有應收則不重複建）。
 * 回傳 'created' | 'exists' | 'skipped'
 */
export async function ensureReceivableForSalesOrder(
  supabase: SupabaseClient, orderId: string, status: string,
): Promise<'created' | 'exists' | 'skipped'> {
  if (!SALES_ACTIVE_STATUSES.includes(status)) return 'skipped'

  const { data: existing } = await supabase
    .from('receivables').select('id').eq('sales_order_id', orderId).limit(1)
  if (existing && existing.length > 0) return 'exists'

  const { data: order } = await supabase
    .from('sales_orders').select('id, order_no, client_id, total_amount, payment_terms').eq('id', orderId).single()
  if (!order || !Number(order.total_amount)) return 'skipped'

  const res = await fetch('/api/receivables/generate-no')
  const { receivable_no } = await res.json()

  // 預設到期日：30 天後
  const due = new Date(); due.setDate(due.getDate() + 30)

  const { error } = await supabase.from('receivables').insert({
    receivable_no,
    client_id: order.client_id ?? null,
    sales_order_id: order.id,
    due_date: due.toISOString().split('T')[0],
    amount: order.total_amount,
    notes: `由銷貨單 ${order.order_no} 自動產生`,
    status: '未收',
  })
  return error ? 'skipped' : 'created'
}

/** 銷貨出貨 → 自動扣庫存（同一張單只扣一次；只處理有連結產品的品項） */
export async function ensureStockOutForSalesOrder(
  supabase: SupabaseClient, orderId: string, status: string,
): Promise<'created' | 'exists' | 'skipped'> {
  if (!['出貨中', '已完成'].includes(status)) return 'skipped'

  const { data: order } = await supabase.from('sales_orders').select('id, order_no').eq('id', orderId).single()
  if (!order) return 'skipped'

  const { data: existing } = await supabase
    .from('inventory_transactions').select('id')
    .eq('reference_no', order.order_no).eq('type', '出庫').limit(1)
  if (existing && existing.length > 0) return 'exists'

  const { data: items } = await supabase
    .from('sales_order_items').select('product_id, quantity')
    .eq('order_id', orderId).not('product_id', 'is', null)
  const rows = (items ?? []).filter(i => Number(i.quantity) > 0)
  if (rows.length === 0) return 'skipped'

  const { error } = await supabase.from('inventory_transactions').insert(
    rows.map(i => ({
      product_id: i.product_id,
      type: '出庫',
      quantity: -Math.abs(Number(i.quantity)),
      reference_no: order.order_no,
      notes: `銷貨單 ${order.order_no} 出貨自動扣庫存`,
    }))
  )
  return error ? 'skipped' : 'created'
}

/** 進貨到貨 → 自動入庫（同一張進貨單只入一次；unit_cost 帶品項進價） */
export async function ensureStockInForPurchase(
  supabase: SupabaseClient, purchaseId: string, status: string,
): Promise<'created' | 'exists' | 'skipped'> {
  if (status !== '已到貨') return 'skipped'

  const { data: order } = await supabase.from('purchases').select('id, purchase_no').eq('id', purchaseId).single()
  if (!order) return 'skipped'

  const { data: existing } = await supabase
    .from('inventory_transactions').select('id')
    .eq('reference_no', order.purchase_no).eq('type', '入庫').limit(1)
  if (existing && existing.length > 0) return 'exists'

  const { data: items } = await supabase
    .from('purchase_items').select('product_id, quantity, unit_price')
    .eq('purchase_id', purchaseId).not('product_id', 'is', null)
  const rows = (items ?? []).filter(i => Number(i.quantity) > 0)
  if (rows.length === 0) return 'skipped'

  const { error } = await supabase.from('inventory_transactions').insert(
    rows.map(i => ({
      product_id: i.product_id,
      type: '入庫',
      quantity: Math.abs(Number(i.quantity)),
      unit_cost: Number(i.unit_price) || null,
      reference_no: order.purchase_no,
      notes: `進貨單 ${order.purchase_no} 到貨自動入庫`,
    }))
  )
  return error ? 'skipped' : 'created'
}

/**
 * 進貨單成立時自動產生應付帳款（若該進貨單已有應付則不重複建）。
 */
export async function ensurePayableForPurchase(
  supabase: SupabaseClient, purchaseId: string, status: string,
): Promise<'created' | 'exists' | 'skipped'> {
  if (!PURCHASE_ACTIVE_STATUSES.includes(status)) return 'skipped'

  const { data: existing } = await supabase
    .from('payables').select('id').eq('purchase_id', purchaseId).limit(1)
  if (existing && existing.length > 0) return 'exists'

  const { data: order } = await supabase
    .from('purchases').select('id, purchase_no, vendor_id, vendor_name, total_amount').eq('id', purchaseId).single()
  if (!order || !Number(order.total_amount)) return 'skipped'

  const res = await fetch('/api/payables/generate-no')
  const { payable_no } = await res.json()

  const due = new Date(); due.setDate(due.getDate() + 30)

  const { error } = await supabase.from('payables').insert({
    payable_no,
    vendor_id: order.vendor_id ?? null,
    purchase_id: order.id,
    due_date: due.toISOString().split('T')[0],
    amount: order.total_amount,
    notes: `由進貨單 ${order.purchase_no} 自動產生`,
    status: '未付',
  })
  return error ? 'skipped' : 'created'
}
