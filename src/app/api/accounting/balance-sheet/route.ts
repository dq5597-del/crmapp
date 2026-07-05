import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/accounting/balance-sheet
//
// 資產負債表科目，section 七種分類：
//   current_asset / noncurrent_asset / current_liability / noncurrent_liability
//   share_capital / capital_surplus / retained_earnings
//
// 系統科目（system_key）balance 為 null 時採用系統自動計算值：
//   receivables       → 應收帳款未收餘額合計
//   payables          → 應付帳款未付餘額合計
//   inventory         → 庫存價值合計（stock_qty * cost_price）
//   retained_earnings → 累計淨利（所有年度損益表淨利加總）

async function computeLiveValues(supabase: ReturnType<typeof createClient>) {
  const [{ data: receivables }, { data: payables }, { data: products }] = await Promise.all([
    supabase.from('receivables').select('balance, status'),
    supabase.from('payables').select('balance, status'),
    supabase.from('products').select('stock_qty, cost_price').eq('is_active', true),
  ])

  const receivablesTotal = (receivables || [])
    .filter((r: any) => r.status !== '已收清' && r.status !== '壞帳')
    .reduce((s: number, r: any) => s + (Number(r.balance) || 0), 0)

  const payablesTotal = (payables || [])
    .filter((p: any) => p.status !== '已付清' && p.status !== '作廢')
    .reduce((s: number, p: any) => s + (Number(p.balance) || 0), 0)

  const inventoryTotal = (products || [])
    .reduce((s: number, p: any) => s + (Number(p.stock_qty) || 0) * (Number(p.cost_price) || 0), 0)

  // 累計淨利：加總所有年度的損益（不分年份，一次算到底）
  const [{ data: incomeCats }, { data: expenseCats }, { data: allIncome }, { data: allExpenses }] = await Promise.all([
    supabase.from('accounting_income_categories').select('name, kind'),
    supabase.from('accounting_expense_categories').select('name, kind'),
    supabase.from('accounting_income').select('untaxed_amount, category'),
    supabase.from('accounting_expenses').select('untaxed_amount, category'),
  ])
  const incomeKindMap: Record<string, string> = {}
  ;(incomeCats || []).forEach((c: any) => { incomeKindMap[c.name] = c.kind || 'revenue' })
  const expenseKindMap: Record<string, string> = {}
  ;(expenseCats || []).forEach((c: any) => { expenseKindMap[c.name] = c.kind || 'opex' })

  let revenue = 0, nonopIncome = 0
  ;(allIncome || []).forEach((r: any) => {
    const kind = incomeKindMap[r.category] || 'revenue'
    const amount = Number(r.untaxed_amount) || 0
    if (kind === 'nonop_income') nonopIncome += amount
    else revenue += amount
  })

  let cogs = 0, opex = 0, nonopExpense = 0, tax = 0
  ;(allExpenses || []).forEach((e: any) => {
    const kind = expenseKindMap[e.category] || 'opex'
    const amount = Number(e.untaxed_amount) || 0
    if (kind === 'cogs') cogs += amount
    else if (kind === 'nonop_expense') nonopExpense += amount
    else if (kind === 'tax') tax += amount
    else opex += amount
  })

  const retainedEarningsTotal = revenue - cogs - opex + (nonopIncome - nonopExpense) - tax

  return {
    receivables: receivablesTotal,
    payables: payablesTotal,
    inventory: inventoryTotal,
    retained_earnings: retainedEarningsTotal,
  } as Record<string, number>
}

export async function GET() {
  const supabase = createClient()

  const [{ data: accounts, error }, liveValues] = await Promise.all([
    supabase.from('balance_sheet_accounts').select('*').order('section').order('sort_order'),
    computeLiveValues(supabase),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const withDisplay = (accounts || []).map((a: any) => {
    const live = a.system_key ? liveValues[a.system_key] ?? 0 : null
    const isAuto = a.system_key && (a.balance === null || a.balance === undefined)
    const displayBalance = isAuto ? live : Number(a.balance) || 0
    return { ...a, displayBalance, isAuto: !!isAuto, liveValue: live }
  })

  function sectionTotal(section: string) {
    return withDisplay.filter(a => a.section === section).reduce((s, a) => s + a.displayBalance, 0)
  }

  const currentAssets = sectionTotal('current_asset')
  const nonCurrentAssets = sectionTotal('noncurrent_asset')
  const totalAssets = currentAssets + nonCurrentAssets

  const currentLiabilities = sectionTotal('current_liability')
  const nonCurrentLiabilities = sectionTotal('noncurrent_liability')
  const totalLiabilities = currentLiabilities + nonCurrentLiabilities

  const shareCapital = sectionTotal('share_capital')
  const capitalSurplus = sectionTotal('capital_surplus')
  const retainedEarnings = sectionTotal('retained_earnings')
  const totalEquity = shareCapital + capitalSurplus + retainedEarnings

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
  const balanceDiff = totalAssets - totalLiabilitiesAndEquity

  return NextResponse.json({
    accounts: withDisplay,
    currentAssets,
    nonCurrentAssets,
    totalAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    totalLiabilities,
    shareCapital,
    capitalSurplus,
    retainedEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    balanceDiff,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { section, name, balance } = await req.json()
  const { data: existing } = await supabase
    .from('balance_sheet_accounts')
    .select('sort_order')
    .eq('section', section)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sort_order = ((existing?.[0]?.sort_order) || 0) + 1
  const { data, error } = await supabase
    .from('balance_sheet_accounts')
    .insert({ section, name, balance: balance ?? 0, is_system: false, system_key: null, sort_order })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { id, name, balance, resetToAuto } = await req.json()
  const payload: Record<string, unknown> = {}
  if (name !== undefined) payload.name = name
  if (resetToAuto) payload.balance = null
  else if (balance !== undefined) payload.balance = balance
  const { data, error } = await supabase
    .from('balance_sheet_accounts')
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
  const { data: acc } = await supabase.from('balance_sheet_accounts').select('is_system').eq('id', id).single()
  if (acc?.is_system) {
    return NextResponse.json({ error: '系統科目無法刪除，可使用「還原自動」' }, { status: 400 })
  }
  const { error } = await supabase.from('balance_sheet_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
