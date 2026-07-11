import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/shipments/sign
 * body: { token, signer_name, sign_note? }
 * 公開簽收（客戶用追蹤連結，不需登入）
 */
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { token, signer_name, sign_note } = await req.json()

  if (!token) return NextResponse.json({ error: '缺少追蹤碼' }, { status: 400 })
  if (!signer_name?.trim()) return NextResponse.json({ error: '請填寫簽收人姓名' }, { status: 400 })

  const { data: sh } = await supabase
    .from('shipments').select('id, status, signed_at').eq('track_token', token).maybeSingle()
  if (!sh) return NextResponse.json({ error: '追蹤連結無效' }, { status: 404 })
  if (sh.signed_at) return NextResponse.json({ error: '這張出貨單已經簽收過了' }, { status: 409 })
  if (sh.status === '取消') return NextResponse.json({ error: '這張出貨單已取消' }, { status: 409 })

  const { error } = await supabase.from('shipments').update({
    status: '已簽收',
    signed_at: new Date().toISOString(),
    signer_name: signer_name.trim(),
    sign_note: sign_note?.trim() || null,
    delivered_date: new Date().toISOString().slice(0, 10),
  }).eq('id', sh.id)

  if (error) return NextResponse.json({ error: '簽收失敗：' + error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
