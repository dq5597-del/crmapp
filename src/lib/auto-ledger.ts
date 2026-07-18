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

/**
 * 訂購單（進貨）成立時自動產生應付帳款（若該訂購單已有應付則不重複建）。
 */
export async function ensurePayableForPurchaseOrder(
  supabase: SupabaseClient, orderId: string, status: string,
): Promise<'created' | 'exists' | 'skipped'> {
  if (!PURCHASE_ACTIVE_STATUSES.includes(status)) return 'skipped'

  const { data: existing } = await supabase
    .from('payables').select('id').eq('purchase_order_id', orderId).limit(1)
  if (existing && existing.length > 0) return 'exists'

  const { data: order } = await supabase
    .from('purchase_orders').select('id, order_no, vendor_name, total_amount').eq('id', orderId).single()
  if (!order || !Number(order.total_amount)) return 'skipped'

  // 嘗試用廠商名稱對應 vendors 表（訂購單只存名稱）
  let vendorId: string | null = null
  if (order.vendor_name) {
    const { data: v } = await supabase
      .from('vendors').select('id').eq('company_name', order.vendor_name).limit(1)
    vendorId = v?.[0]?.id ?? null
  }

  const res = await fetch('/api/payables/generate-no')
  const { payable_no } = await res.json()

  const due = new Date(); due.setDate(due.getDate() + 30)

  const { error } = await supabase.from('payables').insert({
    payable_no,
    vendor_id: vendorId,
    purchase_order_id: order.id,
    due_date: due.toISOString().split('T')[0],
    amount: order.total_amount,
    notes: `由訂購單 ${order.order_no} 自動產生${vendorId ? '' : `（廠商：${order.vendor_name ?? '未填'}）`}`,
    status: '未付',
  })
  return error ? 'skipped' : 'created'
}
