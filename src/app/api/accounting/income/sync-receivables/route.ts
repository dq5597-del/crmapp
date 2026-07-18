import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/accounting/income/sync-receivables
// 從應收帳款匯入為收入記錄（同一筆應收不重複匯入）
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { year } = await req.json()
  const targetYear = year || new Date().getFullYear()

  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31T23:59:59`

  const { data: recvs, error: rErr } = await supabase
    .from('receivables')
    .select('id, receivable_no, invoice_no, invoice_date, amount, received_amount, status, created_at, client:clients(company_name), payment_records(payment_date)')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .neq('status', '作廢')

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const { data: existing } = await supabase
    .from('accounting_income')
    .select('source_id')
    .eq('source_type', 'receivable')

  const existingIds = new Set((existing || []).map(e => e.source_id))

  const toInsert = (recvs || [])
    .filter(r => !existingIds.has(r.id) && Number(r.amount) > 0)
    .map(r => {
      const total = Number(r.amount) || 0
      const untaxed = Math.round(total / 1.05 * 100) / 100
      const tax = Math.round((total - untaxed) * 100) / 100
      const date = r.invoice_date || r.created_at?.split('T')[0] || startDate
      const clientName = (r.client as any)?.company_name || ''
      // 最後一次收款日（若已有收款）
      const payDates = ((r as any).payment_records || [])
        .map((p: any) => p.payment_date).filter(Boolean).sort()
      const collected = payDates.length > 0 ? payDates[payDates.length - 1] : null
      return {
        invoice_type: '三聯式',
        invoice_date: date,
        invoice_no: r.invoice_no || null,
        client_name: clientName,
        description: `應收帳款 ${r.receivable_no}`,
        category: '銷售收入',
        untaxed_amount: untaxed,
        tax_amount: tax,
        total_amount: total,
        collected_date: collected,
        source_type: 'receivable',
        source_id: r.id,
        year: Number(String(date).slice(0, 4)) || targetYear,
      }
    })

  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, message: '無新應收帳款可匯入' })
  }

  const { error: insertErr } = await supabase.from('accounting_income').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ imported: toInsert.length })
}
