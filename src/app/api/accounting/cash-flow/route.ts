import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/accounting/cash-flow?year=2026
//
// 現金流量表（間接法）：
//   營業活動之現金流量 = 本期淨利（系統自動帶入，來自損益表）+ 使用者自訂調整項目
//   投資活動之現金流量 = 使用者自訂項目
//   籌資活動之現金流量 = 使用者自訂項目
//   本期現金增減淨額 = 三大活動合計
//   期末現金餘額 = 期初現金餘額 + 本期現金增減淨額

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

  // fallback：若 income 表完全沒資料，則從 quotes 抓（向後相容，一律視為營業收入），比照損益表 API 的做法
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

  // upsert 系統列「本期淨利」（每年度一筆，金額永遠等於損益表計算值）
  const { data: existingNetIncomeRow } = await supabase
    .from('cash_flow_accounts')
    .select('id')
    .eq('year', year)
    .eq('system_key', 'net_income')
    .maybeSingle()

  if (existingNetIncomeRow) {
    await supabase.from('cash_flow_accounts').update({ amount: netIncome }).eq('id', existingNetIncomeRow.id)
  } else {
    await supabase.from('cash_flow_accounts').insert({
      year, section: 'operating', name: '本期淨利', amount: netIncome,
      is_system: true, system_key: 'net_income', sort_order: 0,
    })
  }

  const [{ data: accounts, error }, { data: settingsRow }] = await Promise.all([
    supabase.from('cash_flow_accounts').select('*').eq('year', year).order('section').order('sort_order'),
    supabase.from('cash_flow_settings').select('*').eq('year', year).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  function sectionTotal(section: string) {
    return (accounts || []).filter((a: any) => a.section === section).reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0)
  }

  const operatingTotal = sectionTotal('operating')
  const investingTotal = sectionTotal('investing')
  const financingTotal = sectionTotal('financing')
  const netChange = operatingTotal + investingTotal + financingTotal

  const beginningCash = Number(settingsRow?.beginning_cash) || 0
  const endingCash = beginningCash + netChange

  return NextResponse.json({
    year,
    accounts: accounts || [],
    operatingTotal,
    investingTotal,
    financingTotal,
    netChange,
    beginningCash,
    endingCash,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { year, section, name, amount } = await req.json()
  const { data: existing } = await supabase
    .from('cash_flow_accounts')
    .select('sort_order')
    .eq('year', year)
    .eq('section', section)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sort_order = ((existing?.[0]?.sort_order) || 0) + 1
  const { data, error } = await supabase
    .from('cash_flow_accounts')
    .insert({ year, section, name, amount: amount ?? 0, is_system: false, system_key: null, sort_order })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()

  // 更新期初現金餘額
  if (body.beginningCash !== undefined && body.year !== undefined) {
    const { data, error } = await supabase
      .from('cash_flow_settings')
      .upsert({ year: body.year, beginning_cash: body.beginningCash }, { onConflict: 'year' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data })
  }

  // 更新單一科目（系統列「本期淨利」不可手動修改金額）
  const { id, name, amount } = body
  const { data: acc } = await supabase.from('cash_flow_accounts').select('is_system').eq('id', id).single()
  if (acc?.is_system) {
    return NextResponse.json({ error: '本期淨利為系統自動帶入，無法手動修改' }, { status: 400 })
  }
  const payload: Record<string, unknown> = {}
  if (name !== undefined) payload.name = name
  if (amount !== undefined) payload.amount = amount
  const { data, error } = await supabase
    .from('cash_flow_accounts')
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
  const { data: acc } = await supabase.from('cash_flow_accounts').select('is_system').eq('id', id).single()
  if (acc?.is_system) {
    return NextResponse.json({ error: '系統科目無法刪除' }, { status: 400 })
  }
  const { error } = await supabase.from('cash_flow_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
