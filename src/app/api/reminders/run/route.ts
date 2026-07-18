import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// 每日 08:00（台北）由 Vercel Cron 呼叫：
// 寄出「今日行程 + 行程提醒 + 生日/重要日子 + 逾期空檔任務」摘要信到老闆信箱
// 需要環境變數：SUPABASE_SERVICE_ROLE_KEY（繞過 RLS 供排程讀取）、RESEND_API_KEY

function taipeiToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function hm(t: string | null): string { return t ? t.slice(0, 5) : '' }

async function runReminders() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(url, key)

  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const BOSS_EMAIL = process.env.BOSS_EMAIL ?? 'dq5597@gmail.com'
  if (!RESEND_API_KEY) return { error: 'RESEND_API_KEY not set' }

  const today = taipeiToday()
  const md = today.slice(5)
  const maxAhead = addDaysStr(today, 31)

  const [todayRes, futureRes, gapRes, impRes, cbRes, clbRes, arRes, quoteRes, visitRes, stockRes] = await Promise.all([
    supabase.from('schedules')
      .select('*, clients(company_name), vendors(company_name)')
      .eq('is_gap_task', false).eq('schedule_date', today)
      .order('plan_start', { ascending: true }),
    supabase.from('schedules')
      .select('*, clients(company_name), vendors(company_name)')
      .eq('is_gap_task', false).eq('remind_email', true).eq('status', '未開始')
      .gt('schedule_date', today).lte('schedule_date', maxAhead),
    supabase.from('schedules')
      .select('*')
      .eq('is_gap_task', true).neq('status', '已完成').neq('status', '取消')
      .not('gap_due_date', 'is', null).lte('gap_due_date', addDaysStr(today, 3)),
    supabase.from('important_dates')
      .select('*, clients(company_name), contacts(name)')
      .eq('is_active', true).eq('remind_email', true),
    supabase.from('contacts').select('id, name, birthday, clients(company_name)').not('birthday', 'is', null),
    supabase.from('clients').select('id, company_name, contact_name, birthday').not('birthday', 'is', null),
    // 應收逾期
    supabase.from('receivables').select('receivable_no, due_date, balance, clients(company_name)')
      .lt('due_date', today).gt('balance', 0).not('status', 'in', '("已收清","作廢","壞帳")'),
    // 報價效期 7 天內到期或已過期（未轉單）
    supabase.from('quotes').select('quote_no, valid_until, total_amount, clients(company_name)')
      .in('status', ['草稿', '已確認']).not('valid_until', 'is', null).lte('valid_until', addDaysStr(today, 7)),
    // 逾期未回訪
    supabase.from('clients').select('company_name, contact_name, next_visit_date')
      .not('next_visit_date', 'is', null).lt('next_visit_date', today),
    // 低於安全庫存
    supabase.from('products').select('brand, product_name, model, stock_qty, safe_stock')
      .eq('is_active', true).gt('safe_stock', 0),
  ])

  const todaySchedules = todayRes.data ?? []

  // 未來行程：今天剛好是「行程日 − 提前天數」才提醒
  const futureReminders = (futureRes.data ?? []).filter((s: any) =>
    addDaysStr(s.schedule_date, -(s.remind_days_before ?? 0)) === today
  )

  const gapOverdue = gapRes.data ?? []

  // 重要日子：算出今年出現日，今天 = 出現日 − 提前天數 或 當天
  type Occ = { title: string; date: string; type: string; company?: string; daysLeft: number }
  const occs: Occ[] = []
  const pushOcc = (dateStr: string, recurring: boolean, title: string, type: string, company: string | undefined, before: number) => {
    let occDate = dateStr
    if (recurring) {
      occDate = `${today.slice(0, 4)}-${dateStr.slice(5)}`
      if (occDate < today) occDate = `${Number(today.slice(0, 4)) + 1}-${dateStr.slice(5)}`
    }
    const remindDay = addDaysStr(occDate, -before)
    if (today === remindDay || today === occDate) {
      const daysLeft = Math.round((new Date(occDate).getTime() - new Date(today).getTime()) / 86400000)
      occs.push({ title, date: occDate, type, company, daysLeft })
    }
  }
  for (const r of (impRes.data ?? []) as any[])
    pushOcc(r.the_date, r.recurring, r.title + (r.contacts?.name ? `（${r.contacts.name}）` : ''), r.date_type, r.clients?.company_name, r.remind_days_before ?? 3)
  for (const c of (cbRes.data ?? []) as any[])
    pushOcc(c.birthday, true, `${c.name} 生日`, '生日', c.clients?.company_name, 3)
  for (const c of (clbRes.data ?? []) as any[])
    pushOcc(c.birthday, true, `${c.contact_name ?? c.company_name} 生日`, '生日', c.company_name, 3)

  const overdueAR = (arRes.data ?? []) as any[]
  const expQuotes = (quoteRes.data ?? []) as any[]
  const overdueVisits = (visitRes.data ?? []) as any[]
  const lowStock = ((stockRes.data ?? []) as any[]).filter(p => Number(p.stock_qty) < Number(p.safe_stock))

  const hasContent = todaySchedules.length > 0 || futureReminders.length > 0 || occs.length > 0 || gapOverdue.length > 0 ||
    overdueAR.length > 0 || expQuotes.length > 0 || overdueVisits.length > 0 || lowStock.length > 0
  if (!hasContent) return { sent: false, reason: 'nothing to remind' }

  const row = (cells: string[]) =>
    `<tr>${cells.map(c => `<td style="padding:6px 12px 6px 0; border-bottom:1px solid #f3f4f6;">${c}</td>`).join('')}</tr>`

  const scheduleRows = todaySchedules.map((s: any) => row([
    `<strong>${hm(s.plan_start)}${s.plan_end ? '–' + hm(s.plan_end) : ''}</strong>`,
    s.title,
    s.clients?.company_name ?? s.vendors?.company_name ?? '—',
    s.type,
  ])).join('')

  const futureRows = futureReminders.map((s: any) => row([
    `<strong>${s.schedule_date.replace(/-/g, '/')}</strong> ${hm(s.plan_start)}`,
    s.title,
    s.clients?.company_name ?? s.vendors?.company_name ?? '—',
  ])).join('')

  const occRows = occs.map(o => row([
    `<strong>${o.date.replace(/-/g, '/')}</strong>${o.daysLeft === 0 ? '（今天）' : `（還有 ${o.daysLeft} 天）`}`,
    `${o.type === '生日' ? '🎂' : o.type === '保固到期' || o.type === '合約續約' ? '🛡️' : '📌'} ${o.title}`,
    o.company ?? '—',
  ])).join('')

  const gapRows = gapOverdue.map((t: any) => row([
    `<strong style="color:${t.gap_due_date < today ? '#dc2626' : '#d97706'};">${t.gap_due_date.replace(/-/g, '/')}</strong>`,
    t.title,
  ])).join('')

  const arRows = overdueAR.map((r: any) => row([
    `<strong style="color:#dc2626;">${(r.due_date ?? '').replace(/-/g, '/')}</strong>`,
    r.receivable_no,
    r.clients?.company_name ?? '—',
    `<strong>NT$${Number(r.balance).toLocaleString('zh-TW')}</strong>`,
  ])).join('')

  const quoteRows = expQuotes.map((q: any) => row([
    `<strong style="color:${q.valid_until < today ? '#dc2626' : '#d97706'};">${q.valid_until.replace(/-/g, '/')}${q.valid_until < today ? '（已過期）' : ''}</strong>`,
    q.quote_no,
    q.clients?.company_name ?? '—',
    `NT$${Number(q.total_amount).toLocaleString('zh-TW')}`,
  ])).join('')

  const visitRows = overdueVisits.map((c: any) => row([
    `<strong style="color:#dc2626;">${c.next_visit_date.replace(/-/g, '/')}</strong>`,
    c.company_name,
    c.contact_name ?? '—',
  ])).join('')

  const stockRows = lowStock.map((p: any) => row([
    `${[p.brand, p.product_name, p.model].filter(Boolean).join(' ')}`,
    `<strong style="color:#d97706;">庫存 ${p.stock_qty}</strong>`,
    `安全量 ${p.safe_stock}`,
  ])).join('')

  const section = (title: string, rows: string, empty: string) => `
    <h3 style="margin:20px 0 6px; font-size:15px;">${title}</h3>
    ${rows ? `<table style="border-collapse:collapse; font-size:14px; width:100%;">${rows}</table>` : `<p style="color:#9ca3af; font-size:13px; margin:4px 0;">${empty}</p>`}
  `

  const html = `
    <div style="font-family: sans-serif; max-width:640px;">
      <h2 style="margin:0 0 4px;">📅 每日行程提醒 — ${today.replace(/-/g, '/')}</h2>
      <p style="color:#6b7280; font-size:13px; margin:0 0 8px;">光輝影音科技 CRM 自動發送（每日 08:00）</p>
      ${section('今日預定行程', scheduleRows, '今日無預定行程')}
      ${futureRows ? section('未來行程提醒（你設定要提前通知的）', futureRows, '') : ''}
      ${occRows ? section('生日／重要日子', occRows, '') : ''}
      ${gapRows ? section('空檔任務即將到期／已逾期', gapRows, '') : ''}
      ${arRows ? section(`💰 應收帳款逾期未收（${overdueAR.length} 筆）`, arRows, '') : ''}
      ${quoteRows ? section(`📄 報價單效期將到期／已過期（${expQuotes.length} 筆）`, quoteRows, '') : ''}
      ${visitRows ? section(`🚗 逾期未回訪單位（${overdueVisits.length} 位）`, visitRows, '') : ''}
      ${stockRows ? section(`📦 低於安全庫存（${lowStock.length} 項）`, stockRows, '') : ''}
      <p style="margin-top:20px;"><a href="https://crmapp-topaz.vercel.app/schedule" style="background:#2563eb;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;">開啟行事曆</a>
      <a href="https://crmapp-topaz.vercel.app/" style="background:#4b5563;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px;margin-left:8px;">開啟戰情室</a></p>
    </div>
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
      subject: `[每日提醒] ${today.replace(/-/g, '/')} 行程 ${todaySchedules.length} 筆${occs.length > 0 ? `・重要日子 ${occs.length} 筆` : ''}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return { error: err }
  }

  // 記錄已發送日期（防呆／追查用）
  const sentIds = [...todaySchedules, ...futureReminders].map((s: any) => s.id)
  if (sentIds.length > 0)
    await supabase.from('schedules').update({ reminder_sent_on: today }).in('id', sentIds)

  return { sent: true, schedules: todaySchedules.length, future: futureReminders.length, dates: occs.length, gaps: gapOverdue.length }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runReminders()
  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  return GET(req)
}
