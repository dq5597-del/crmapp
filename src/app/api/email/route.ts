import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { quote_no, client_name, total_amount, pdf_url, has_catalog } = body

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const BOSS_EMAIL = process.env.BOSS_EMAIL ?? 'dq5597@gmail.com'

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const subject = `[報價單] ${quote_no} — ${client_name}`
  const html = `
    <h2>📋 報價單通知</h2>
    <table style="border-collapse:collapse; font-family: sans-serif;">
      <tr><td style="padding:4px 12px 4px 0; color:#666;">報價單編號</td><td><strong>${quote_no}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">客戶</td><td>${client_name}</td></tr>
      <tr><td style="padding:4px 12px 4px 0; color:#666;">含稅總金額</td><td><strong>NT$${Number(total_amount).toLocaleString('zh-TW')}</strong></td></tr>
      ${has_catalog ? '<tr><td colspan="2" style="color:#2563eb; padding-top:8px;">⚠️ 此報價單含型錄/說明書附件，請確認附件後轉寄客戶</td></tr>' : ''}
    </table>
    ${pdf_url ? `<p style="margin-top:16px;"><a href="${pdf_url}" style="background:#2563eb;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;">查看報價單 PDF</a></p>` : ''}
    <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />
    <p style="color:#9ca3af; font-size:12px;">光輝影音科技 CRM 系統自動發送 — 請確認後再轉寄給客戶</p>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'CRM系統 <onboarding@resend.dev>',
      to: [BOSS_EMAIL],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
