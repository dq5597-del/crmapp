'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Check, X, Clock, CalendarDays, Cake, ShieldCheck, Sparkles, Pencil, Navigation } from 'lucide-react'

interface Sched {
  id: string
  schedule_date: string
  plan_start: string | null
  plan_end: string | null
  title: string
  type: string
  is_gap_task: boolean
  gap_due_date: string | null
  is_adhoc: boolean
  actual_start: string | null
  actual_result: string | null
  status: string
  clients?: { company_name: string; address?: string | null } | null
  vendors?: { company_name: string } | null
}

interface Occ { key: string; title: string; date_type: string; company?: string }

const STATUS_COLORS: Record<string, string> = {
  '未開始':   'bg-gray-100 text-gray-600',
  '進行中':   'bg-blue-100 text-blue-700',
  '已完成':   'bg-green-100 text-green-700',
  '延誤完成': 'bg-amber-100 text-amber-700',
  '改期':     'bg-orange-100 text-orange-700',
  '取消':     'bg-red-100 text-red-600',
}

const OCC_ICON: Record<string, any> = { '生日': Cake, '週年': Sparkles, '保固到期': ShieldCheck, '合約續約': ShieldCheck }
const OCC_PILL: Record<string, string> = {
  '生日': 'bg-pink-100 text-pink-800', '週年': 'bg-pink-100 text-pink-800',
  '保固到期': 'bg-amber-100 text-amber-800', '合約續約': 'bg-amber-100 text-amber-800',
  '自訂': 'bg-gray-100 text-gray-700',
}

function fmtLocal(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function hm(t: string | null): string { return t ? t.slice(0, 5) : '' }

export default function TodaySchedule() {
  const supabase = createClient()
  const [items, setItems] = useState<Sched[]>([])
  const [gaps, setGaps] = useState<Sched[]>([])
  const [occ, setOcc] = useState<Occ[]>([])
  const [editing, setEditing] = useState<Sched | null>(null)
  const [f, setF] = useState({ actual_start: '', status: '已完成', actual_result: '' })
  const [loading, setLoading] = useState(true)

  const todayStr = fmtLocal(new Date())
  const md = todayStr.slice(5)

  const fetchAll = useCallback(async () => {
    const [schedRes, gapRes, impRes, cbRes, clbRes] = await Promise.all([
      supabase.from('schedules')
        .select('*, clients(company_name, address), vendors(company_name)')
        .eq('is_gap_task', false).eq('schedule_date', todayStr)
        .order('plan_start', { ascending: true }),
      supabase.from('schedules')
        .select('*')
        .eq('is_gap_task', true).neq('status', '取消').neq('status', '已完成')
        .order('gap_due_date', { ascending: true }).limit(6),
      supabase.from('important_dates').select('*, clients(company_name)').eq('is_active', true),
      supabase.from('contacts').select('id, name, birthday, clients(company_name)').not('birthday', 'is', null),
      supabase.from('clients').select('id, company_name, contact_name, birthday').not('birthday', 'is', null),
    ])
    setItems((schedRes.data ?? []) as Sched[])
    setGaps((gapRes.data ?? []) as Sched[])

    const out: Occ[] = []
    for (const r of (impRes.data ?? []) as any[]) {
      const hit = r.recurring ? r.the_date.slice(5) === md : r.the_date === todayStr
      if (hit) out.push({ key: r.id, title: r.title, date_type: r.date_type, company: r.clients?.company_name })
    }
    for (const c of (cbRes.data ?? []) as any[])
      if (c.birthday.slice(5) === md) out.push({ key: `cb-${c.id}`, title: `${c.name} 生日`, date_type: '生日', company: c.clients?.company_name })
    for (const c of (clbRes.data ?? []) as any[])
      if (c.birthday.slice(5) === md) out.push({ key: `clb-${c.id}`, title: `${c.contact_name ?? c.company_name} 生日`, date_type: '生日', company: c.company_name })
    setOcc(out)
    setLoading(false)
  }, [todayStr])

  useEffect(() => { fetchAll() }, [fetchAll])

  const done = items.filter(s => s.status === '已完成' || s.status === '延誤完成').length

  function startEdit(s: Sched) {
    const now = new Date()
    setF({
      actual_start: hm(s.actual_start) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      status: s.status === '未開始' ? '已完成' : s.status,
      actual_result: s.actual_result ?? '',
    })
    setEditing(s)
  }

  async function saveActual() {
    if (!editing) return
    await supabase.from('schedules').update({
      actual_start: f.actual_start || null,
      status: f.status,
      actual_result: f.actual_result || null,
    }).eq('id', editing.id)
    setEditing(null)
    fetchAll()
  }

  async function quickDone(s: Sched) {
    await supabase.from('schedules').update({
      status: '已完成',
      actual_result: s.actual_result ?? '完成',
    }).eq('id', s.id)
    fetchAll()
  }

  async function toggleGap(t: Sched) {
    await supabase.from('schedules').update({ status: '已完成', actual_result: '完成' }).eq('id', t.id)
    fetchAll()
  }

  if (loading) return null

  return (
    <div className="space-y-4">
      {/* 今日重要日子 */}
      {occ.length > 0 && (
        <div className="bg-pink-50 border border-pink-200 rounded-2xl px-4 py-3 flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-pink-800">今日重要日子：</span>
          {occ.map(o => {
            const Icon = OCC_ICON[o.date_type] ?? CalendarDays
            return (
              <span key={o.key} className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${OCC_PILL[o.date_type] ?? OCC_PILL['自訂']}`}>
                <Icon size={12} /> {o.title}{o.company ? `・${o.company}` : ''}
              </span>
            )
          })}
        </div>
      )}

      {/* 今日行程卡片 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays size={17} className="text-blue-600" /> 今日預定行程
          </h2>
          <div className="flex items-center gap-3">
            {items.length > 0 && <span className="text-xs text-gray-500">達成 {done}/{items.length}</span>}
            <Link href="/schedule" className="text-sm text-blue-600 hover:underline">開啟行事曆 →</Link>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">
            今日尚無預定行程・<Link href="/schedule" className="text-blue-600 hover:underline">去規劃</Link>
          </p>
        ) : (
          <div className="space-y-1">
            {items.map(s => (
              <div key={s.id}>
                <div className={`flex items-center gap-3 py-2 border-t border-gray-50 text-sm ${s.is_adhoc ? 'bg-orange-50/50 -mx-2 px-2 rounded' : ''}`}>
                  <span className="text-gray-500 w-11 shrink-0 text-xs">{hm(s.plan_start)}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium ${s.status === '已完成' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{s.title}</span>
                    <span className="text-xs text-gray-400 ml-2">{s.clients?.company_name ?? s.vendors?.company_name ?? ''}{s.is_adhoc ? '・臨時' : ''}</span>
                    {s.clients?.address && (
                      <a
                        href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.clients.address)}
                        target="_blank" rel="noopener noreferrer"
                        title={`Google Map 導航：${s.clients.address}`}
                        className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline ml-1.5 align-middle"
                      >
                        <Navigation size={11} />導航
                      </a>
                    )}
                    {s.actual_result && s.status !== '未開始' && (
                      <div className="text-xs text-gray-500 mt-0.5">{s.actual_start ? hm(s.actual_start) + ' ' : ''}{s.actual_result}</div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                  {s.status === '未開始' && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => quickDone(s)} title="標記完成" className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg border border-gray-100"><Check size={14} /></button>
                      <button onClick={() => startEdit(s)} title="填實際結果" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg border border-gray-100"><Pencil size={13} /></button>
                    </div>
                  )}
                  {s.status !== '未開始' && (
                    <button onClick={() => startEdit(s)} title="修改實際結果" className="p-1.5 text-gray-300 hover:text-blue-600 rounded-lg shrink-0"><Pencil size={13} /></button>
                  )}
                </div>

                {/* Inline 修改 = 填實際結果（原預定保留） */}
                {editing?.id === s.id && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 my-1.5">
                    <div className="text-xs text-blue-700 font-medium mb-2">填實際結果（原預定保留，供比對）</div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input type="time" value={f.actual_start} onChange={e => setF(p => ({ ...p, actual_start: e.target.value }))}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-28" />
                      <select value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value }))}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm">
                        {['已完成', '延誤完成', '進行中', '改期', '取消'].map(x => <option key={x}>{x}</option>)}
                      </select>
                      <input value={f.actual_result} onChange={e => setF(p => ({ ...p, actual_result: e.target.value }))}
                        placeholder="結果備註" className="flex-1 min-w-[160px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      <button onClick={saveActual} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">儲存</button>
                      <button onClick={() => setEditing(null)} className="p-1.5 text-gray-400 hover:text-gray-700"><X size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 空檔任務 */}
        {gaps.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <Clock size={14} className="text-gray-400" /> 空檔任務
            </div>
            <div className="space-y-1.5">
              {gaps.map(t => (
                <label key={t.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={false} onChange={() => toggleGap(t)} className="w-4 h-4 rounded" />
                  <span className="flex-1 text-gray-800">{t.title}</span>
                  {t.gap_due_date && (
                    <span className={`text-xs ${t.gap_due_date < todayStr ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {t.gap_due_date.slice(5).replace('-', '/')}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
