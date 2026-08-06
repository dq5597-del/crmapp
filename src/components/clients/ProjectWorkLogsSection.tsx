'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Clock, CalendarRange } from 'lucide-react'

type WorkLog = {
  id: string
  project_id: string
  crew_id: string | null
  work_date: string
  member_kind: string
  name: string
  hours: number
  rate_type: string
  rate: number
  cost: number
  work_item: string | null
  notes: string | null
}

const RATE_TYPES = ['日薪', '時薪', '點工', '外包計件'] as const
const KIND_COLORS: Record<string, string> = {
  '員工': 'bg-blue-100 text-blue-700',
  '協力廠商': 'bg-purple-100 text-purple-700',
  '臨時工': 'bg-amber-100 text-amber-700',
}
const RATE_HINT: Record<string, string> = {
  '日薪': '成本 = 日薪 × 工時 ÷ 8',
  '時薪': '成本 = 時薪 × 工時',
  '點工': '成本 = 單價（一趟一價，與工時無關）',
  '外包計件': '成本 = 單價，計入外包費用而非人工',
}

const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400'
const n = (v: any) => Number(v ?? 0) || 0
const today = () => new Date().toISOString().slice(0, 10)

/** 產生 from ~ to 之間的每一天（含頭尾），上限 60 天避免誤填造成大量資料 */
function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  const a = new Date(from), b = new Date(to)
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || a > b) return out
  const cur = new Date(a)
  while (cur <= b && out.length < 60) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export default function ProjectWorkLogsSection({ projectId, onBeforeSave }: {
  projectId: string
  onBeforeSave?: () => Promise<boolean>
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<WorkLog[]>([])
  const [crew, setCrew] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [noTable, setNoTable] = useState(false)
  const [msg, setMsg] = useState('')

  // 新增表單
  const [batch, setBatch] = useState(false)
  const [form, setForm] = useState({
    person: '', name: '', member_kind: '員工', crew_id: '' as string | null,
    date_from: today(), date_to: today(),
    hours: '8', rate_type: '日薪', rate: '0',
    work_item: '', notes: '',
  })

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    const [wRes, cRes, rRes] = await Promise.all([
      supabase.from('project_work_logs').select('*').eq('project_id', projectId)
        .order('work_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('project_crew').select('id, name, member_kind, daily_rate').eq('project_id', projectId).order('is_leader', { ascending: false }),
      supabase.from('hr_roster').select('*').order('name'),
    ])
    if (wRes.error) { console.error(wRes.error); setNoTable(true) }
    setRows((wRes.data as any) ?? [])
    setCrew(cRes.data ?? [])
    setRoster(rRes.data ?? [])
    setLoading(false)
  }

  const summary = useMemo(() => {
    const hours = rows.reduce((s, r) => s + n(r.hours), 0)
    const labor = rows.filter(r => r.rate_type !== '外包計件').reduce((s, r) => s + n(r.cost), 0)
    const outsource = rows.filter(r => r.rate_type === '外包計件').reduce((s, r) => s + n(r.cost), 0)
    const days = new Set(rows.map(r => r.work_date)).size
    return { hours, labor, outsource, days, people: new Set(rows.map(r => r.name)).size }
  }, [rows])

  /** 選人：優先帶本專案工班（已有日薪），其次全公司名冊 */
  function pickPerson(key: string) {
    if (!key) { setForm(f => ({ ...f, person: '', crew_id: null })); return }
    const [src, id] = key.split('|')
    if (src === 'crew') {
      const c = crew.find(x => x.id === id)
      if (c) setForm(f => ({ ...f, person: key, crew_id: id, name: c.name, member_kind: c.member_kind, rate: String(n(c.daily_rate) || n(f.rate)) }))
    } else {
      const p = roster.find(x => x.id === id)
      if (p) setForm(f => ({ ...f, person: key, crew_id: null, name: p.name, member_kind: p.kind, rate: String(n(p.day_rate) || n(f.rate)) }))
    }
  }

  const previewDates = batch ? dateRange(form.date_from, form.date_to) : [form.date_from]
  const previewCost = (() => {
    const r = n(form.rate), h = n(form.hours)
    const one = form.rate_type === '日薪' ? Math.round(r * h / 8)
      : form.rate_type === '時薪' ? Math.round(r * h)
      : Math.round(r)
    return one * previewDates.length
  })()

  async function add() {
    if (onBeforeSave && !(await onBeforeSave())) return
    if (!form.name.trim()) { alert('請選擇或輸入姓名'); return }
    if (previewDates.length === 0) { alert('日期區間不正確（起日不能晚於迄日）'); return }

    setSaving(true)
    const payload = previewDates.map(d => ({
      project_id: projectId,
      crew_id: form.crew_id || null,
      work_date: d,
      member_kind: form.member_kind,
      name: form.name.trim(),
      hours: n(form.hours),
      rate_type: form.rate_type,
      rate: n(form.rate),
      work_item: form.work_item || null,
      notes: form.notes || null,
    }))

    const { error } = await supabase.from('project_work_logs').insert(payload)
    setSaving(false)
    if (error) {
      // 唯一索引擋下重複派工
      if (error.code === '23505') {
        alert('這個人在該日期、該工項已經登記過了。請改工項名稱，或先刪除原本那筆。')
      } else {
        alert('新增失敗：' + error.message)
      }
      return
    }
    setMsg(`已新增 ${payload.length} 筆`)
    setTimeout(() => setMsg(''), 2500)
    setForm(f => ({ ...f, work_item: '', notes: '' }))
    load()
  }

  async function removeRow(r: WorkLog) {
    if (!confirm(`刪除 ${r.work_date} ${r.name} 的工時紀錄？`)) return
    const { error } = await supabase.from('project_work_logs').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    setRows(rs => rs.filter(x => x.id !== r.id))
  }

  if (noTable) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        尚未建立工時資料表。請到 Supabase SQL Editor 執行 <code>sql/project_work_logs.sql</code>。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 彙總 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs text-gray-500">總工時</div>
          <div className="text-lg font-semibold text-gray-900">{summary.hours.toLocaleString()} 小時</div>
          <div className="text-xs text-gray-400 mt-0.5">{summary.days} 個工作天 · {summary.people} 人</div>
        </div>
        <div className="rounded-xl bg-blue-50 p-3">
          <div className="text-xs text-gray-500">人工成本</div>
          <div className="text-lg font-semibold text-blue-700">NT${summary.labor.toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-purple-50 p-3">
          <div className="text-xs text-gray-500">外包費用</div>
          <div className="text-lg font-semibold text-purple-700">NT${summary.outsource.toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-orange-50 p-3">
          <div className="text-xs text-gray-500">合計</div>
          <div className="text-lg font-semibold text-orange-700">NT${(summary.labor + summary.outsource).toLocaleString()}</div>
        </div>
      </div>

      {/* 新增 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">登記派工</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={batch} onChange={e => setBatch(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300" />
            <CalendarRange size={13} /> 連續多天一次登記
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
          <div className="col-span-2 md:col-span-3">
            <label className="text-xs text-gray-500 mb-1 block">人員</label>
            <select value={form.person} onChange={e => pickPerson(e.target.value)} className={inp}>
              <option value="">— 手動輸入 —</option>
              {crew.length > 0 && (
                <optgroup label="本專案工班">
                  {crew.map(c => <option key={`crew|${c.id}`} value={`crew|${c.id}`}>{c.name}（{c.member_kind}）</option>)}
                </optgroup>
              )}
              <optgroup label="全公司名冊">
                {roster.map(p => <option key={`roster|${p.id}`} value={`roster|${p.id}`}>{p.name}（{p.kind}）</option>)}
              </optgroup>
            </select>
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">姓名 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} />
          </div>

          <div className={batch ? 'col-span-1 md:col-span-2' : 'col-span-1 md:col-span-3'}>
            <label className="text-xs text-gray-500 mb-1 block">{batch ? '起日' : '施工日期'}</label>
            <input type="date" value={form.date_from}
              onChange={e => setForm(f => ({ ...f, date_from: e.target.value, date_to: batch ? f.date_to : e.target.value }))}
              className={inp} />
          </div>
          {batch && (
            <div className="col-span-1 md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">迄日</label>
              <input type="date" value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} className={inp} />
            </div>
          )}

          <div className="col-span-1 md:col-span-1">
            <label className="text-xs text-gray-500 mb-1 block">工時</label>
            <input type="number" step="0.5" min={0} value={form.hours}
              onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} className={inp} />
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">計價方式</label>
            <select value={form.rate_type} onChange={e => setForm(f => ({ ...f, rate_type: e.target.value }))} className={inp}>
              {RATE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">單價</label>
            <input type="number" min={0} value={form.rate}
              onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className={inp} />
          </div>

          <div className="col-span-2 md:col-span-3">
            <label className="text-xs text-gray-500 mb-1 block">施工項目</label>
            <input value={form.work_item} onChange={e => setForm(f => ({ ...f, work_item: e.target.value }))}
              className={inp} placeholder="配線／掛架／調校" />
          </div>

          <div className="col-span-2 md:col-span-3">
            <label className="text-xs text-gray-500 mb-1 block">備註</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inp} />
          </div>

          <div className="col-span-2 md:col-span-2 flex justify-end">
            <button type="button" onClick={add} disabled={saving}
              className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60 w-full md:w-auto justify-center">
              <Plus size={14} /> {saving ? '新增中…' : '新增'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">{RATE_HINT[form.rate_type]}</span>
          <span className="text-gray-600">
            {previewDates.length > 1 && <span className="mr-2">將建立 <b>{previewDates.length}</b> 筆</span>}
            預計成本 <b className="text-gray-900">NT${previewCost.toLocaleString()}</b>
            {msg && <span className="ml-2 text-green-600">{msg}</span>}
          </span>
        </div>
      </div>

      {/* 明細 */}
      {loading ? (
        <div className="p-6 text-center text-gray-400 text-sm">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          <Clock size={20} className="mx-auto mb-1 text-gray-300" />
          尚無工時紀錄。上方登記第一筆派工。
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2 font-medium">日期</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">施工項目</th>
                  <th className="px-3 py-2 font-medium text-right">工時</th>
                  <th className="px-3 py-2 font-medium">計價</th>
                  <th className="px-3 py-2 font-medium text-right">單價</th>
                  <th className="px-3 py-2 font-medium text-right">成本</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.work_date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{r.name}</span>
                      <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${KIND_COLORS[r.member_kind] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.member_kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.work_item ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{n(r.hours)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${r.rate_type === '外包計件' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {r.rate_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{n(r.rate).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{n(r.cost).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeRow(r)}
                        className="p-1 rounded-lg text-red-500 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
