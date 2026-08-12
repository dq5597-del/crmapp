import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char))
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { to, title, message, url } = await request.json()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to ?? '')) return NextResponse.json({ error: '收件 Email 格式不正確' }, { status: 400 })
  if (!/^https?:\/\//.test(url ?? '')) return NextResponse.json({ error: '分享網址不正確' }, { status: 400 })
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ error: '尚未設定寄信服務 RESEND_API_KEY' }, { status: 500 })
  const from = process.env.FROM_EMAIL ?? '光輝影音科技 <onboarding@resend.dev>'
  const safeTitle = escapeHtml(String(title || '產品型錄'))
  const safeMessage = escapeHtml(String(message || '')).replace(/\n/g, '<br>')
  const safeUrl = escapeHtml(String(url))

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[光輝影音科技] ${String(title || '產品型錄')}`,
      html: `<div style="font-family:Arial,'Noto Sans TC',sans-serif;max-width:640px;margin:auto;color:#1e293b"><h2>${safeTitle}</h2><p style="line-height:1.8">${safeMessage}</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 22px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:10px">開啟產品型錄</a></p><p style="font-size:12px;color:#94a3b8;margin-top:28px">此郵件由光輝影音科技行政系統寄送</p></div>`,
    }),
  })
  if (!response.ok) return NextResponse.json({ error: await response.text() }, { status: 500 })
  return NextResponse.json({ success: true })
}
