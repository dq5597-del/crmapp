import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/accounting/pnl?year=2026
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const year = Number(req.nextUrl.searchParams.get('year') || new Date().getFullYear())

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  // 收入：從 quotes 抓已確認/已完成的報價單
  const { data: quotes, error: qErr } = await supabase
    .from('quotes')
    .select('total_amount, created_at, status')
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59')
    .in('status', ['已確認', '已完成', '已結案'])

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  // 支出
  const { data: expenses, error: eErr } = await supabase
    .from('accounting_expenses')
    .select('untaxed_amount, tax_amount, total_amount, category, invoice_date')
    .eq('year', year)

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  // 整理：依月份分組
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const revenueByMonth: Record<number, number> = {}
  months.forEach(m => { revenueByMonth[m] = 0 })
  ;(quotes || []).forEach(q => {
    const m = new Date(q.created_at).getMonth() + 1
    revenueByMonth[m] = (revenueByMonth[m] || 0) + Number(q.total_amount)
  })

  const expenseByMonth: Record<number, number> = {}
  const expenseByCategory: Record<string, number> = {}
  months.forEach(m => { expenseByMonth[m] = 0 })
  ;(expenses || []).forEach(e => {
    const m = e.invoice_date ? new Date(e.invoice_date).getMonth() + 1 : 0
    if (m > 0) expenseByMonth[m] = (expenseByMonth[m] || 0) + Number(e.untaxed_amount)
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.untaxed_amount)
  })

  // 雙月分組
  const bimonthly = [
    { label: '1-2月', months: [1, 2] },
    { label: '3-4月', months: [3, 4] },
    { label: '5-6月', months: [5, 6] },
    { label: '7-8月', months: [7, 8] },
    { label: '9-10月', months: [9, 10] },
    { label: '11-12月', months: [11, 12] },
  ].map(g => ({
    label: g.label,
    revenue: g.months.reduce((s, m) => s + (revenueByMonth[m] || 0), 0),
    expense: g.months.reduce((s, m) => s + (expenseByMonth[m] || 0), 0),
  }))

  const totalRevenue = Object.values(revenueByMonth).reduce((a, b) => a + b, 0)
  const totalExpense = Object.values(expenseByMonth).reduce((a, b) => a + b, 0)
  const netProfit = totalRevenue - totalExpense
  const netMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0

  return NextResponse.json({
    year,
    totalRevenue,
    totalExpense,
    netProfit,
    netMargin,
    revenueByMonth,
    expenseByMonth,
    expenseByCategory,
    bimonthly,
  })
}
