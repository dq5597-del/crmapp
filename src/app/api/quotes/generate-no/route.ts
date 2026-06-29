import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateQuoteNo } from '@/lib/utils'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const prefix = `${yy}${mm}${dd}`

  // 找今天已有幾張報價單
  const { count } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .like('quote_no', `${prefix}%`)

  const seq = (count ?? 0) + 1
  const quote_no = generateQuoteNo(today, seq)

  return NextResponse.json({ quote_no })
}
