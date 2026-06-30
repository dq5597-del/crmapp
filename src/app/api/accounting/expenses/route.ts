import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/accounting/expenses?year=2026
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const year = req.nextUrl.searchParams.get('year') || new Date().getFullYear()

  const { data, error } = await supabase
    .from('accounting_expenses')
    .select('*')
    .eq('year', year)
    .order('invoice_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expenses: data })
}

// POST /api/accounting/expenses
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const body = await req.json()

  const untaxed = Number(body.untaxed_amount) || 0
  const tax = Math.round(untaxed * 0.05 * 100) / 100
  const total = untaxed + tax

  const { data, error } = await supabase
    .from('accounting_expenses')
    .insert({
      ...body,
      untaxed_amount: untaxed,
      tax_amount: tax,
      total_amount: total,
      year: body.year || new Date().getFullYear(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expense: data })
}
