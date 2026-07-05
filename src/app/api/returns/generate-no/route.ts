import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const returnType = searchParams.get('type') // '客戶退貨' | '供應商退貨'
  const prefixCode = returnType === '供應商退貨' ? 'SR' : 'CR'

  const supabase = createServerSupabaseClient()
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const prefix = `${prefixCode}-${yy}${mm}${dd}`

  const { count } = await supabase
    .from('returns')
    .select('id', { count: 'exact', head: true })
    .like('return_no', `${prefix}%`)

  const seq = String((count ?? 0) + 1).padStart(3, '0')
  return NextResponse.json({ return_no: `${prefix}-${seq}` })
}
