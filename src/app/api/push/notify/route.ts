import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'

export const runtime = 'nodejs'

// VAPID 公鑰為公開資訊，可寫在程式；私鑰放 Vercel 環境變數 VAPID_PRIVATE_KEY
const VAPID_PUBLIC = 'BP8BPVI8pIT3sqDQp2rq4Y76NW3vQG4y3DaI9I72xVn-kcrsXc66UV7frGxC0lnWJCTPdoq-NLs8aBKOq84imzI'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!priv) return NextResponse.json({ error: '尚未設定 VAPID_PRIVATE_KEY' }, { status: 500 })

  const sb = admin()
  if (!sb) return NextResponse.json({ error: '尚未設定 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = await sb.auth.getUser(token ?? '')
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { threadId, title, body, url } = await req.json().catch(() => ({}))
  if (!threadId) return NextResponse.json({ error: '缺少 threadId' }, { status: 400 })

  // 對話成員（排除自己）
  const { data: members } = await sb.from('chat_members').select('user_id').eq('thread_id', threadId).neq('user_id', user.id)
  const ids = (members ?? []).map((m: any) => m.user_id)
  if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const { data: subs } = await sb.from('push_subscriptions').select('subscription').in('user_id', ids)
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  webpush.setVapidDetails('mailto:admin@av-shop.com', VAPID_PUBLIC, priv)
  const payload = JSON.stringify({
    title: title || '光輝 CRM',
    body: body || '你有一則新訊息',
    url: url || '/messages',
    tag: 'thread-' + threadId,
  })

  const results = await Promise.allSettled(
    subs.map((s: any) => webpush.sendNotification(s.subscription, payload)),
  )
  // 清掉失效的訂閱（410 Gone）
  const gone = results
    .map((r, i) => (r.status === 'rejected' && (r.reason?.statusCode === 410 || r.reason?.statusCode === 404) ? i : -1))
    .filter(i => i >= 0)
  if (gone.length) {
    const endpoints = gone.map(i => (subs[i] as any).subscription?.endpoint).filter(Boolean)
    if (endpoints.length) await sb.from('push_subscriptions').delete().in('endpoint', endpoints)
  }

  return NextResponse.json({ ok: true, sent: subs.length })
}
