import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/accounting/pnl?year=2026
//
// 損益表科目分類：
//   收入科目 kind: 'revenue'（營業收入，預設）| 'nonop_income'（營業外收入）
//   支出科目 kind: 'cogs'（營業成本）| 'opex'（營業費用，預設）| 'nonop_expense'（營業外支出）| 'tax'（所得稅費用）
//
// 報表結構：
//   營業收入 - 營業成本 = 營業毛利
//   營業毛利 - 營業費用 = 營業淨利
//   營業淨利 + 營業外收入及支出（淨額） = 稅前淨利
//   稅前淨利 - 所得稅費用 = 本期（年度）淨利
//   本期（年度）淨利 / 流通股數 = 每股盈餘

type Bucket = 'revenue' | 'nonopIncome' | 'cogs' | 'opex' | 'nonopExpense' | 'tax'

function emptyMonths() {
  const m: Record<number, number> = {}
  for (let i = 1; i <= 12; i++) m[i] = 0
  return m
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const year = Number(req.nextUrl.searchParams.get('year') || new Date().getFullYear())

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  // 科目分類對照表
  const [{ data: incomeCats }, { data: expenseCats }, { data: settingsRow }] = await Promise.all([
    supabase.from('accounting_income_categories').select('name, kind'),
    supabase.from('accounting_expense_categories').select('name, kind'),
    supabase.from('system_settings').select('shares_outstanding').single(),
  ])
  const incomeKindMap: Record<string, string> = {}
  ;(incomeCats || []).forEach((c: any) => { incomeKindMap[c.name] = c.kind || 'revenue' })
  const expenseKindMap: Record<string, string> = {}
  ;(expenseCats || []).forEach((c: any) => { expenseKindMap[c.name] = c.kind || 'opex' })

  // 收入：優先使用 accounting_income 表（含手動 + 從報價單匯入）
  const { data: incomeRows, error: iErr } = await supabase
    .from('accounting_income')
    .select('untaxed_amount, total_amount, invoice_date, category')
    .eq('year', year)

  // fallback：若 income 表完全沒資料，則從 quotes 抓（向後相容，一律視為營業收入）
  const useQuotesFallback = !iErr && (!incomeRows || incomeRows.length === 0)

  const { data: quotes, error: qErr } = useQuotesFallback
    ? await supabase
        .from('quotes')
        .select('total_amount, created_at, status')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .in('status', ['已確認', '已完成', '已結案'])
    : { data: [], error: null }

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  // 支出
  const { data: expenses, error: eErr } = await supabase
    .from('accounting_expenses')
    .select('untaxed_amount, tax_amount, total_amount, category, invoice_date')
    .eq('year', year)

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  // 六個科目類型各自依月份分組
  const byMonth: Record<Bucket, Record<number, number>> = {
    revenue: emptyMonths(),
    nonopIncome: emptyMonths(),
    cogs: emptyMonths(),
    opex: emptyMonths(),
    nonopExpense: emptyMonths(),
    tax: emptyMonths(),
  }

  const incomeCategoryTotals: Record<string, { amount: number; kind: string }> = {}
  const expenseCategoryTotals: Record<string, { amount: number; kind: string }> = {}

  if (!useQuotesFallback) {
    ;(incomeRows || []).forEach((r: any) => {
      const m = r.invoice_date ? new Date(r.invoice_date).getMonth() + 1 : 0
      const kind = incomeKindMap[r.category] || 'revenue'
      const bucket: Bucket = kind === 'nonop_income' ? 'nonopIncome' : 'revenue'
      const amount = Number(r.untaxed_amount) || 0
      if (m > 0) byMonth[bucket][m] = (byMonth[bucket][m] || 0) + amount
      const key = r.category || '未分類'
      incomeCategoryTotals[key] = incomeCategoryTotals[key] || { amount: 0, kind }
      incomeCategoryTotals[key].amount += amount
    })
  } else {
    ;(quotes || []).forEach((q: any) => {
      const m = new Date(q.created_at).getMonth() + 1
      const amount = Number(q.total_amount) || 0
      byMonth.revenue[m] = (byMonth.revenue[m] || 0) + amount
      incomeCategoryTotals['報價單（自動帶入）'] = incomeCategoryTotals['報價單（自動帶入）'] || { amount: 0, kind: 'revenue' }
      incomeCategoryTotals['報價單（自動帶入）'].amount += amount
    })
  }

  ;(expenses || []).forEach((e: any) => {
    const m = e.invoice_date ? new Date(e.invoice_date).getMonth() + 1 : 0
    const kind = expenseKindMap[e.category] || 'opex'
    const bucket: Bucket = kind === 'cogs' ? 'cogs' : kind === 'nonop_expense' ? 'nonopExpense' : kind === 'tax' ? 'tax' : 'opex'
    const amount = Number(e.untaxed_amount) || 0
    if (m > 0) byMonth[bucket][m] = (byMonth[bucket][m] || 0) + amount
    const key = e.category || '未分類'
    expenseCategoryTotals[key] = expenseCategoryTotals[key] || { amount: 0, kind }
    expenseCategoryTotals[key].amount += amount
  })

  // 依期間（雙月／月）組出完整報表每一列
  function sumMonths(bucket: Bucket, months: number[]) {
    return months.reduce((s, m) => s + (byMonth[bucket][m] || 0), 0)
  }

  function buildPeriod(label: string, months: number[]) {
    const revenue = sumMonths('revenue', months)
    const cogs = sumMonths('cogs', months)
    const grossProfit = revenue - cogs
    const opex = sumMonths('opex', months)
    const operatingIncome = grossProfit - opex
    const nonopIncome = sumMonths('nonopIncome', months)
    const nonopExpense = sumMonths('nonopExpense', months)
    const nonopNet = nonopIncome - nonopExpense
    const pretaxIncome = operatingIncome + nonopNet
    const tax = sumMonths('tax', months)
    const netIncome = pretaxIncome - tax
    return { label, revenue, cogs, grossProfit, opex, operatingIncome, nonopNet, pretaxIncome, tax, netIncome }
  }

  const bimonthly = [
    { label: '1-2月', months: [1, 2] },
    { label: '3-4月', months: [3, 4] },
    { label: '5-6月', months: [5, 6] },
    { label: '7-8月', months: [7, 8] },
    { label: '9-10月', months: [9, 10] },
    { label: '11-12月', months: [11, 12] },
  ].map(g => buildPeriod(g.label, g.months))

  const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const monthly = MONTH_LABELS.map((label, i) => buildPeriod(label, [i + 1]))

  const totals = buildPeriod('全年', Array.from({ length: 12 }, (_, i) => i + 1))

  const sharesOutstanding = (settingsRow as any)?.shares_outstanding ?? null
  const eps = sharesOutstanding && Number(sharesOutstanding) > 0
    ? totals.netIncome / Number(sharesOutstanding)
    : null

  return NextResponse.json({
    year,
    // 全年彙總
    totalRevenue: totals.revenue,
    totalCogs: totals.cogs,
    grossProfit: totals.grossProfit,
    totalOpex: totals.opex,
    operatingIncome: totals.operatingIncome,
    nonopNet: totals.nonopNet,
    pretaxIncome: totals.pretaxIncome,
    totalTax: totals.tax,
    netIncome: totals.netIncome,
    sharesOutstanding,
    eps,
    // 期間明細（供表格欄位使用）
    bimonthly,
    monthly,
    // 科目明細（供「科目明細」清單使用）
    incomeCategoryDetail: Object.entries(incomeCategoryTotals)
      .map(([name, v]) => ({ name, amount: v.amount, kind: v.kind }))
      .sort((a, b) => b.amount - a.amount),
    expenseCategoryDetail: Object.entries(expenseCategoryTotals)
      .map(([name, v]) => ({ name, amount: v.amount, kind: v.kind }))
      .sort((a, b) => b.amount - a.amount),
  })
}
