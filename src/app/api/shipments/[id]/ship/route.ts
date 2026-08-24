import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/shipments/[id]/ship     → 確認出貨（扣庫存）
 * POST /api/shipments/[id]/ship  body:{ action: 'revert' } → 退回待出貨（沖銷庫存）
 *
 * 庫存由 inventory_transactions 的 trigger 計算，所以：
 *  - 出貨扣庫存 = 寫一筆「出庫」負數異動
 *  - 取消/退回  = 寫一筆「入庫」正數異動沖銷回來（原紀錄保留，審計軌跡完整）
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const body = await req.json().catch(() => ({}))
  const action = body?.action ?? 'ship'

  const { data: sh, error } = await supabase
    .from('shipments').select('*').eq('id', params.id).single()
  if (error || !sh) return NextResponse.json({ error: '找不到出貨單' }, { status: 404 })

  const { data: items } = await supabase
    .from('shipment_items').select('*').eq('shipment_id', params.id)

  // ── 沖銷（取消出貨）──
  if (action === 'revert') {
    if (sh.stock_deducted && (items ?? []).length) {
      const rows = (items ?? [])
        .filter((it: any) => it.product_id && Number(it.quantity) > 0)
        .map((it: any) => ({
          product_id: it.product_id,
          type: '入庫',
          quantity: Math.abs(Number(it.quantity)),
          reference_type: 'shipment',
          reference_id: sh.id,
          reference_no: sh.shipment_no,
          notes: `沖銷出貨單 ${sh.shipment_no}`,
        }))
      if (rows.length) {
        const { error: e } = await supabase.from('inventory_transactions').insert(rows)
        if (e) return NextResponse.json({ error: '沖銷庫存失敗：' + e.message }, { status: 500 })
      }
    }
    const { error: e2 } = await supabase.from('shipments')
      .update({ status: '待出貨', stock_deducted: false, delivered_date: null })
      .eq('id', sh.id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    return NextResponse.json({ ok: true, stock_reverted: !!sh.stock_deducted })
  }

  // ── 確認出貨 ──
  if (sh.status === '已出貨' || sh.stock_deducted) {
    return NextResponse.json({ error: '這張出貨單已經出貨過了' }, { status: 409 })
  }
  if (!(items ?? []).length) {
    return NextResponse.json({ error: '出貨單沒有品項' }, { status: 400 })
  }

  let deducted = false
  if (sh.deduct_stock) {
    const rows = (items ?? [])
      .filter((it: any) => it.product_id && Number(it.quantity) > 0)
      .map((it: any) => ({
        product_id: it.product_id,
        type: '出庫',
        quantity: -Math.abs(Number(it.quantity)),
        reference_type: 'shipment',
        reference_id: sh.id,
        reference_no: sh.shipment_no,
        notes: `出貨單 ${sh.shipment_no}`,
      }))
    if (rows.length) {
      const { error: e } = await supabase.from('inventory_transactions').insert(rows)
      if (e) return NextResponse.json({ error: '扣庫存失敗：' + e.message }, { status: 500 })
      deducted = true
    }
  }

  const { error: e2 } = await supabase.from('shipments').update({
    status: '已出貨',
    stock_deducted: deducted,
    ship_date: sh.ship_date ?? new Date().toISOString().slice(0, 10),
  }).eq('id', sh.id)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ ok: true, stock_deducted: deducted })
}
