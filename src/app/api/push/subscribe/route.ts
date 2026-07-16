import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const sb = admin()
  if (!sb) return NextResponse.json({ error: '系統尚未設定 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = await sb.auth.getUser(token ?? '')
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sub = body?.subscription
  if (!sub?.endpoint) return NextResponse.json({ error: '缺少 subscription' }, { status: 400 })

  const { error } = await sb.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: sub.endpoint, subscription: sub },
    { onConflict: 'endpoint' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
