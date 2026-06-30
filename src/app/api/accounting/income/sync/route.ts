import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/accounting/income/sync
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { year } = await req.json()
  const targetYear = year || new Date().getFullYear()

  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`

  const { data: quotes, error: qErr } = await supabase
    .from('quotes')
    .select('id, quote_no, total_amount, created_at, status, client:clients(company_name)')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .in('status', ['已確認', '已完成', '已結案'])

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const { data: existing } = await supabase
    .from('accounting_income')
    .select('source_id')
    .eq('source_type', 'quote')
    .eq('year', targetYear)

  const existingIds = new Set((existing || []).map((e: any) => e.source_id))

  const toInsert = (quotes || [])
    .filter((q: any) => !existingIds.has(q.id))
    .map((q: any) => {
      const total = Number(q.total_amount) || 0
      const untaxed = Math.round(total / 1.05 * 100) / 100
      const tax = Math.round((total - untaxed) * 100) / 100
      const date = q.created_at?.split('T')[0] || startDate
      const clientName = q.client?.company_name || ''
      return {
        invoice_date: date,
        client_name: clientName,
        description: `報價單 ${q.quote_no}`,
        category: '銷售收入',
        untaxed_amount: untaxed,
        tax_amount: tax,
        total_amount: total,
        source_type: 'quote',
        source_id: q.id,
        year: targetYear,
        invoice_type: '三聯式',
      }
    })

  if (toInsert.length === 0) return NextResponse.json({ imported: 0, message: '無新報價單可匯入' })

  const { error: insertErr } = await supabase.from('accounting_income').insert(toInsert)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ imported: toInsert.length })
}
