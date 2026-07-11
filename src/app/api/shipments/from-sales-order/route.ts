import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/** 產生出貨單號 SH-YYMMDD-001 */
async function nextShipmentNo(supabase: any) {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const prefix = `SH-${yy}${mm}${dd}-`
  const { count } = await supabase
    .from('shipments').select('id', { count: 'exact', head: true }).like('shipment_no', `${prefix}%`)
  return { prefix, seq: (count ?? 0) + 1 }
}

/**
 * POST /api/shipments/from-sales-order
 * body: { sales_order_id }
 * 由銷貨單產生出貨單：只帶「尚未出貨」的數量（支援分批出貨）。
 */
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { sales_order_id } = await req.json()
  if (!sales_order_id) return NextResponse.json({ error: '缺少 sales_order_id' }, { status: 400 })

  // 1) 讀銷貨單 + 品項
  const [{ data: so }, { data: soItems }] = await Promise.all([
    supabase.from('sales_orders').select('*, clients(company_name, phone, address)').eq('id', sales_order_id).single(),
    supabase.from('sales_order_items').select('*').eq('order_id', sales_order_id).order('seq_no'),
  ])
  if (!so) return NextResponse.json({ error: '找不到銷貨單' }, { status: 404 })

  // 2) 算每個品項已出貨數量
  const { data: prevShipments } = await supabase
    .from('shipments').select('id').eq('sales_order_id', sales_order_id).neq('status', '取消')
  const shipIds = (prevShipments ?? []).map((s: any) => s.id)

  const shippedMap: Record<string, number> = {}
  if (shipIds.length) {
    const { data: prevItems } = await supabase
      .from('shipment_items').select('sales_order_item_id, quantity').in('shipment_id', shipIds)
    ;(prevItems ?? []).forEach((it: any) => {
      if (!it.sales_order_item_id) return
      shippedMap[it.sales_order_item_id] = (shippedMap[it.sales_order_item_id] ?? 0) + Number(it.quantity ?? 0)
    })
  }

  // 3) 只帶未出貨的剩餘量
  const pending = (soItems ?? []).map((it: any) => {
    const already = shippedMap[it.id] ?? 0
    const remain = Number(it.quantity ?? 0) - already
    return { it, remain }
  }).filter(x => x.remain > 0)

  if (pending.length === 0) {
    return NextResponse.json({ error: '這張銷貨單的品項都已全部出貨' }, { status: 409 })
  }

  // 4) 建出貨單（撞號重試）
  const { prefix, seq: startSeq } = await nextShipmentNo(supabase)
  let seq = startSeq
  let created: any = null

  const base = {
    sales_order_id,
    client_id: so.client_id ?? null,
    project_name: so.project_name ?? null,
    status: '待出貨',
    deduct_stock: true,
    delivery_method: '自送',
    receiver_name: so.contact_name ?? (so as any).clients?.company_name ?? null,
    receiver_phone: so.client_phone ?? (so as any).clients?.phone ?? null,
    address: so.delivery_address ?? (so as any).clients?.address ?? null,
    expected_date: so.delivery_date ?? null,
  }

  for (let i = 0; i < 5; i++) {
    const shipment_no = `${prefix}${String(seq).padStart(3, '0')}`
    const { data, error } = await supabase.from('shipments').insert({ ...base, shipment_no }).select('id, shipment_no').single()
    if (!error && data) { created = data; break }
    if ((error as any)?.code === '23505') { seq += 1; continue }
    return NextResponse.json({ error: '建立出貨單失敗：' + error?.message }, { status: 500 })
  }
  if (!created) return NextResponse.json({ error: '單號衝突，請重試' }, { status: 409 })

  // 5) 帶入品項
  const items = pending.map((x, idx) => ({
    shipment_id: created.id,
    seq_no: idx + 1,
    sales_order_item_id: x.it.id,
    product_id: x.it.product_id ?? null,
    product_name: x.it.product_name,
    model: x.it.model ?? null,
    unit: x.it.unit ?? null,
    quantity: x.remain,
    item_notes: x.it.item_notes ?? null,
  }))
  const { error: e2 } = await supabase.from('shipment_items').insert(items)
  if (e2) {
    await supabase.from('shipments').delete().eq('id', created.id)
    return NextResponse.json({ error: '帶入品項失敗：' + e2.message }, { status: 500 })
  }

  return NextResponse.json({ id: created.id, shipment_no: created.shipment_no })
}
