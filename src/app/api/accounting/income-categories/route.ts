import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('accounting_income_categories')
    .select('*')
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { name } = await req.json()
  const { data: existing } = await supabase
    .from('accounting_income_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  const sort_order = ((existing?.[0]?.sort_order) || 0) + 1
  const { data, error } = await supabase
    .from('accounting_income_categories')
    .insert({ name, sort_order })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { id } = await req.json()
  const { error } = await supabase
    .from('accounting_income_categories')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
