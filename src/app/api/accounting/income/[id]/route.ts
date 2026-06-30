import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/accounting/income/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const body = await req.json()

  const untaxed = Number(body.untaxed_amount) || 0
  const tax = Math.round(untaxed * 0.05 * 100) / 100
  const total = untaxed + tax

  const { data, error } = await supabase
    .from('accounting_income')
    .update({ ...body, untaxed_amount: untaxed, tax_amount: tax, total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ income: data })
}

// DELETE /api/accounting/income/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { error } = await supabase.from('accounting_income').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
