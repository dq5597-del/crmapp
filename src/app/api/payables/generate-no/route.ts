import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const prefix = `AP-${yy}${mm}${dd}`

  const { count } = await supabase
    .from('payables')
    .select('id', { count: 'exact', head: true })
    .like('payable_no', `${prefix}%`)

  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return NextResponse.json({ payable_no: `${prefix}-${seq}` })
}
