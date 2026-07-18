import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// POST /api/quotes/[id]/send-email  body: { to: string }
// 直接把報價單（品項明細內嵌 HTML）寄給客戶
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { to } = await req.json()
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: '請提供正確的收件 Email' }, { status: 400 })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  const FROM_EMAIL = process.env.FROM_EMAIL ?? 'CRM系統 <onboarding@resend.dev>'

  const supabase = createServerSupabaseClient()
  const [{ data: quote }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from('quotes').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('quote_items').select('*').eq('quote_id', params.id).order('seq_no'),
    supabase.from('system_settings').select('*').single(),
  ])
  if (!quote) return NextResponse.json({ error: '找不到報價單' }, { status: 404 })

  const clientName = (quote as any).clients?.company_name ?? ''
  const fmt = (n: number) => Number(n || 0).toLocaleString('zh-TW')
  const td = 'padding:6px 8px; border:1px solid #d1d5db; font-size:13px;'
  const th = td + 'background:#f3f4f6; font-weight:bold;'

  let dispNo = 0
  const itemRows = (items ?? []).map((i: any) => {
    if (i.is_category) {
      dispNo = 0
      return `<tr><td colspan="7" style="${td}background:#ececec;font-weight:bold;">${i.product_name ?? ''}</td></tr>`
    }
    dispNo += 1
    return `<tr>
      <td style="${td}text-align:center;">${dispNo}</td>
      <td style="${td}">${i.brand ?? ''}</td>
      <td style="${td}">${i.product_name ?? ''}${i.item_notes ? `<div style="color:#6b7280;font-size:11px;">備註：${i.item_notes}</div>` : ''}</td>
      <td style="${td}">${i.model ?? ''}</td>
      <td style="${td}text-align:center;">${i.quantity} ${i.unit ?? ''}</td>
      <td style="${td}text-align:right;">${fmt(i.unit_price)}</td>
      <td style="${td}text-align:right;">${fmt(i.quantity * i.unit_price)}</td>
    </tr>`
  }).join('')

  const bankInfo = settings?.bank_name
    ? `${settings.bank_name}（代號：${settings.bank_code ?? ''}）／戶名：${settings.bank_account_name ?? ''}／帳號：${settings.bank_account ?? ''}`
    : ''
  const notes: string[] = []
  if (quote.valid_until) notes.push(`報價有效期限：${quote.valid_until}`)
  if (quote.delivery_days) notes.push(`交貨工期：${quote.delivery_days} 天`)
  if (quote.payment_terms) notes.push(`付款條件：${quote.payment_terms}`)
  if (bankInfo) notes.push(`匯款帳號：${bankInfo}`)
  if (quote.notes) notes.push(quote.notes)

  const html = `
    <div style="font-family:'Microsoft JhengHei',sans-serif; max-width:680px;">
      <h2 style="margin:0 0 2px;">估價單</h2>
      ${quote.project_name ? `<p style="margin:0 0 8px; color:#374151;">${quote.project_name}</p>` : ''}
      <p style="font-size:13px; color:#374151; margin:4px 0;">
        單位名稱：<strong>${clientName}</strong>
        ${quote.contact_name ? `　聯絡人：${quote.contact_name}` : ''}<br/>
        單號：${quote.quote_no}　日期：${quote.created_at ? new Date(quote.created_at).toLocaleDateString('zh-TW') : ''}
      </p>
      <table style="border-collapse:collapse; width:100%; margin-top:8px;">
        <tr>
          <th style="${th}">編號</th><th style="${th}">品牌</th><th style="${th}">產品名稱</th>
          <th style="${th}">型號</th><th style="${th}">數量</th><th style="${th}">單價</th><th style="${th}">金額</th>
        </tr>
        ${itemRows}
        <tr>
          <td colspan="6" style="${td}text-align:right;font-weight:bold;">含稅總金額</td>
          <td style="${td}text-align:right;font-weight:bold;font-size:15px;">NT$${fmt(quote.total_amount)}</td>
        </tr>
      </table>
      ${notes.length > 0 ? `<h4 style="margin:16px 0 4px;">備註事項</h4><ol style="font-size:13px; color:#374151; margin:0; padding-left:20px;">${notes.map(n => `<li>${n}</li>`).join('')}</ol>` : ''}
      <hr style="margin:20px 0; border:none; border-top:1px solid #e5e7eb;" />
      <p style="color:#6b7280; font-size:12px;">
        ${settings?.company_name ?? '光輝影音科技'}　服務電話：${settings?.company_phone ?? '03-8321087'}<br/>
        此報價單由 CRM 系統寄出，如有疑問請直接回覆此信。
      </p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `[估價單] ${quote.quote_no}${quote.project_name ? ` — ${quote.project_name}` : ''}（${settings?.company_name ?? '光輝影音科技'}）`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
