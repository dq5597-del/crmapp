import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const prefix = `SVQ${yy}${mm}${dd}`

  const { data, error } = await supabase
    .from('service_repair_quotes')
    .select('repair_quote_no')
    .like('repair_quote_no', `${prefix}%`)
    .order('repair_quote_no', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let seq = 1
  if (data && data.length > 0) {
    const last = data[0].repair_quote_no
    const lastSeq = parseInt(last.slice(-3), 10)
    seq = lastSeq + 1
  }

  const repair_quote_no = `${prefix}${String(seq).padStart(3, '0')}`
  return NextResponse.json({ repair_quote_no })
}
