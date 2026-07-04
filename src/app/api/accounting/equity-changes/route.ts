import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/accounting/equity-changes?year=2026
//
// 權益變動表：
//   權益種類（欄）：股本 share_capital／資本公積 capital_surplus／保留盈餘 retained_earnings
//   變動項目（列）：「本期淨利」（僅 retained_earnings，系統自動帶入，來自損益表）
//                    + 使用者自訂調整項目（現金股利分派、增資、提列公積等）
//   期末餘額 = 期初餘額 + 該權益種類所有變動項目加總

async function computeNetIncome(supabase: ReturnType<typeof createClient>, year: number) {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const [{ data: incomeCats }, { data: expenseCats }, { data: incomeRows, error: iErr }, { data: expenses }] = await Promise.all([
    supabase.from('accounting_income_categories').select('name, kind'),
    supabase.from('accounting_expense_categories').select('name, kind'),
    supabase.from('accounting_income').select('untaxed_amount, category').eq('year', year),
    supabase.from('accounting_expenses').select('untaxed_amount, category').eq('year', year),
  ])
  const incomeKindMap: Record<string, string> = {}
  ;(incomeCats || []).forEach((c: any) => { incomeKindMap[c.name] = c.kind || 'revenue' })
  const expenseKindMap: Record<string, string> = {}
  ;(expenseCats || []).forEach((c: any) => { expenseKindMap[c.name] = c.kind || 'opex' })

  const useQuotesFallback = !iErr && (!incomeRows || incomeRows.length === 0)
  const { data: quotes } = useQuotesFallback
    ? await supabase
        .from('quotes')
        .select('total_amount, created_at, status')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .in('status', ['已確認', '已完成', '已結案'])
    : { data: [] as any[] }

  let revenue = 0, nonopIncome = 0
  if (!useQuotesFallback) {
    ;(incomeRows || []).forEach((r: any) => {
      const kind = incomeKindMap[r.category] || 'revenue'
      const amount = Number(r.untaxed_amount) || 0
      if (kind === 'nonop_income') nonopIncome += amount
      else revenue += amount
    })
  } else {
    ;(quotes || []).forEach((q: any) => {
      revenue += Number(q.total_amount) || 0
    })
  }

  let cogs = 0, opex = 0, nonopExpense = 0, tax = 0
  ;(expenses || []).forEach((e: any) => {
    const kind = expenseKindMap[e.category] || 'opex'
    const amount = Number(e.untaxed_amount) || 0
    if (kind === 'cogs') cogs += amount
    else if (kind === 'nonop_expense') nonopExpense += amount
    else if (kind === 'tax') tax += amount
    else opex += amount
  })

  return revenue - cogs - opex + (nonopIncome - nonopExpense) - tax
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const year = Number(req.nextUrl.searchParams.get('year') || new Date().getFullYear())

  const netIncome = await computeNetIncome(supabase, year)

  // upsert 系統列「本期淨利」（保留盈餘種類，每年度一筆）
  const { data: existingNetIncomeRow } = await supabase
    .from('equity_changes_accounts')
    .select('id')
    .eq('year', year)
    .eq('system_key', 'net_income')
    .maybeSingle()

  if (existingNetIncomeRow) {
    await supabase.from('equity_changes_accounts').update({ amount: netIncome }).eq('id', existingNetIncomeRow.id)
  } else {
    await supabase.from('equity_changes_accounts').insert({
      year, category: 'retained_earnings', name: '本期淨利', amount: netIncome,
      is_system: true, system_key: 'net_income', sort_order: 0,
    })
  }

  const [{ data: accounts, error }, { data: beginningRow }] = await Promise.all([
    supabase.from('equity_changes_accounts').select('*').eq('year', year).order('category').order('sort_order'),
    supabase.from('equity_changes_beginning').select('*').eq('year', year).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  function categoryTotal(category: string) {
    return (accounts || []).filter((a: any) => a.category === category).reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0)
  }

  const shareCapitalBeginning = Number(beginningRow?.share_capital_beginning) || 0
  const capitalSurplusBeginning = Number(beginningRow?.capital_surplus_beginning) || 0
  const retainedEarningsBeginning = Number(beginningRow?.retained_earnings_beginning) || 0

  const shareCapitalChange = categoryTotal('share_capital')
  const capitalSurplusChange = categoryTotal('capital_surplus')
  const retainedEarningsChange = categoryTotal('retained_earnings')

  const shareCapitalEnding = shareCapitalBeginning + shareCapitalChange
  const capitalSurplusEnding = capitalSurplusBeginning + capitalSurplusChange
  const retainedEarningsEnding = retainedEarningsBeginning + retainedEarningsChange

  const totalBeginning = shareCapitalBeginning + capitalSurplusBeginning + retainedEarningsBeginning
  const totalChange = shareCapitalChange + capitalSurplusChange + retainedEarningsChange
  const totalEnding = shareCapitalEnding + capitalSurplusEnding + retainedEarningsEnding

  return NextResponse.json({
    year,
    accounts: accounts || [],
    shareCapitalBeginning, capitalSurplusBeginning, retainedEarningsBeginning,
    shareCapitalChange, capitalSurplusChange, retainedEarningsChange,
    shareCapitalEnding, capitalSurplusEnding, retainedEarningsEnding,
    totalBeginning, totalChange, totalEnding,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { year, category, name, amount } = await req.json()
  const { data: existing } = await supabase
    .from('equity_changes_accounts')
    .select('sort_order')
    .eq('year', year)
    .eq('category', category)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sort_order = ((existing?.[0]?.sort_order) || 0) + 1
  const { data, error } = await supabase
    .from('equity_changes_accounts')
    .insert({ year, category, name, amount: amount ?? 0, is_system: false, system_key: null, sort_order })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()

  // 更新期初餘額
  if (body.year !== undefined && (body.shareCapitalBeginning !== undefined || body.capitalSurplusBeginning !== undefined || body.retainedEarningsBeginning !== undefined)) {
    const payload: Record<string, unknown> = { year: body.year }
    if (body.shareCapitalBeginning !== undefined) payload.share_capital_beginning = body.shareCapitalBeginning
    if (body.capitalSurplusBeginning !== undefined) payload.capital_surplus_beginning = body.capitalSurplusBeginning
    if (body.retainedEarningsBeginning !== undefined) payload.retained_earnings_beginning = body.retainedEarningsBeginning
    const { data, error } = await supabase
      .from('equity_changes_beginning')
      .upsert(payload, { onConflict: 'year' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ beginning: data })
  }

  // 更新單一變動項目（系統列「本期淨利」不可手動修改金額）
  const { id, name, amount } = body
  const { data: acc } = await supabase.from('equity_changes_accounts').select('is_system').eq('id', id).single()
  if (acc?.is_system) {
    return NextResponse.json({ error: '本期淨利為系統自動帶入，無法手動修改' }, { status: 400 })
  }
  const payload: Record<string, unknown> = {}
  if (name !== undefined) payload.name = name
  if (amount !== undefined) payload.amount = amount
  const { data, error } = await supabase
    .from('equity_changes_accounts')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { id } = await req.json()
  const { data: acc } = await supabase.from('equity_changes_accounts').select('is_system').eq('id', id).single()
  if (acc?.is_system) {
    return NextResponse.json({ error: '系統科目無法刪除' }, { status: 400 })
  }
  const { error } = await supabase.from('equity_changes_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
