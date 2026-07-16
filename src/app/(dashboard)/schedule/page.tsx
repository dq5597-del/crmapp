'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, Building2, Truck,
  Cake, ShieldCheck, Sparkles, Pencil, Trash2, Check, AlarmClock, CalendarDays, Navigation
} from 'lucide-react'

// ============ 型別 ============
interface Schedule {
  id: string
  schedule_date: string
  plan_start: string | null
  plan_end: string | null
  title: string
  type: string
  plan_notes: string | null
  client_id: string | null
  contact_id: string | null
  vendor_id: string | null
  is_gap_task: boolean
  gap_due_date: string | null
  is_adhoc: boolean
  actual_start: string | null
  actual_end: string | null
  actual_result: string | null
  status: string
  remind_email: boolean
  remind_days_before: number
  clients?: { company_name: string; address?: string | null } | null
  vendors?: { company_name: string } | null
  contacts?: { name: string } | null
}

interface Company { id: string; company_name: string; address?: string | null }

interface DateOccurrence {
  key: string
  date: string          // yyyy-mm-dd（本次出現日）
  title: string
  date_type: string     // 生日 / 週年 / 保固到期 / 合約續約 / 自訂
  company?: string
}

// ============ 常數 ============
const TYPE_COLORS: Record<string, { pill: string; block: string; border: string }> = {
  '客戶拜訪': { pill: 'bg-purple-100 text-purple-800', block: 'bg-purple-100', border: 'border-purple-400' },
  '廠商聯絡': { pill: 'bg-teal-100 text-teal-800',     block: 'bg-teal-100',   border: 'border-teal-400' },
  '叫修服務': { pill: 'bg-orange-100 text-orange-800', block: 'bg-orange-100', border: 'border-orange-400' },
  '內部作業': { pill: 'bg-gray-100 text-gray-700',     block: 'bg-gray-100',   border: 'border-gray-400' },
  '其他':     { pill: 'bg-gray-100 text-gray-700',     block: 'bg-gray-100',   border: 'border-gray-400' },
}

const STATUS_COLORS: Record<string, string> = {
  '未開始':   'bg-gray-100 text-gray-600',
  '進行中':   'bg-blue-100 text-blue-700',
  '已完成':   'bg-green-100 text-green-700',
  '延誤完成': 'bg-amber-100 text-amber-700',
  '改期':     'bg-orange-100 text-orange-700',
  '取消':     'bg-red-100 text-red-600',
}

const DATE_TYPE_ICON: Record<string, any> = {
  '生日': Cake, '週年': Sparkles, '保固到期': ShieldCheck, '合約續約': ShieldCheck, '自訂': CalendarDays,
}

const DATE_TYPE_PILL: Record<string, string> = {
  '生日': 'bg-pink-100 text-pink-800',
  '週年': 'bg-pink-100 text-pink-800',
  '保固到期': 'bg-amber-100 text-amber-800',
  '合約續約': 'bg-amber-100 text-amber-800',
  '自訂': 'bg-gray-100 text-gray-700',
}

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-gray-600 mb-1 block'

// ============ 日期工具 ============
function fmt(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function weekStart(d: Date): Date { return addDays(d, -d.getDay()) }
function hm(t: string | null): string { return t ? t.slice(0, 5) : '' }
function timeToMin(t: string | null): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// Google Map 導航連結
function mapsUrl(address: string): string {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address)
}

// .ics 下載（含 30 分鐘前鬧鈴 VALARM，開啟後進手機內建行事曆）
function downloadIcs(s: Schedule) {
  const d = s.schedule_date.replace(/-/g, '')
  const st = (s.plan_start ?? '09:00:00').replace(/:/g, '').slice(0, 6).padEnd(6, '0')
  const en = (s.plan_end ?? s.plan_start ?? '10:00:00').replace(/:/g, '').slice(0, 6).padEnd(6, '0')
  const who = s.clients?.company_name ?? s.vendors?.company_name ?? ''
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GH CRM//Schedule//ZH',
    'BEGIN:VEVENT',
    `UID:${s.id}@gh-crm`,
    `DTSTART;TZID=Asia/Taipei:${d}T${st}`,
    `DTEND;TZID=Asia/Taipei:${d}T${en}`,
    `SUMMARY:${s.title}${who ? '（' + who + '）' : ''}`,
    `DESCRIPTION:${(s.plan_notes ?? '').replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M', `DESCRIPTION:${s.title}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${s.title}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

// ============ 主頁面 ============
export default function SchedulePage() {
  const supabase = createClient()
  const [view, setView] = useState<'month' | 'week' | 'day'>('day')
  const [anchor, setAnchor] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [gapTasks, setGapTasks] = useState<Schedule[]>([])
  const [occurrences, setOccurrences] = useState<DateOccurrence[]>([])
  const [clients, setClients] = useState<Company[]>([])
  const [vendors, setVendors] = useState<Company[]>([])
  const [contacts, setContacts] = useState<{ id: string; name: string; client_id: string }[]>([])
  const [planModal, setPlanModal] = useState<Schedule | 'new' | null>(null)
  const [actualModal, setActualModal] = useState<Schedule | null>(null)
  const [review, setReview] = useState({ good_things: '', bad_things: '', improvements: '' })
  const [reviewSaved, setReviewSaved] = useState(false)

  const todayStr = fmt(new Date())

  // 可見範圍
  const range = useMemo(() => {
    if (view === 'day') return { start: fmt(anchor), end: fmt(anchor) }
    if (view === 'week') {
      const ws = weekStart(anchor)
      return { start: fmt(ws), end: fmt(addDays(ws, 6)) }
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = weekStart(first)
    return { start: fmt(gridStart), end: fmt(addDays(gridStart, 41)) }
  }, [view, anchor])

  const fetchAll = useCallback(async () => {
    const [schedRes, gapRes, impRes, cbRes, clbRes] = await Promise.all([
      supabase.from('schedules')
        .select('*, clients(company_name, address), vendors(company_name), contacts(name)')
        .eq('is_gap_task', false)
        .gte('schedule_date', range.start).lte('schedule_date', range.end)
        .order('plan_start', { ascending: true }),
      supabase.from('schedules')
        .select('*, clients(company_name), vendors(company_name), contacts(name)')
        .eq('is_gap_task', true)
        .not('status', 'in', '("取消")')
        .order('gap_due_date', { ascending: true }),
      supabase.from('important_dates').select('*, clients(company_name)').eq('is_active', true),
      supabase.from('contacts').select('id, name, client_id, birthday, clients(company_name)').not('birthday', 'is', null),
      supabase.from('clients').select('id, company_name, contact_name, birthday').not('birthday', 'is', null),
    ])
    setSchedules((schedRes.data ?? []) as Schedule[])
    setGapTasks((gapRes.data ?? []) as Schedule[])

    // 計算範圍內的重要日子出現日（含每年重複）
    const occ: DateOccurrence[] = []
    const startY = Number(range.start.slice(0, 4)), endY = Number(range.end.slice(0, 4))
    const pushRecurring = (key: string, dateStr: string, title: string, type: string, company?: string) => {
      const md = dateStr.slice(5)
      for (let y = startY; y <= endY; y++) {
        const d = `${y}-${md}`
        if (d >= range.start && d <= range.end) occ.push({ key: `${key}-${y}`, date: d, title, date_type: type, company })
      }
    }
    for (const r of (impRes.data ?? []) as any[]) {
      if (r.recurring) pushRecurring(r.id, r.the_date, r.title, r.date_type, r.clients?.company_name)
      else if (r.the_date >= range.start && r.the_date <= range.end)
        occ.push({ key: r.id, date: r.the_date, title: r.title, date_type: r.date_type, company: r.clients?.company_name })
    }
    for (const c of (cbRes.data ?? []) as any[])
      pushRecurring(`cb-${c.id}`, c.birthday, `${c.name} 生日`, '生日', c.clients?.company_name)
    for (const c of (clbRes.data ?? []) as any[])
      pushRecurring(`clb-${c.id}`, c.birthday, `${c.contact_name ?? c.company_name} 生日`, '生日', c.company_name)
    occ.sort((a, b) => a.date.localeCompare(b.date))
    setOccurrences(occ)
  }, [range.start, range.end])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    supabase.from('clients').select('id, company_name, address').order('company_name').then(({ data }) => setClients(data ?? []))
    supabase.from('vendors').select('id, company_name, address').eq('is_active', true).order('company_name').then(({ data }) => setVendors(data ?? []))
    supabase.from('contacts').select('id, name, client_id').then(({ data }) => setContacts((data ?? []) as any))
  }, [])

  // 每日反省（日視圖）
  useEffect(() => {
    if (view !== 'day') return
    supabase.from('daily_reviews').select('*').eq('review_date', fmt(anchor)).maybeSingle().then(({ data }) => {
      setReview({
        good_things: data?.good_things ?? '',
        bad_things: data?.bad_things ?? '',
        improvements: data?.improvements ?? '',
      })
      setReviewSaved(false)
    })
  }, [view, anchor])

  async function saveReview() {
    await supabase.from('daily_reviews').upsert(
      { review_date: fmt(anchor), ...review },
      { onConflict: 'review_date' }
    )
    setReviewSaved(true)
    setTimeout(() => setReviewSaved(false), 2000)
  }

  function navigate(dir: number) {
    if (view === 'day') setAnchor(a => addDays(a, dir))
    else if (view === 'week') setAnchor(a => addDays(a, dir * 7))
    else setAnchor(a => new Date(a.getFullYear(), a.getMonth() + dir, 1))
  }

  async function toggleGapDone(t: Schedule) {
    const done = t.status === '已完成'
    await supabase.from('schedules').update({
      status: done ? '未開始' : '已完成',
      actual_result: done ? null : (t.actual_result ?? '完成'),
    }).eq('id', t.id)
    fetchAll()
  }

  async function deleteSchedule(id: string) {
    if (!confirm('確定刪除此行程？')) return
    await supabase.from('schedules').delete().eq('id', id)
    fetchAll()
  }

  const daySchedules = useMemo(
    () => schedules.filter(s => s.schedule_date === fmt(anchor)),
    [schedules, anchor]
  )
  const dayOcc = useMemo(() => occurrences.filter(o => o.date === fmt(anchor)), [occurrences, anchor])
  const doneCount = daySchedules.filter(s => s.status === '已完成' || s.status === '延誤完成').length
  const adhocCount = daySchedules.filter(s => s.is_adhoc).length

  const headerLabel = view === 'month'
    ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`
    : view === 'week'
      ? `${fmt(weekStart(anchor)).slice(5).replace('-', '/')} – ${fmt(addDays(weekStart(anchor), 6)).slice(5).replace('-', '/')}`
      : `${anchor.getFullYear()}/${anchor.getMonth() + 1}/${anchor.getDate()}（${WEEK_LABELS[anchor.getDay()]}）`

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">每日行程表</h1>
          <p className="text-sm text-gray-500 mt-0.5">預定 vs 實際對照・空檔任務・重要日子提醒</p>
        </div>
        <button
          onClick={() => setPlanModal('new')}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
        >
          <Plus size={15} /> 新增行程
        </button>
      </div>

      {/* 導覽 + 視圖切換 */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={18} /></button>
          <span className="font-semibold text-gray-900 min-w-[150px] text-center">{headerLabel}</span>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={18} /></button>
          <button onClick={() => setAnchor(new Date())} className="ml-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">今天</button>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['month', 'week', 'day'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm font-medium ${view === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>
      </div>

      {/* ============ 月視圖 ============ */}
      {view === 'month' && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-1">
            {WEEK_LABELS.map(w => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 border-t border-l border-gray-100">
            {Array.from({ length: 42 }, (_, i) => {
              const d = addDays(weekStart(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), i)
              const ds = fmt(d)
              const inMonth = d.getMonth() === anchor.getMonth()
              const items = schedules.filter(s => s.schedule_date === ds)
              const occ = occurrences.filter(o => o.date === ds)
              const isToday = ds === todayStr
              return (
                <button
                  key={ds}
                  onClick={() => { setAnchor(d); setView('day') }}
                  className={`min-h-[80px] border-r border-b border-gray-100 p-1 text-left align-top hover:bg-blue-50/50 transition ${isToday ? 'bg-blue-50' : ''}`}
                >
                  <div className={`text-xs mb-0.5 ${isToday ? 'font-bold text-blue-700' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>{d.getDate()}</div>
                  {occ.slice(0, 1).map(o => (
                    <div key={o.key} className={`text-[11px] px-1 py-0.5 rounded truncate mb-0.5 ${DATE_TYPE_PILL[o.date_type]}`}>{o.title}</div>
                  ))}
                  {items.slice(0, 2).map(s => (
                    <div key={s.id} className={`text-[11px] px-1 py-0.5 rounded truncate mb-0.5 flex items-center gap-0.5 ${TYPE_COLORS[s.type]?.pill ?? 'bg-gray-100 text-gray-700'}`}>
                      {(s.status === '已完成' || s.status === '延誤完成') && <Check size={10} className="shrink-0" />}
                      <span className="truncate">{hm(s.plan_start)} {s.title}</span>
                    </div>
                  ))}
                  {(items.length + occ.length) > 3 && (
                    <div className="text-[11px] text-blue-600">+{items.length + occ.length - 3} 筆</div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
            <span><span className="inline-block w-2.5 h-2.5 bg-purple-200 rounded mr-1"></span>客戶拜訪</span>
            <span><span className="inline-block w-2.5 h-2.5 bg-teal-200 rounded mr-1"></span>廠商聯絡</span>
            <span><span className="inline-block w-2.5 h-2.5 bg-orange-200 rounded mr-1"></span>叫修服務</span>
            <span><span className="inline-block w-2.5 h-2.5 bg-pink-200 rounded mr-1"></span>生日/週年</span>
            <span><span className="inline-block w-2.5 h-2.5 bg-amber-200 rounded mr-1"></span>保固/合約到期</span>
          </div>
        </div>
      )}

      {/* ============ 週視圖 ============ */}
      {view === 'week' && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm overflow-x-auto">
          <div className="min-w-[720px]">
            {/* 日期列 */}
            <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              <div></div>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(weekStart(anchor), i)
                const isToday = fmt(d) === todayStr
                return (
                  <button key={i} onClick={() => { setAnchor(d); setView('day') }} className="text-center py-1.5 text-xs">
                    <span className={`px-2 py-1 rounded-full ${isToday ? 'bg-blue-600 text-white font-semibold' : 'text-gray-500'}`}>
                      {WEEK_LABELS[d.getDay()]} {d.getDate()}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* 全天列：重要日子 */}
            <div className="grid border-t border-gray-100" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              <div className="text-[11px] text-gray-400 py-1.5 pr-1 text-right">全天</div>
              {Array.from({ length: 7 }, (_, i) => {
                const ds = fmt(addDays(weekStart(anchor), i))
                return (
                  <div key={i} className="border-l border-gray-100 p-0.5 min-h-[26px]">
                    {occurrences.filter(o => o.date === ds).map(o => {
                      const Icon = DATE_TYPE_ICON[o.date_type] ?? CalendarDays
                      return (
                        <div key={o.key} title={o.company} className={`text-[11px] px-1 py-0.5 rounded truncate mb-0.5 flex items-center gap-0.5 ${DATE_TYPE_PILL[o.date_type]}`}>
                          <Icon size={10} className="shrink-0" /><span className="truncate">{o.title}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            {/* 空檔任務列 */}
            <div className="grid border-t border-gray-100" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              <div className="text-[11px] text-gray-400 py-1.5 pr-1 text-right">空檔</div>
              <div className="border-l border-gray-100 p-1 flex flex-wrap gap-1" style={{ gridColumn: '2 / 9' }}>
                {gapTasks.filter(t => t.status !== '已完成').map(t => (
                  <button key={t.id} onClick={() => toggleGapDone(t)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 bg-gray-50 text-gray-600 hover:border-green-400 hover:text-green-700">
                    {t.title}{t.gap_due_date ? `（${t.gap_due_date.slice(5).replace('-', '/')}）` : ''}
                  </button>
                ))}
                {gapTasks.filter(t => t.status !== '已完成').length === 0 && <span className="text-[11px] text-gray-300 py-0.5">無待辦空檔任務</span>}
              </div>
            </div>
            {/* 時間格線 07:00–19:00 */}
            <div className="grid border-t border-gray-100" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
              <div className="relative" style={{ height: 480 }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} className="absolute right-1 text-[10px] text-gray-400" style={{ top: i * 40 - 6 }}>{String(7 + i).padStart(2, '0')}:00</span>
                ))}
              </div>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(weekStart(anchor), i)
                const ds = fmt(d)
                const items = schedules.filter(s => s.schedule_date === ds && s.plan_start)
                const isToday = ds === todayStr
                const now = new Date()
                const nowTop = ((now.getHours() * 60 + now.getMinutes()) - 420) / 60 * 40
                return (
                  <div key={i} className={`relative border-l border-gray-100 ${isToday ? 'bg-blue-50/40' : ''}`} style={{ height: 480 }}>
                    {Array.from({ length: 12 }, (_, h) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-gray-50" style={{ top: h * 40 }} />
                    ))}
                    {items.map(s => {
                      const top = Math.max(0, (timeToMin(s.plan_start) - 420) / 60 * 40)
                      const dur = Math.max(30, timeToMin(s.plan_end ?? s.plan_start) - timeToMin(s.plan_start))
                      const c = TYPE_COLORS[s.type] ?? TYPE_COLORS['其他']
                      return (
                        <button
                          key={s.id}
                          onClick={() => setActualModal(s)}
                          className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-left text-[11px] overflow-hidden border-l-2 ${c.block} ${c.border} ${s.is_adhoc ? 'border-dashed' : ''} hover:brightness-95`}
                          style={{ top, height: Math.min(dur / 60 * 40, 480 - top) }}
                        >
                          <span className="flex items-center gap-0.5 font-medium text-gray-800">
                            {(s.status === '已完成' || s.status === '延誤完成') && <Check size={10} className="shrink-0 text-green-700" />}
                            <span className="truncate">{s.title}</span>
                          </span>
                          <span className="text-gray-500 truncate block">{s.clients?.company_name ?? s.vendors?.company_name ?? ''}</span>
                        </button>
                      )
                    })}
                    {isToday && nowTop >= 0 && nowTop <= 480 && (
                      <div className="absolute left-0 right-0 border-t-2 border-red-500 z-10" style={{ top: nowTop }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ 日視圖 ============ */}
      {view === 'day' && (
        <>
          {/* 重要日子 banner */}
          {dayOcc.length > 0 && (
            <div className="bg-pink-50 border border-pink-200 rounded-2xl px-4 py-3 flex flex-wrap gap-2 items-center">
              {dayOcc.map(o => {
                const Icon = DATE_TYPE_ICON[o.date_type] ?? CalendarDays
                return (
                  <span key={o.key} className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${DATE_TYPE_PILL[o.date_type]}`}>
                    <Icon size={12} /> {o.title}{o.company ? `・${o.company}` : ''}
                  </span>
                )
              })}
            </div>
          )}

          {/* 預定 vs 實際 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">預定 vs 實際</h2>
              <span className="text-sm text-gray-500">達成 {doneCount}/{daySchedules.length}{adhocCount > 0 ? `・臨時 ${adhocCount} 筆` : ''}</span>
            </div>
            {daySchedules.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">本日尚無行程，點右上「新增行程」開始規劃</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-xs text-gray-500 text-left border-b border-gray-100">
                      <th className="py-2 pr-2 font-medium w-20">時間</th>
                      <th className="py-2 pr-2 font-medium">預定行程</th>
                      <th className="py-2 pr-2 font-medium">實際結果</th>
                      <th className="py-2 pr-2 font-medium w-20">狀態</th>
                      <th className="py-2 font-medium w-28 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daySchedules.map(s => {
                      const c = TYPE_COLORS[s.type] ?? TYPE_COLORS['其他']
                      return (
                        <tr key={s.id} className={`border-b border-gray-50 align-top ${s.is_adhoc ? 'bg-orange-50/50' : ''}`}>
                          <td className="py-2.5 pr-2 text-gray-600">
                            {hm(s.plan_start)}{s.plan_end ? `–${hm(s.plan_end)}` : ''}
                            {s.is_adhoc && <div className="text-[10px] text-orange-600 mt-0.5">臨時</div>}
                          </td>
                          <td className="py-2.5 pr-2">
                            <div className="font-medium text-gray-900">{s.title}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className={`text-[11px] px-1.5 py-0.5 rounded ${c.pill}`}>{s.type}</span>
                              {s.clients?.company_name && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 flex items-center gap-0.5"><Building2 size={10} />{s.clients.company_name}{s.contacts?.name ? `・${s.contacts.name}` : ''}</span>
                              )}
                              {s.clients?.address && (
                                <a href={mapsUrl(s.clients.address)} target="_blank" rel="noopener noreferrer" title={`導航：${s.clients.address}`} className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-0.5 hover:bg-blue-100"><Navigation size={10} />導航</a>
                              )}
                              {s.vendors?.company_name && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 flex items-center gap-0.5"><Truck size={10} />{s.vendors.company_name}</span>
                              )}
                              {s.remind_email && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-0.5"><AlarmClock size={10} />提醒</span>}
                            </div>
                            {s.plan_notes && <div className="text-xs text-gray-400 mt-1">{s.plan_notes}</div>}
                          </td>
                          <td className="py-2.5 pr-2 text-gray-600">
                            {s.actual_result ? (
                              <>
                                {s.actual_start && <span className="text-xs text-gray-400">{hm(s.actual_start)}{s.actual_end ? `–${hm(s.actual_end)}` : ''}　</span>}
                                {s.actual_result}
                              </>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2.5 pr-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <button onClick={() => setActualModal(s)} title="填實際結果" className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg"><Check size={15} /></button>
                            <button onClick={() => downloadIcs(s)} title="加入手機行事曆（含鬧鈴）" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><AlarmClock size={15} /></button>
                            <button onClick={() => setPlanModal(s)} title="編輯預定" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                            <button onClick={() => deleteSchedule(s.id)} title="刪除" className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 空檔任務 */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 flex items-center gap-1.5"><Clock size={16} className="text-gray-400" />空檔任務（有空就做）</h2>
              </div>
              {gapTasks.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">尚無空檔任務</p>
              ) : (
                <div className="space-y-2">
                  {gapTasks.map(t => (
                    <label key={t.id} className="flex items-center gap-2.5 text-sm cursor-pointer group">
                      <input type="checkbox" checked={t.status === '已完成'} onChange={() => toggleGapDone(t)} className="w-4 h-4 rounded" />
                      <span className={`flex-1 ${t.status === '已完成' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</span>
                      {t.gap_due_date && (
                        <span className={`text-xs ${t.gap_due_date < todayStr && t.status !== '已完成' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{t.gap_due_date.slice(5).replace('-', '/')}</span>
                      )}
                      <button onClick={e => { e.preventDefault(); deleteSchedule(t.id) }} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 每日反省 */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">今日回顧</h2>
                <button onClick={saveReview} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">{reviewSaved ? '已儲存 ✓' : '儲存'}</button>
              </div>
              <div className="space-y-2.5">
                <div>
                  <label className="text-xs text-green-700 font-medium mb-1 block">順利的事（Good job）</label>
                  <textarea value={review.good_things} onChange={e => setReview(p => ({ ...p, good_things: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
                </div>
                <div>
                  <label className="text-xs text-red-600 font-medium mb-1 block">不順利的事・反省</label>
                  <textarea value={review.bad_things} onChange={e => setReview(p => ({ ...p, bad_things: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
                </div>
                <div>
                  <label className="text-xs text-blue-700 font-medium mb-1 block">改善方法</label>
                  <textarea value={review.improvements} onChange={e => setReview(p => ({ ...p, improvements: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {planModal && (
        <PlanModal
          schedule={planModal === 'new' ? null : planModal}
          defaultDate={fmt(anchor)}
          clients={clients}
          vendors={vendors}
          contacts={contacts}
          addClient={c => setClients(prev => [...prev, c].sort((a, b) => a.company_name.localeCompare(b.company_name, 'zh-TW')))}
          addVendor={v => setVendors(prev => [...prev, v].sort((a, b) => a.company_name.localeCompare(b.company_name, 'zh-TW')))}
          onClose={() => setPlanModal(null)}
          onSaved={() => { setPlanModal(null); fetchAll() }}
        />
      )}
      {actualModal && (
        <ActualModal
          schedule={actualModal}
          onClose={() => setActualModal(null)}
          onSaved={() => { setActualModal(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ============ 新增／編輯預定行程 Modal ============
function PlanModal({ schedule, defaultDate, clients, vendors, contacts, addClient, addVendor, onClose, onSaved }: {
  schedule: Schedule | null
  defaultDate: string
  clients: Company[]
  vendors: Company[]
  contacts: { id: string; name: string; client_id: string }[]
  addClient: (c: Company) => void
  addVendor: (v: Company) => void
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const todayStr = fmt(new Date())
  const [f, setF] = useState({
    schedule_date: schedule?.schedule_date ?? defaultDate,
    is_gap_task: schedule?.is_gap_task ?? false,
    plan_start: hm(schedule?.plan_start ?? null) || '09:00',
    plan_end: hm(schedule?.plan_end ?? null) || '10:00',
    gap_due_date: schedule?.gap_due_date ?? '',
    title: schedule?.title ?? '',
    type: schedule?.type ?? '客戶拜訪',
    client_id: schedule?.client_id ?? '',
    contact_id: schedule?.contact_id ?? '',
    vendor_id: schedule?.vendor_id ?? '',
    plan_notes: schedule?.plan_notes ?? '',
    is_adhoc: schedule?.is_adhoc ?? false,
    remind_email: schedule?.remind_email ?? false,
    remind_days_before: schedule?.remind_days_before ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const clientContacts = contacts.filter(c => c.client_id === f.client_id)
  const selClient = clients.find(c => c.id === f.client_id)
  const selVendor = vendors.find(v => v.id === f.vendor_id)

  async function createClient_(name: string) {
    const { data, error } = await supabase.from('clients')
      .insert({ company_name: name, status: '有需求' })
      .select('id, company_name, address').single()
    if (error || !data) { alert('新增單位名稱失敗：' + (error?.message ?? '')); return }
    addClient(data as Company)
    setF(p => ({ ...p, client_id: data.id, contact_id: '' }))
  }

  async function createVendor_(name: string) {
    const { data, error } = await supabase.from('vendors')
      .insert({ company_name: name })
      .select('id, company_name, address').single()
    if (error || !data) { alert('新增廠商失敗：' + (error?.message ?? '')); return }
    addVendor(data as Company)
    setF(p => ({ ...p, vendor_id: data.id }))
  }

  async function handleSave() {
    if (!f.title.trim()) { alert('請輸入行程標題'); return }
    setSaving(true)
    const payload: any = {
      schedule_date: f.schedule_date,
      is_gap_task: f.is_gap_task,
      plan_start: f.is_gap_task ? null : f.plan_start,
      plan_end: f.is_gap_task ? null : f.plan_end,
      gap_due_date: f.is_gap_task ? (f.gap_due_date || null) : null,
      title: f.title.trim(),
      type: f.type,
      client_id: f.client_id || null,
      contact_id: f.contact_id || null,
      vendor_id: f.vendor_id || null,
      plan_notes: f.plan_notes || null,
      is_adhoc: f.is_adhoc,
      remind_email: f.remind_email,
      remind_days_before: f.remind_days_before,
    }
    const { error } = schedule
      ? await supabase.from('schedules').update(payload).eq('id', schedule.id)
      : await supabase.from('schedules').insert(payload)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{schedule ? '編輯預定行程' : '新增行程'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!f.is_gap_task} onChange={() => setF(p => ({ ...p, is_gap_task: false }))} />
              預定行程（有時間）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={f.is_gap_task} onChange={() => setF(p => ({ ...p, is_gap_task: true }))} />
              空檔任務（有空就做）
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>日期</label>
              <input type="date" value={f.schedule_date} onChange={e => setF(p => ({ ...p, schedule_date: e.target.value }))} className={inputClass} />
            </div>
            {f.is_gap_task ? (
              <div>
                <label className={labelClass}>期限（選填）</label>
                <input type="date" value={f.gap_due_date} onChange={e => setF(p => ({ ...p, gap_due_date: e.target.value }))} className={inputClass} />
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelClass}>開始</label>
                  <input type="time" value={f.plan_start} onChange={e => setF(p => ({ ...p, plan_start: e.target.value }))} className={inputClass} />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>結束</label>
                  <input type="time" value={f.plan_end} onChange={e => setF(p => ({ ...p, plan_end: e.target.value }))} className={inputClass} />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>標題 *</label>
            <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="例：會議室線材更換勘查" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>類型</label>
              <select value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value }))} className={inputClass}>
                {['客戶拜訪', '廠商聯絡', '叫修服務', '內部作業', '其他'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>單位名稱（可搜尋，找不到可直接新增）</label>
              <SearchSelect
                items={clients}
                valueId={f.client_id}
                placeholder="輸入關鍵字搜尋單位名稱"
                createLabel="新增單位名稱"
                onSelect={id => setF(p => ({ ...p, client_id: id, contact_id: '' }))}
                onCreate={createClient_}
              />
              {selClient?.address && (
                <a href={mapsUrl(selClient.address)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                  <Navigation size={11} /> Google Map 導航：{selClient.address}
                </a>
              )}
            </div>
            {f.client_id && clientContacts.length > 0 && (
              <div>
                <label className={labelClass}>聯絡人</label>
                <select value={f.contact_id} onChange={e => setF(p => ({ ...p, contact_id: e.target.value }))} className={inputClass}>
                  <option value="">— 不指定 —</option>
                  {clientContacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>廠商（可搜尋，找不到可直接新增）</label>
              <SearchSelect
                items={vendors}
                valueId={f.vendor_id}
                placeholder="輸入關鍵字搜尋廠商"
                createLabel="新增廠商"
                onSelect={id => setF(p => ({ ...p, vendor_id: id }))}
                onCreate={createVendor_}
              />
              {selVendor?.address && (
                <a href={mapsUrl(selVendor.address)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                  <Navigation size={11} /> Google Map 導航：{selVendor.address}
                </a>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass}>備註</label>
            <textarea value={f.plan_notes} onChange={e => setF(p => ({ ...p, plan_notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm pt-2">
              <input type="checkbox" checked={f.remind_email} onChange={e => setF(p => ({ ...p, remind_email: e.target.checked }))} />
              Email 提醒
            </label>
            {f.remind_email && (
              <select value={f.remind_days_before} onChange={e => setF(p => ({ ...p, remind_days_before: Number(e.target.value) }))} className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm mt-2">
                <option value={0}>當天早上 08:00</option>
                <option value={1}>前 1 天</option>
                <option value={3}>前 3 天</option>
              </select>
            )}
            {f.schedule_date === todayStr && !f.is_gap_task && (
              <label className="flex items-center gap-2 text-sm pt-2">
                <input type="checkbox" checked={f.is_adhoc} onChange={e => setF(p => ({ ...p, is_adhoc: e.target.checked }))} />
                臨時插入（非原規劃）
              </label>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? '儲存中…' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

// ============ 可搜尋下拉（含快速新增） ============
function SearchSelect({ items, valueId, placeholder, createLabel, onSelect, onCreate }: {
  items: Company[]
  valueId: string
  placeholder: string
  createLabel: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = items.find(i => i.id === valueId)
  const kw = q.trim().toLowerCase()
  const list = kw ? items.filter(i => i.company_name.toLowerCase().includes(kw)) : items

  return (
    <div className="relative">
      <input
        value={open ? q : (selected?.company_name ?? '')}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { setQ(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={selected ? selected.company_name : placeholder}
        className={inputClass}
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => onSelect('')}
          title="清除"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <button type="button" onMouseDown={() => { onSelect(''); setOpen(false) }}
            className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">— 不指定 —</button>
          {list.slice(0, 50).map(i => (
            <button
              type="button"
              key={i.id}
              onMouseDown={() => { onSelect(i.id); setOpen(false) }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${i.id === valueId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'}`}
            >
              {i.company_name}
              {i.address && <span className="text-xs text-gray-400 ml-1">{i.address}</span>}
            </button>
          ))}
          {kw && list.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">找不到「{q.trim()}」</div>
          )}
          {kw.length > 0 && !items.some(i => i.company_name.toLowerCase() === kw) && (
            <button
              type="button"
              onMouseDown={() => { onCreate(q.trim()); setOpen(false) }}
              className="block w-full text-left px-3 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 border-t border-gray-100"
            >
              ＋ {createLabel}「{q.trim()}」
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============ 填實際結果 Modal（原預定保留，供比對） ============
function ActualModal({ schedule, onClose, onSaved }: {
  schedule: Schedule
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const now = new Date()
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const [f, setF] = useState({
    actual_start: hm(schedule.actual_start) || nowHm,
    actual_end: hm(schedule.actual_end),
    status: schedule.status === '未開始' ? '已完成' : schedule.status,
    actual_result: schedule.actual_result ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('schedules').update({
      actual_start: f.actual_start || null,
      actual_end: f.actual_end || null,
      status: f.status,
      actual_result: f.actual_result || null,
    }).eq('id', schedule.id)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">填實際結果</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          預定：{schedule.schedule_date.replace(/-/g, '/')} {hm(schedule.plan_start)}{schedule.plan_end ? `–${hm(schedule.plan_end)}` : ''}・{schedule.title}
          <br />原預定會保留，供日／週達成率比對
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>實際開始</label>
              <input type="time" value={f.actual_start} onChange={e => setF(p => ({ ...p, actual_start: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>實際結束</label>
              <input type="time" value={f.actual_end} onChange={e => setF(p => ({ ...p, actual_end: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>狀態</label>
              <select value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value }))} className={inputClass}>
                {['已完成', '延誤完成', '進行中', '改期', '取消'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>結果備註</label>
            <textarea
              value={f.actual_result}
              onChange={e => setF(p => ({ ...p, actual_result: e.target.value }))}
              rows={3}
              placeholder="例：完成勘查，追加 USB 延伸器需求，已開報價單"
              className={inputClass + ' resize-none'}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? '儲存中…' : '儲存實際結果'}</button>
        </div>
      </div>
    </div>
  )
}
