import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServerSupabaseClient()

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id, status, token_locked, reply_deadline')
    .eq('fill_token', params.token)
    .single()

  if (!inquiry) return NextResponse.json({ error: '詢價單不存在' }, { status: 404 })
  if (inquiry.token_locked || inquiry.status === '已結案' || inquiry.status === '草稿') {
    return NextResponse.json({ error: '此詢價單已鎖定或不可回覆' }, { status: 403 })
  }
  const today = new Date().toISOString().split('T')[0]
  if (inquiry.reply_deadline && inquiry.reply_deadline < today) {
    return NextResponse.json({ error: '此詢價單已超過回覆期限' }, { status: 403 })
  }

  const body = await req.json()
  const items: { id: string; vendor_price: number | null; lead_time_days: number | null; item_notes: string | null }[] = body.items ?? []
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: '缺少品項資料' }, { status: 400 })
  }

  // 逐項更新（僅更新屬於此詢價單的品項）
  for (const it of items) {
    const update: Record<string, any> = {}
    if (it.vendor_price != null && !Number.isNaN(it.vendor_price)) update.vendor_price = it.vendor_price
    if (it.lead_time_days != null && !Number.isNaN(it.lead_time_days)) update.lead_time_days = it.lead_time_days
    if (it.item_notes) update.item_notes = it.item_notes
    if (Object.keys(update).length === 0) continue

    const { error } = await supabase
      .from('inquiry_items')
      .update(update)
      .eq('id', it.id)
      .eq('inquiry_id', inquiry.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error: e2 } = await supabase
    .from('inquiries')
    .update({
      status: '已回覆',
      token_locked: true,
      replied_at: new Date().toISOString(),
      reply_source: 'link',
    })
    .eq('id', inquiry.id)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
