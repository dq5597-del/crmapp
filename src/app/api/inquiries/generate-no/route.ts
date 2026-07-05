import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const prefix = `RFQ-${yy}${mm}${dd}-`

  const { data, error } = await supabase
    .from('inquiries')
    .select('inquiry_no')
    .like('inquiry_no', `${prefix}%`)
    .order('inquiry_no', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let seq = 1
  if (data && data.length > 0) {
    const last = data[0].inquiry_no
    const lastSeq = parseInt(last.split('-').pop() ?? '0', 10)
    seq = lastSeq + 1
  }

  const inquiryNo = `${prefix}${String(seq).padStart(3, '0')}`
  return NextResponse.json({ inquiry_no: inquiryNo })
}
