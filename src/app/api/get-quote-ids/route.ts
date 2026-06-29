import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createClient()
  const { data } = await supabase
    .from('quotes')
    .select('id, quote_no')
    .eq('quote_no', '260603001')
    .limit(1)
  return NextResponse.json(data)
}
