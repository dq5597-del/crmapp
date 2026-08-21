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

  // 取今天「最大」的流水號 +1。
  // ⚠ 不能用筆數 +1 —— 刪掉當天中間任何一張，下一張就會撞到已存在的號碼。
  const { data: last } = await supabase
    .from('quotes')
    .select('quote_no')
    .like('quote_no', `${prefix}%`)
    .order('quote_no', { ascending: false })
    .limit(1)

  const lastSeq = parseInt((last?.[0]?.quote_no ?? '').slice(6) || '0', 10)
  const seq = (isFinite(lastSeq) ? lastSeq : 0) + 1
  const quote_no = generateQuoteNo(today, seq)

  return NextResponse.json({ quote_no })
}
