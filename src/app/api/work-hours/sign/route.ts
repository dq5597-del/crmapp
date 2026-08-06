import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/work-hours/sign
 * body: { token, signer_name, signature_data, sign_note? }
 * 公開簽名（師傅用連結，不需登入）
 */
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { token, signer_name, signature_data, sign_note } = await req.json()

  if (!token) return NextResponse.json({ error: '缺少簽名碼' }, { status: 400 })
  if (!signature_data?.startsWith('data:image/')) {
    return NextResponse.json({ error: '簽名內容無效' }, { status: 400 })
  }

  const { data: c } = await supabase
    .from('work_hour_confirmations')
    .select('id, status, signed_at, person_name, period_month')
    .eq('sign_token', token).maybeSingle()

  if (!c) return NextResponse.json({ error: '簽名連結無效' }, { status: 404 })
  if (c.status === '作廢') return NextResponse.json({ error: '這張確認單已作廢' }, { status: 409 })
  if (c.signed_at) return NextResponse.json({ error: '這張確認單已經簽過了' }, { status: 409 })

  // SignaturePad 的姓名欄是選填，沒填就用確認單上的本人姓名
  const { error } = await supabase.from('work_hour_confirmations').update({
    status: '已簽名',
    signature_data,
    signer_name: signer_name?.trim() || c.person_name,
    signed_at: new Date().toISOString(),
    sign_note: sign_note?.trim() || null,
  }).eq('id', c.id)

  if (error) return NextResponse.json({ error: '簽名失敗：' + error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
