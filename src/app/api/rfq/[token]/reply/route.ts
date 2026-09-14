import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const replySchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    vendor_price: z.number().finite().min(0).max(1_000_000_000).nullable(),
    lead_time_days: z.number().int().min(0).max(3650).nullable(),
    item_notes: z.string().trim().max(1000).nullable(),
  })).min(1).max(100),
}).refine(
  value => value.items.some(item => item.vendor_price !== null),
  { message: '請至少填寫一項單價' },
)

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (!z.string().uuid().safeParse(params.token).success) return json({ error: '詢價單不存在' }, 404)
  const supabase = createServerSupabaseClient()
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return json({ error: '資料格式錯誤' }, 400)
  }

  const parsed = replySchema.safeParse(rawBody)
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? '填寫資料不正確' }, 400)

  // 驗證權杖、期限、品項歸屬、寫入與鎖定都在同一個資料庫交易內完成，避免重複送出競態。
  const { data, error } = await supabase.rpc('submit_inquiry_reply', {
    p_fill_token: params.token,
    p_items: parsed.data.items,
  })

  if (error) {
    const knownMessage = /詢價單不存在|已鎖定或不可回覆|未設定回覆期限|已超過回覆期限|品項|有效單價|報價內容/.exec(error.message)?.[0]
    const forbidden = /詢價單不存在|已鎖定或不可回覆|未設定回覆期限|已超過回覆期限/.test(error.message)
    if (knownMessage) return json({ error: error.message }, forbidden ? 403 : 400)
    return json({ error: '送出失敗，請稍後再試' }, 500)
  }

  return json(data ?? { ok: true })
}
