import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchDocData, buildEmailHtml, type DocType } from '@/lib/doc-export'

export const runtime = 'nodejs'

// POST /api/docs/[type]/[id]/send-email  body: { to: string }
// 通用單據寄送（訂購/退貨/出貨/詢價/銷貨），內文為品項明細 HTML
export async function POST(req: NextRequest, { params }: { params: { type: string; id: string } }) {
  const { to } = await req.json()
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: '請提供正確的收件 Email' }, { status: 400 })
  }
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  const FROM_EMAIL = process.env.FROM_EMAIL ?? 'CRM系統 <onboarding@resend.dev>'

  const supabase = createServerSupabaseClient()
  const data = await fetchDocData(supabase, params.type as DocType, params.id)
  if (!data) return NextResponse.json({ error: '找不到單據' }, { status: 404 })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `[${data.title}] ${data.docNo}（${data.companyName}）`,
      html: buildEmailHtml(data),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
