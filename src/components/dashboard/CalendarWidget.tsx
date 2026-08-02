'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Check } from 'lucide-react'

interface Sched {
  id: string
  schedule_date: string
  plan_start: string | null
  title: string
  type: string
  status: string
  clients?: { company_name: string } | null
  vendors?: { company_name: string } | null
}

const TYPE_DOT: Record<string, string> = {
  '客戶拜訪': 'bg-purple-500',
  '廠商聯絡': 'bg-teal-500',
  '叫修服務': 'bg-orange-500',
  '內部作業': 'bg-blue-500',
  '其他': 'bg-gray-400',
}
const STATUS_PILL: Record<string, string> = {
  '未開始': 'bg-gray-100 text-gray-600',
  '進行中': 'bg-blue-100 text-blue-700',
  '已完成': 'bg-green-100 text-green-700',
  '延誤完成': 'bg-amber-100 text-amber-700',
  '改期': 'bg-orange-100 text-orange-700',
  '取消': 'bg-red-100 text-red-600',
}
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function hm(t: string | null): string { return t ? t.slice(0, 5) : '' }

export default function CalendarWidget({ room = 'sales' }: { room?: string }) {
  const supabase = createClient()
  const today = useMemo(() => new Date(), [])
  const todayStr = ymd(today)

  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(todayStr)
  const [items, setItems] = useState<Sched[]>([])
  const [loading, setLoading] = useState(true)

  // 行內新增
  const [newTitle, setNewTitle] = useState('')
  const [newStart, setNewStart] = useState('')
  const [saving, setSaving] = useState(false)
  // 行內編輯標題
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const monthStart = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
  const monthEnd = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))

  const fetchMonth = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('schedules')
      .select('id, schedule_date, plan_start, title, type, status, clients(company_name), vendors(company_name)')
      .eq('is_gap_task', false)
      .eq('room', room)
      .gte('schedule_date', monthStart)
      .lte('schedule_date', monthEnd)
      .order('plan_start', { ascending: true })
    setItems((data ?? []) as Sched[])
    setLoading(false)
  }, [monthStart, monthEnd, room]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addSchedule() {
    const title = newTitle.trim()
    if (!title) return
    setSaving(true)
    const { error } = await supabase.from('schedules').insert({
      schedule_date: selected,
      plan_start: newStart || null,
      title,
      type: '內部作業',
      room,
      is_gap_task: false,
      is_adhoc: false,
      remind_email: false,
      remind_days_before: 0,
    })
    setSaving(false)
    if (error) { alert('新增失敗：' + error.message); return }
    setNewTitle(''); setNewStart('')
    fetchMonth()
  }

  async function saveTitle(id: string) {
    const t = editTitle.trim()
    if (!t) { setEditingId(null); return }
    const { error } = await supabase.from('schedules').update({ title: t }).eq('id', id)
    setEditingId(null)
    if (error) { alert('更新失敗：' + error.message); return }
    fetchMonth()
  }

  useEffect(() => { fetchMonth() }, [fetchMonth])

  // 依日期分組
  const byDate = useMemo(() => {
    const map: Record<string, Sched[]> = {}
    items.forEach(s => { (map[s.schedule_date] ??= []).push(s) })
    return map
  }, [items])

  // 產生 6 週 x 7 的格子
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay()) // 回到週日
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const monthLabel = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`
  const selItems = byDate[selected] ?? []

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CalendarDays size={17} className="text-blue-600" /> 行事曆
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
          <span className="text-sm font-medium text-gray-700 w-24 text-center">{monthLabel}</span>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
          <Link href="/schedule" className="ml-1 text-sm text-blue-600 hover:underline whitespace-nowrap">開啟 →</Link>
        </div>
      </div>

      {/* 星期列 */}
      <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 mb-1">
        {WEEK.map(w => <div key={w} className="py-1">{w}</div>)}
      </div>

      {/* 日期格 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const ds = ymd(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const dayItems = byDate[ds] ?? []
          const isToday = ds === todayStr
          const isSel = ds === selected
          return (
            <button
              key={i}
              onClick={() => setSelected(ds)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-1 text-xs transition border ${
                isSel ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'
              } ${inMonth ? 'text-gray-800' : 'text-gray-300'}`}
            >
              <span className={`w-5 h-5 flex items-center justify-center rounded-full ${
                isToday ? 'bg-blue-600 text-white font-semibold' : ''
              }`}>{d.getDate()}</span>
              {dayItems.length > 0 && (
                <span className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {dayItems.slice(0, 3).map(s => (
                    <span key={s.id} className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[s.type] ?? 'bg-gray-400'}`} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 選定日期的項目 */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-xs font-medium text-gray-500 mb-2">
          {selected.replace(/-/g, '/')} 的行程{loading ? '（載入中…）' : `（${selItems.length}）`}
        </div>
        {selItems.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">當日無行程，可直接在下方新增</p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {selItems.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 w-10 shrink-0 text-xs">{hm(s.plan_start) || '—'}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[s.type] ?? 'bg-gray-400'}`} />
                {editingId === s.id ? (
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => saveTitle(s.id)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTitle(s.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-1 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <button
                    onClick={() => { setEditingId(s.id); setEditTitle(s.title) }}
                    title="點一下可改標題"
                    className={`flex-1 min-w-0 truncate text-left ${s.status === '已完成' ? 'line-through text-gray-400' : 'text-gray-800 hover:text-blue-600'}`}
                  >
                    {s.title}
                    <span className="text-xs text-gray-400 ml-1">{s.clients?.company_name ?? s.vendors?.company_name ?? ''}</span>
                  </button>
                )}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_PILL[s.status] ?? ''}`}>{s.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* 行內新增行程 */}
        <div className="flex items-center gap-1.5 mt-2.5">
          <input
            type="time"
            value={newStart}
            onChange={e => setNewStart(e.target.value)}
            className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSchedule() }}
            placeholder={`在 ${selected.slice(5).replace('-', '/')} 新增行程…`}
            className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addSchedule}
            disabled={saving || !newTitle.trim()}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0"
          >
            {saving ? <Check size={13} /> : <Plus size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}
