'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Check, X, Clock, CalendarDays, Cake, ShieldCheck, Sparkles, Pencil, Navigation, Trash2 } from 'lucide-react'

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

export default function TodaySchedule({ room = 'sales' }: { room?: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<Sched[]>([])
  const [gaps, setGaps] = useState<Sched[]>([])
  const [occ, setOcc] = useState<Occ[]>([])
  const [editing, setEditing] = useState<Sched | null>(null)
  const [f, setF] = useState({ title: '', plan_start: '', actual_start: '', status: '已完成', actual_result: '' })
  const [editGap, setEditGap] = useState<{ id: string; title: string; gap_due_date: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newGap, setNewGap] = useState('')
  const [saving, setSaving] = useState(false)

  const todayStr = fmtLocal(new Date())
  const md = todayStr.slice(5)

  const fetchAll = useCallback(async () => {
    const [schedRes, gapRes, impRes, cbRes, clbRes] = await Promise.all([
      supabase.from('schedules')
        .select('*, clients(company_name, address), vendors(company_name)')
        .eq('is_gap_task', false).eq('schedule_date', todayStr).eq('room', room)
        .order('plan_start', { ascending: true }),
      supabase.from('schedules')
        .select('*')
        .eq('is_gap_task', true).eq('room', room).neq('status', '取消').neq('status', '已完成')
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
  }, [todayStr, room]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addToday() {
    const title = newTitle.trim()
    if (!title) return
    setSaving(true)
    const { error } = await supabase.from('schedules').insert({
      schedule_date: todayStr, title, type: '內部作業', room,
      is_gap_task: false, is_adhoc: true, remind_email: false, remind_days_before: 0,
    })
    setSaving(false)
    if (error) { alert('新增失敗：' + error.message); return }
    setNewTitle(''); fetchAll()
  }

  async function addGap() {
    const title = newGap.trim()
    if (!title) return
    setSaving(true)
    const { error } = await supabase.from('schedules').insert({
      schedule_date: todayStr, title, type: '內部作業', room,
      is_gap_task: true, is_adhoc: false, remind_email: false, remind_days_before: 0,
    })
    setSaving(false)
    if (error) { alert('新增失敗：' + error.message); return }
    setNewGap(''); fetchAll()
  }

  useEffect(() => { fetchAll() }, [fetchAll])

  const done = items.filter(s => s.status === '已完成' || s.status === '延誤完成').length

  function startEdit(s: Sched) {
    const now = new Date()
    setF({
      title: s.title,
      plan_start: hm(s.plan_start),
      actual_start: hm(s.actual_start) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      status: s.status === '未開始' ? '已完成' : s.status,
      actual_result: s.actual_result ?? '',
    })
    setEditing(s)
  }

  async function saveActual() {
    if (!editing) return
    const title = f.title.trim()
    if (!title) { alert('行程內容不可空白'); return }
    const { error } = await supabase.from('schedules').update({
      title,
      plan_start: f.plan_start || null,
      actual_start: f.actual_start || null,
      status: f.status,
      actual_result: f.actual_result || null,
    }).eq('id', editing.id)
    if (error) { alert('儲存失敗：' + error.message); return }
    setEditing(null)
    fetchAll()
  }

  async function deleteSched(id: string) {
    if (!confirm('確定刪除此項目？')) return
    await supabase.from('schedules').delete().eq('id', id)
    setEditing(null); setEditGap(null)
    fetchAll()
  }

  async function saveGap() {
    if (!editGap) return
    const title = editGap.title.trim()
    if (!title) { alert('任務內容不可空白'); return }
    const { error } = await supabase.from('schedules').update({
      title,
      gap_due_date: editGap.gap_due_date || null,
    }).eq('id', editGap.id)
    if (error) { alert('儲存失敗：' + error.message); return }
    setEditGap(null)
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
          <p className="text-gray-400 text-sm text-center py-3">今日尚無預定行程，可直接在下方新增</p>
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
                  <div className="flex gap-1 shrink-0">
                    {s.status === '未開始' && (
                      <button onClick={() => quickDone(s)} title="標記完成" className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg border border-gray-100"><Check size={14} /></button>
                    )}
                    <button onClick={() => startEdit(s)} title="編輯（內容／時間／實際結果）"
                      className={`p-1.5 rounded-lg ${s.status === '未開始' ? 'text-gray-400 border border-gray-100' : 'text-gray-300'} hover:text-blue-600`}><Pencil size={13} /></button>
                  </div>
                </div>

                {/* Inline 編輯：預定內容 + 實際結果（原預定保留供比對） */}
                {editing?.id === s.id && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 my-1.5 space-y-2">
                    <div>
                      <div className="text-xs text-blue-700 font-medium mb-1.5">預定內容</div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <input type="time" value={f.plan_start} onChange={e => setF(p => ({ ...p, plan_start: e.target.value }))}
                          title="預定時間" className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-28" />
                        <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') saveActual() }}
                          placeholder="行程內容" className="flex-1 min-w-[160px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-700 font-medium mb-1.5">實際結果</div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <input type="time" value={f.actual_start} onChange={e => setF(p => ({ ...p, actual_start: e.target.value }))}
                          title="實際開始時間" className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-28" />
                        <select value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value }))}
                          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm">
                          {['未開始', '已完成', '延誤完成', '進行中', '改期', '取消'].map(x => <option key={x}>{x}</option>)}
                        </select>
                        <input value={f.actual_result} onChange={e => setF(p => ({ ...p, actual_result: e.target.value }))}
                          placeholder="結果備註" className="flex-1 min-w-[160px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <button onClick={saveActual} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium">儲存</button>
                      <button onClick={() => setEditing(null)} className="px-2 py-1.5 text-gray-500 hover:text-gray-800 text-xs">取消</button>
                      <button onClick={() => deleteSched(s.id)} title="刪除此行程" className="ml-auto p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 行內新增今日行程 */}
        <div className="flex items-center gap-1.5 mt-3">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addToday() }}
            placeholder="新增今日行程…（Enter 送出）"
            className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={addToday} disabled={saving || !newTitle.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">
            新增
          </button>
        </div>

        {/* 空檔任務 */}
        <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <Clock size={14} className="text-gray-400" /> 空檔任務
            </div>
            <div className="space-y-1.5">
              {gaps.map(t => (
                editGap?.id === t.id ? (
                  <div key={t.id} className="flex flex-wrap items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <input
                      value={editGap.title}
                      onChange={e => setEditGap(p => p && ({ ...p, title: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveGap(); if (e.key === 'Escape') setEditGap(null) }}
                      autoFocus
                      placeholder="任務內容"
                      className="flex-1 min-w-[130px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input type="date" value={editGap.gap_due_date} title="到期日（可留空）"
                      onChange={e => setEditGap(p => p && ({ ...p, gap_due_date: e.target.value }))}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-36" />
                    <button onClick={saveGap} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium">儲存</button>
                    <button onClick={() => setEditGap(null)} title="取消" className="p-1.5 text-gray-400 hover:text-gray-700"><X size={14} /></button>
                    <button onClick={() => deleteSched(t.id)} title="刪除" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                ) : (
                  <div key={t.id} className="flex items-center gap-2.5 text-sm">
                    <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                      <input type="checkbox" checked={false} onChange={() => toggleGap(t)} className="w-4 h-4 rounded shrink-0" />
                      <span className="flex-1 min-w-0 text-gray-800">{t.title}</span>
                    </label>
                    {t.gap_due_date && (
                      <span className={`text-xs shrink-0 ${t.gap_due_date < todayStr ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {t.gap_due_date.slice(5).replace('-', '/')}
                      </span>
                    )}
                    <button onClick={() => setEditGap({ id: t.id, title: t.title, gap_due_date: t.gap_due_date ?? '' })}
                      title="編輯" className="p-1 text-gray-300 hover:text-blue-600 shrink-0"><Pencil size={13} /></button>
                  </div>
                )
              ))}
              {gaps.length === 0 && <p className="text-xs text-gray-400">目前沒有空檔任務</p>}
            </div>

            {/* 行內新增空檔任務 */}
            <div className="flex items-center gap-1.5 mt-2.5">
              <input
                value={newGap}
                onChange={e => setNewGap(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addGap() }}
                placeholder="新增空檔任務…（Enter 送出）"
                className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={addGap} disabled={saving || !newGap.trim()}
                className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">
                新增
              </button>
            </div>
          </div>
      </div>
    </div>
  )
}
