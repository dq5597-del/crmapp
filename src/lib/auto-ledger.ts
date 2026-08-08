import type { SupabaseClient } from '@supabase/supabase-js'

/** 共用收付款方式選項（收款/付款登錄與應收/應付建立都用這組） */
export const PAYMENT_METHODS = ['現金', '匯款', '開票（票期）', '刷卡', '支票', '其他']

/** 這些狀態視為「成立」，會自動產生應收/應付 */
const SALES_ACTIVE_STATUSES = ['已確認', '出貨中', '已完成']
/** 進貨單：以「已到貨」為認列負債的時點（實際收到貨才成立應付） */
export const PURCHASE_AP_STATUSES = ['已到貨']
/** 進貨單回到這些狀態時，自動作廢未付款的自動應付 */
export const PURCHASE_INACTIVE_STATUSES = ['草稿', '取消']

/** 帳務動作結果（帶原因，避免錯誤被靜默吞掉） */
export type LedgerResult =
  | { status: 'created'; message: string }
  | { status: 'exists' }
  | { status: 'skipped'; reason?: string }
  | { status: 'error'; message: string }

function toISODate(d: Date): string {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime())
  r.setDate(r.getDate() + n)
  return r
}

/**
 * 依付款條件字串計算到期日。
 * 支援：月結30天 / 30天月結 / 月結 / 月底 / 次月10日 / 貨到付款 / 現金 / NET 60 / 空白（預設 30 天）
 */
export function calcDueDate(baseDate: string | Date | null | undefined, terms?: string | null): string {
  // 'YYYY-MM-DD' 以本地時區解讀，避免 UTC 解析造成差一天
  let base: Date
  if (baseDate instanceof Date) base = baseDate
  else if (typeof baseDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(baseDate)) {
    const [y, m, dd] = baseDate.slice(0, 10).split('-').map(Number)
    base = new Date(y, m - 1, dd)
  } else base = baseDate ? new Date(baseDate) : new Date()
  const d = isNaN(base.getTime()) ? new Date() : base
  const t = (terms ?? '').trim()

  if (!t) return toISODate(addDays(d, 30))
  if (/貨到付款|現金|即期|當日|預付|訂金/.test(t)) return toISODate(d)

  // 次月／隔月／下月 N 日
  const nextMonthDay = t.match(/(?:次|隔|下)\s*月\s*(\d{1,2})\s*[日號]/)
  if (nextMonthDay) {
    return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, parseInt(nextMonthDay[1], 10)))
  }

  const numMatch = t.match(/(\d+)/)
  const days = numMatch ? parseInt(numMatch[1], 10) : 30

  // 月結：以當月最後一天為結帳基準，再加 N 天
  if (/月結|月底|月末/.test(t)) {
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return toISODate(addDays(endOfMonth, numMatch ? days : 0))
  }

  return toISODate(addDays(d, days))
}

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
    .from('purchase_items').select('product_id, quantity, unit_price, warehouse_id')
    .eq('purchase_id', purchaseId).not('product_id', 'is', null)
  const rows = (items ?? []).filter(i => Number(i.quantity) > 0)
  if (rows.length === 0) return 'skipped'

  const { error } = await supabase.from('inventory_transactions').insert(
    rows.map(i => ({
      product_id: i.product_id,
      type: '入庫',
      quantity: Math.abs(Number(i.quantity)),
      unit_cost: Number(i.unit_price) || null,
      warehouse_id: i.warehouse_id ?? null,
      reference_no: order.purchase_no,
      notes: `進貨單 ${order.purchase_no} 到貨自動入庫`,
    }))
  )
  return error ? 'skipped' : 'created'
}

/**
 * 進貨單「已到貨」時自動產生應付帳款（同一張進貨單只建一次）。
 * - 金額：以 purchases.total_amount 為準；若為 0／空白則由品項重算並回寫進貨單
 * - 到期日：進貨單付款條件 > 廠商付款條件 > 預設 30 天
 * - 失敗會回傳 error 並帶訊息，不再靜默略過
 */
export async function ensurePayableForPurchase(
  supabase: SupabaseClient, purchaseId: string, status: string,
): Promise<LedgerResult> {
  if (!PURCHASE_AP_STATUSES.includes(status)) {
    return { status: 'skipped', reason: `狀態為「${status}」，需為「已到貨」才產生應付` }
  }

  const { data: existing, error: exErr } = await supabase
    .from('payables').select('id').eq('purchase_id', purchaseId).limit(1)
  if (exErr) {
    return { status: 'error', message: `查詢應付失敗：${exErr.message}（請確認 payables 已有 purchase_id 欄位，見 sql/purchases.sql）` }
  }
  if (existing && existing.length > 0) return { status: 'exists' }

  const { data: order, error: orderErr } = await supabase
    .from('purchases')
    .select('id, purchase_no, vendor_id, vendor_name, purchase_date, payment_terms, total_amount, vendors(payment_terms)')
    .eq('id', purchaseId).single()
  if (orderErr || !order) {
    return { status: 'error', message: `讀取進貨單失敗：${orderErr?.message ?? '找不到資料'}` }
  }

  // 金額：total_amount 為 0 時，由品項重算並回寫（避免舊單 NT$0 卡住）
  let amount = Number(order.total_amount) || 0
  if (amount <= 0) {
    const { data: items } = await supabase
      .from('purchase_items').select('quantity, unit_price').eq('purchase_id', purchaseId)
    amount = (items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
    if (amount > 0) {
      await supabase.from('purchases').update({ subtotal: amount, total_amount: amount }).eq('id', purchaseId)
    }
  }
  if (amount <= 0) {
    return { status: 'skipped', reason: `進貨單 ${order.purchase_no} 金額為 0，請先補上品項數量與進價` }
  }

  const res = await fetch('/api/payables/generate-no')
  if (!res.ok) return { status: 'error', message: '取得應付單號失敗' }
  const { payable_no } = await res.json()

  const v = (order as any).vendors
  const vendorTerms = (Array.isArray(v) ? v[0]?.payment_terms : v?.payment_terms) ?? null
  const terms = order.payment_terms || vendorTerms || ''
  const dueDate = calcDueDate(order.purchase_date, terms)

  const { error } = await supabase.from('payables').insert({
    payable_no,
    vendor_id: order.vendor_id ?? null,
    purchase_id: order.id,
    due_date: dueDate,
    amount,
    notes: `由進貨單 ${order.purchase_no} 到貨自動產生${terms ? `（付款條件：${terms}）` : ''}`,
    status: '未付',
  })
  if (error) return { status: 'error', message: `建立應付失敗：${error.message}` }

  return { status: 'created', message: `已產生應付 ${payable_no}（到期日 ${dueDate}）` }
}

/**
 * 進貨單內容被修改後，同步已產生的應付帳款金額與到期日。
 * - 已有付款紀錄者不改金額（避免破壞已入帳資料），回傳提醒
 * - 已作廢者不動
 */
export async function syncPayableForPurchase(
  supabase: SupabaseClient, purchaseId: string,
): Promise<LedgerResult> {
  const { data: aps, error } = await supabase
    .from('payables').select('id, payable_no, amount, paid_amount, status').eq('purchase_id', purchaseId)
  if (error) return { status: 'error', message: `查詢應付失敗：${error.message}` }

  const ap = (aps ?? []).find(p => p.status !== '作廢')
  if (!ap) return { status: 'skipped' }

  const { data: order } = await supabase
    .from('purchases')
    .select('id, purchase_no, purchase_date, payment_terms, total_amount, vendors(payment_terms)')
    .eq('id', purchaseId).single()
  if (!order) return { status: 'error', message: '讀取進貨單失敗' }

  const amount = Number(order.total_amount) || 0
  if (Number(ap.amount) === amount) return { status: 'exists' }

  if (Number(ap.paid_amount) > 0) {
    return {
      status: 'skipped',
      reason: `應付 ${ap.payable_no} 已有付款紀錄，金額未自動同步（原 ${ap.amount} → 應為 ${amount}），請至應付帳款人工處理`,
    }
  }
  if (amount <= 0) {
    return { status: 'skipped', reason: `進貨單金額為 0，應付 ${ap.payable_no} 未同步` }
  }

  const v = (order as any).vendors
  const vendorTerms = (Array.isArray(v) ? v[0]?.payment_terms : v?.payment_terms) ?? null
  const terms = order.payment_terms || vendorTerms || ''

  const { error: upErr } = await supabase.from('payables').update({
    amount,
    due_date: calcDueDate(order.purchase_date, terms),
  }).eq('id', ap.id)
  if (upErr) return { status: 'error', message: `同步應付失敗：${upErr.message}` }

  return { status: 'created', message: `應付 ${ap.payable_no} 金額已同步為 ${amount.toLocaleString()}` }
}

/**
 * 進貨單內容被修改後，比對「已記錄的庫存異動」與「目前品項」，補一筆差額異動。
 * 只在該進貨單已入過庫時作用；差額為 0 則不動。
 */
export async function reconcileStockForPurchase(
  supabase: SupabaseClient, purchaseId: string,
): Promise<LedgerResult> {
  const { data: order } = await supabase
    .from('purchases').select('id, purchase_no, vendor_id').eq('id', purchaseId).single()
  if (!order) return { status: 'error', message: '讀取進貨單失敗' }

  const { data: txns, error: txErr } = await supabase
    .from('inventory_transactions').select('product_id, quantity, warehouse_id')
    .eq('reference_no', order.purchase_no)
  if (txErr) return { status: 'error', message: `查詢庫存異動失敗：${txErr.message}` }
  if (!txns || txns.length === 0) return { status: 'skipped' }  // 尚未入庫，不需調整

  const recorded = new Map<string, number>()
  for (const t of txns) {
    if (!t.product_id) continue
    const key = `${t.product_id}::${t.warehouse_id ?? ''}`
    recorded.set(key, (recorded.get(key) ?? 0) + Number(t.quantity || 0))
  }

  const { data: items } = await supabase
    .from('purchase_items').select('product_id, quantity, unit_price, warehouse_id')
    .eq('purchase_id', purchaseId).not('product_id', 'is', null)

  const desired = new Map<string, number>()
  const costs = new Map<string, number>()
  for (const i of items ?? []) {
    if (!i.product_id) continue
    const key = `${i.product_id}::${i.warehouse_id ?? ''}`
    desired.set(key, (desired.get(key) ?? 0) + (Number(i.quantity) || 0))
    costs.set(key, Number(i.unit_price) || 0)
  }

  const rows: any[] = []
  const stockKeys = new Set<string>([...recorded.keys(), ...desired.keys()])
  for (const key of Array.from(stockKeys)) {
    const [pid, warehouseId] = key.split('::')
    const delta = (desired.get(key) ?? 0) - (recorded.get(key) ?? 0)
    if (Math.abs(delta) < 0.0001) continue
    rows.push({
      product_id: pid,
      type: delta > 0 ? '入庫' : '出庫',
      quantity: delta,
      unit_cost: delta > 0 ? (costs.get(key) || null) : null,
      warehouse_id: warehouseId || null,
      reference_no: order.purchase_no,
      vendor_id: order.vendor_id ?? null,
      notes: `進貨單 ${order.purchase_no} 修改後庫存差額調整（${delta > 0 ? '+' : ''}${delta}）`,
    })
  }
  if (rows.length === 0) return { status: 'exists' }

  const { error } = await supabase.from('inventory_transactions').insert(rows)
  if (error) return { status: 'error', message: `庫存差額調整失敗：${error.message}` }

  return { status: 'created', message: `已補 ${rows.length} 筆庫存差額調整` }
}

/**
 * 進貨單退回草稿／取消時，自動作廢該單「尚未付款」的自動應付。
 * 已有付款紀錄者不動，避免破壞帳務。
 */
export async function voidPayableForPurchase(
  supabase: SupabaseClient, purchaseId: string, status: string,
): Promise<LedgerResult> {
  if (!PURCHASE_INACTIVE_STATUSES.includes(status)) return { status: 'skipped' }

  const { data: rows, error } = await supabase
    .from('payables').select('id, payable_no, paid_amount, status').eq('purchase_id', purchaseId)
  if (error) return { status: 'error', message: `查詢應付失敗：${error.message}` }

  const targets = (rows ?? []).filter(p => Number(p.paid_amount) === 0 && p.status !== '作廢')
  if (targets.length === 0) return { status: 'skipped' }

  const { error: upErr } = await supabase
    .from('payables').update({ status: '作廢' }).in('id', targets.map(t => t.id))
  if (upErr) return { status: 'error', message: `作廢應付失敗：${upErr.message}` }

  return { status: 'created', message: `已作廢應付 ${targets.map(t => t.payable_no).join('、')}` }
}
