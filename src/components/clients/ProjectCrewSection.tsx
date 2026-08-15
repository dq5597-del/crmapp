'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, HardHat, Crown, ChevronDown, ChevronRight, Clock, CalendarRange, UserPlus } from 'lucide-react'

type Crew = {
  id: string
  project_id: string
  member_kind: string
  employee_id?: string | null
  contractor_id?: string | null
  name: string
  phone?: string | null
  role: string
  is_leader: boolean
  start_date?: string | null
  end_date?: string | null
  daily_rate?: number | string
  notes?: string | null
}

type Log = {
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

type Group = { key: string; crew: Crew | null; name: string; member_kind: string; logs: Log[] }

const KINDS = ['員工', '協力廠商', '臨時工'] as const
const ROLES = ['工頭', '技師', '工班人員', '助手'] as const
const RATE_TYPES = ['日薪', '時薪', '點工', '外包計件'] as const
const KIND_SECTION: Record<string, { label: string; bar: string }> = {
  '員工': { label: '👔 正式員工', bar: 'border-blue-200 bg-blue-50/60 text-blue-800' },
  '協力廠商': { label: '🤝 協力廠商', bar: 'border-purple-200 bg-purple-50/60 text-purple-800' },
  '臨時工': { label: '👷 臨時工', bar: 'border-amber-200 bg-amber-50/60 text-amber-800' },
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

export default function ProjectCrewSection({ projectId, onBeforeSave }: {
  projectId: string
  onBeforeSave?: () => Promise<boolean>
}) {
  const supabase = createClient()
  const [crew, setCrew] = useState<Crew[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [taskItems, setTaskItems] = useState<{ task_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [noTable, setNoTable] = useState(false)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [formOpen, setFormOpen] = useState(false)

  const [batch, setBatch] = useState(false)
  const [form, setForm] = useState({
    person: '', name: '', member_kind: '員工',
    date_from: today(), date_to: today(),
    hours: '8', rate_type: '日薪', rate: '0',
    work_item: '', notes: '',
  })

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    const [cRes, wRes, rRes, tRes] = await Promise.all([
      supabase.from('project_crew').select('*').eq('project_id', projectId).order('is_leader', { ascending: false }).order('created_at'),
      supabase.from('project_work_logs').select('*').eq('project_id', projectId)
        .order('work_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('hr_roster').select('*').order('name'),
      // 施工項目下拉固定抓「標準施工範本」的 7 個工項（不看這個專案有沒有實際套用過範本）
      supabase.from('project_task_template_items')
        .select('task_name, seq_no, project_task_templates!inner(name)')
        .eq('project_task_templates.name', '標準施工範本')
        .order('seq_no'),
    ])
    if (cRes.error || wRes.error) { console.error(cRes.error || wRes.error); setNoTable(true) }
    setCrew((cRes.data as any) ?? [])
    setLogs((wRes.data as any) ?? [])
    setRoster(rRes.data ?? [])
    setTaskItems((tRes.data as any) ?? [])
    setLoading(false)
  }

  /** 人員清單直接從「派工紀錄」帶出來：每個 crew 帶著自己的工時明細；
   *  萬一有舊資料的紀錄沒有掛 crew_id，用姓名兜一組，畫面上仍看得到、但角色/工頭不可編輯。 */
  const groups: Group[] = useMemo(() => {
    const crewIds = new Set(crew.map(c => c.id))
    const crewGroups: Group[] = crew.map(c => ({
      key: c.id, crew: c, name: c.name, member_kind: c.member_kind,
      logs: logs.filter(l => l.crew_id === c.id),
    }))
    const orphanLogs = logs.filter(l => !l.crew_id || !crewIds.has(l.crew_id))
    const orphanNames = Array.from(new Set(orphanLogs.map(l => l.name)))
    const orphanGroups: Group[] = orphanNames.map(nm => {
      const ls = orphanLogs.filter(l => l.name === nm)
      return { key: `name:${nm}`, crew: null, name: nm, member_kind: ls[0]?.member_kind ?? '員工', logs: ls }
    })
    return [...crewGroups, ...orphanGroups].sort((a, b) => {
      if (!!a.crew?.is_leader !== !!b.crew?.is_leader) return a.crew?.is_leader ? -1 : 1
      const da = a.logs.map(l => l.work_date).sort()[0] ?? '9999'
      const db = b.logs.map(l => l.work_date).sort()[0] ?? '9999'
      return da === db ? a.name.localeCompare(b.name) : da.localeCompare(db)
    })
  }, [crew, logs])

  /** 依身分分成三組顯示，不要混在一起 */
  const groupedByKind = useMemo(
    () => KINDS.map(k => ({ kind: k, items: groups.filter(g => g.member_kind === k) })),
    [groups]
  )

  const summary = useMemo(() => {
    const hours = logs.reduce((s, l) => s + n(l.hours), 0)
    const labor = logs.filter(l => l.rate_type !== '外包計件').reduce((s, l) => s + n(l.cost), 0)
    const outsource = logs.filter(l => l.rate_type === '外包計件').reduce((s, l) => s + n(l.cost), 0)
    const days = new Set(logs.map(l => l.work_date)).size
    const leader = crew.find(c => c.is_leader)
    return { hours, labor, outsource, days, people: groups.length, leader }
  }, [logs, crew, groups])

  /** 選人：本專案已有人員（crew）優先帶日薪，其次全公司名冊 */
  function pickPerson(key: string) {
    if (!key) { setForm(f => ({ ...f, person: '', name: '' })); return }
    const [src, id] = key.split('|')
    if (src === 'crew') {
      const c = crew.find(x => x.id === id)
      if (c) setForm(f => ({ ...f, person: key, name: c.name, member_kind: c.member_kind, rate: String(n(c.daily_rate) || n(f.rate)) }))
    } else {
      const p = roster.find(x => x.id === id)
      if (p) setForm(f => ({ ...f, person: key, name: p.name, member_kind: p.kind, rate: String(n(p.day_rate) || n(f.rate)) }))
    }
  }

  /** 快速幫某個已存在的人再登記一天：不用重選人，表單直接帶入 */
  function quickAddFor(g: Group) {
    setForm(f => ({
      ...f,
      person: g.crew ? `crew|${g.crew.id}` : '',
      name: g.name,
      member_kind: g.member_kind,
      rate: g.crew ? String(n(g.crew.daily_rate) || n(f.rate)) : f.rate,
      date_from: today(), date_to: today(),
    }))
    setBatch(false)
    setFormOpen(true)
  }

  const previewDates = batch ? dateRange(form.date_from, form.date_to) : [form.date_from]
  const previewCost = (() => {
    const r = n(form.rate), h = n(form.hours)
    const one = form.rate_type === '日薪' ? Math.round(r * h / 8)
      : form.rate_type === '時薪' ? Math.round(r * h)
      : Math.round(r)
    return one * previewDates.length
  })()

  /** 人員清單「直接從派工紀錄帶出」：登記派工時如果這個人在本專案還沒有 project_crew 資料，
   *  就自動幫他建一筆（帶預設角色），不用另外跑「加人」流程。 */
  async function ensureCrewTarget(): Promise<{ crewId: string; memberKind: string; name: string } | null> {
    const name = form.name.trim()
    if (form.person.startsWith('crew|')) {
      const id = form.person.split('|')[1]
      const c = crew.find(x => x.id === id)
      if (c) return { crewId: c.id, memberKind: c.member_kind, name: c.name }
    }
    if (form.person.startsWith('roster|')) {
      const id = form.person.split('|')[1]
      const p = roster.find(x => x.id === id)
      if (p) {
        const existing = crew.find(c => c.name === p.name && c.member_kind === p.kind)
        if (existing) return { crewId: existing.id, memberKind: existing.member_kind, name: existing.name }
        const { data, error } = await supabase.from('project_crew').insert({
          project_id: projectId, member_kind: p.kind,
          employee_id: p.kind === '員工' ? p.id : null,
          contractor_id: p.kind === '員工' ? null : p.id,
          name: p.name, phone: p.phone || null, role: '工班人員', is_leader: false,
          start_date: form.date_from || today(), daily_rate: n(p.day_rate) || 0,
        }).select().single()
        if (error) { alert('建立人員失敗：' + error.message); return null }
        return { crewId: (data as any).id, memberKind: p.kind, name: p.name }
      }
    }
    // 手動輸入姓名：專案裡已有同名同身分的人就沿用，否則自動新建一筆
    const existing = crew.find(c => c.name === name && c.member_kind === form.member_kind)
    if (existing) return { crewId: existing.id, memberKind: existing.member_kind, name: existing.name }
    const { data, error } = await supabase.from('project_crew').insert({
      project_id: projectId, member_kind: form.member_kind, name,
      role: '工班人員', is_leader: false, start_date: form.date_from || today(),
      daily_rate: n(form.rate) || 0,
    }).select().single()
    if (error) { alert('建立人員失敗：' + error.message); return null }
    return { crewId: (data as any).id, memberKind: form.member_kind, name }
  }

  async function addLog() {
    if (onBeforeSave && !(await onBeforeSave())) return
    if (!form.name.trim()) { alert('請選擇或輸入姓名'); return }
    if (previewDates.length === 0) { alert('日期區間不正確（起日不能晚於迄日）'); return }

    setSaving(true)
    const target = await ensureCrewTarget()
    if (!target) { setSaving(false); return }

    const payload = previewDates.map(d => ({
      project_id: projectId,
      crew_id: target.crewId,
      work_date: d,
      member_kind: target.memberKind,
      name: target.name,
      hours: n(form.hours),
      rate_type: form.rate_type,
      rate: n(form.rate),
      work_item: form.work_item || null,
      notes: form.notes || null,
    }))

    const { error } = await supabase.from('project_work_logs').insert(payload)
    setSaving(false)
    if (error) {
      if (error.code === '23505') alert('這個人在該日期、該工項已經登記過了。請改工項名稱，或先刪除原本那筆。')
      else alert('新增失敗：' + error.message)
      return
    }
    setOpen(o => ({ ...o, [target.crewId]: true }))
    setMsg(`已新增 ${payload.length} 筆`)
    setTimeout(() => setMsg(''), 2500)
    setForm(f => ({ ...f, work_item: '', notes: '' }))
    load()
  }

  async function removeLog(log: Log) {
    if (!confirm(`刪除 ${log.work_date} ${log.name} 的工時紀錄？`)) return
    const { error } = await supabase.from('project_work_logs').delete().eq('id', log.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    setLogs(ls => ls.filter(x => x.id !== log.id))
  }

  async function updateCrewField(id: string, patch: Partial<Crew>) {
    setCrew(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
    if (patch.is_leader) {
      await supabase.from('project_crew').update({ is_leader: false }).eq('project_id', projectId).neq('id', id)
      setCrew(cs => cs.map(c => c.id === id ? c : { ...c, is_leader: false }))
    }
    const { error } = await supabase.from('project_crew').update(patch).eq('id', id)
    if (error) { alert('更新失敗：' + error.message); load() }
  }

  async function removePerson(g: Group) {
    if (!confirm(`確定移除「${g.name}」？該人在本專案的 ${g.logs.length} 筆派工紀錄會一併刪除。`)) return
    if (g.crew) {
      await supabase.from('project_work_logs').delete().eq('crew_id', g.crew.id)
      const { error } = await supabase.from('project_crew').delete().eq('id', g.crew.id)
      if (error) { alert('刪除失敗：' + error.message); return }
    } else {
      const { error } = await supabase.from('project_work_logs')
        .delete().eq('project_id', projectId).eq('name', g.name).is('crew_id', null)
      if (error) { alert('刪除失敗：' + error.message); return }
    }
    load()
  }

  if (noTable) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        尚未建立施工團隊／工時資料表。請到 Supabase SQL Editor 執行 <code>supabase/schema_project_crew.sql</code> 與 <code>sql/project_work_logs.sql</code>。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 彙總 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1"><Crown size={11} className="text-amber-500" /> 工頭</div>
          <div className="text-sm font-semibold text-gray-900 truncate">{summary.leader?.name ?? '尚未指定'}</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs text-gray-500">施工人數</div>
          <div className="text-lg font-semibold text-gray-900">{summary.people}</div>
          <div className="text-xs text-gray-400 mt-0.5">{summary.days} 個工作天</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs text-gray-500">總工時</div>
          <div className="text-lg font-semibold text-gray-900">{summary.hours.toLocaleString()} 小時</div>
        </div>
        <div className="rounded-xl bg-blue-50 p-3">
          <div className="text-xs text-gray-500">人工成本</div>
          <div className="text-lg font-semibold text-blue-700">NT${summary.labor.toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-purple-50 p-3">
          <div className="text-xs text-gray-500">外包費用</div>
          <div className="text-lg font-semibold text-purple-700">NT${summary.outsource.toLocaleString()}</div>
        </div>
      </div>

      {/* 登記派工：人員直接帶出，不用另外「加人」；預設收合，點「新增派工紀錄」才展開欄位 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><UserPlus size={14} /> 登記派工（沒有的人會自動加入本專案人員）</span>
          <div className="flex items-center gap-3">
            {formOpen && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={batch} onChange={e => setBatch(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300" />
                <CalendarRange size={13} /> 連續多天一次登記
              </label>
            )}
            <button type="button" onClick={() => setFormOpen(o => !o)}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
              {formOpen ? <><ChevronDown size={14} /> 收合欄位</> : <><Plus size={14} /> 新增派工紀錄</>}
            </button>
          </div>
        </div>

        {formOpen && (
        <>
        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
          <div className="col-span-2 md:col-span-3">
            <label className="text-xs text-gray-500 mb-1 block">人員</label>
            <select value={form.person} onChange={e => pickPerson(e.target.value)} className={inp}>
              <option value="">— 手動輸入 —</option>
              {KINDS.map(k => {
                const list = roster.filter(p => p.kind === k)
                if (!list.length) return null
                return (
                  <optgroup key={k} label={`全公司名冊－${k}`}>
                    {list.map(p => (
                      <option key={`roster|${p.id}`} value={`roster|${p.id}`}>
                        {p.name}{p.skill ? `（${p.skill}）` : ''}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">姓名 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, person: '' }))} className={inp} />
          </div>

          <div className="col-span-1 md:col-span-1">
            <label className="text-xs text-gray-500 mb-1 block">身分</label>
            <select value={form.member_kind} onChange={e => setForm(f => ({ ...f, member_kind: e.target.value }))} className={inp}>
              {KINDS.map(k => <option key={k}>{k}</option>)}
            </select>
          </div>

          <div className={batch ? 'col-span-1 md:col-span-2' : 'col-span-1 md:col-span-2'}>
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

          <div className="col-span-1 md:col-span-1">
            <label className="text-xs text-gray-500 mb-1 block">計價</label>
            <select value={form.rate_type} onChange={e => setForm(f => ({ ...f, rate_type: e.target.value }))} className={inp}>
              {RATE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="col-span-1 md:col-span-1">
            <label className="text-xs text-gray-500 mb-1 block">單價</label>
            <input type="number" min={0} value={form.rate}
              onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className={inp} />
          </div>

          <div className="col-span-2 md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">施工項目</label>
            <select value={form.work_item} onChange={e => setForm(f => ({ ...f, work_item: e.target.value }))} className={inp}>
              <option value="">{taskItems.length ? '— 請選擇 —' : '尚未建立「標準施工範本」'}</option>
              {taskItems.map(t => <option key={t.task_name} value={t.task_name}>{t.task_name}</option>)}
            </select>
          </div>

          <div className="col-span-2 md:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">備註</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={inp} placeholder="選填" />
          </div>

          <div className="col-span-2 md:col-span-2 flex justify-end">
            <button type="button" onClick={addLog} disabled={saving}
              className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60 w-full md:w-auto justify-center">
              <Plus size={14} /> {saving ? '處理中…' : '新增'}
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
        </>
        )}
      </div>

      {/* 人員清單：直接由派工紀錄彙整而成，依身分分三組顯示，不混在一起 */}
      {loading ? (
        <div className="p-6 text-center text-gray-400 text-sm">載入中…</div>
      ) : groups.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          <HardHat size={20} className="mx-auto mb-1 text-gray-300" />
          尚無施工人員，上方登記第一筆派工即可自動加入
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByKind.map(({ kind, items }) => {
            if (items.length === 0) return null
            const sec = KIND_SECTION[kind]
            return (
              <div key={kind} className="space-y-2">
                <div className={`flex items-center gap-2 text-sm font-semibold rounded-lg border px-3 py-1.5 ${sec.bar}`}>
                  <span>{sec.label}</span>
                  <span className="text-xs font-normal opacity-70">{items.length} 人</span>
                </div>
                {items.map(g => {
                  const isOpen = !!open[g.key]
                  const totalDays = new Set(g.logs.map(l => l.work_date)).size
                  const totalHours = g.logs.reduce((s, l) => s + n(l.hours), 0)
                  const totalCost = g.logs.reduce((s, l) => s + n(l.cost), 0)
                  return (
                    <div key={g.key}
                      className={`rounded-xl border overflow-hidden ${g.crew?.is_leader ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
                      <div className="p-3">
                        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                          <button type="button" onClick={() => setOpen(o => ({ ...o, [g.key]: !isOpen }))}
                            className="col-span-2 md:col-span-3 flex items-center gap-1.5 text-left">
                            {isOpen ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
                            <span className="font-medium text-gray-900 truncate">{g.name}</span>
                          </button>

                          {g.crew ? (
                            <>
                              <div className="col-span-1 md:col-span-2">
                                <label className="text-xs text-gray-500 mb-1 block">角色</label>
                                <select value={g.crew.role} onChange={e => updateCrewField(g.crew!.id, { role: e.target.value })} className={inp}>
                                  {ROLES.map(k => <option key={k}>{k}</option>)}
                                </select>
                              </div>
                              <div className="col-span-1 md:col-span-2">
                                <label className="text-xs text-gray-500 mb-1 block">電話</label>
                                <input value={g.crew.phone ?? ''} onChange={e => updateCrewField(g.crew!.id, { phone: e.target.value })} className={inp} />
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2 md:col-span-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                              舊資料未連結人員檔，角色/電話無法編輯
                            </div>
                          )}

                          <div className="col-span-2 md:col-span-3 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                            <span>累計 <b className="text-gray-900">{totalDays}</b> 天</span>
                            <span>{totalHours} 小時</span>
                            <span>成本 <b className="text-gray-900">NT${totalCost.toLocaleString()}</b></span>
                          </div>

                          <div className="col-span-2 md:col-span-2 flex md:justify-end gap-1">
                            {g.crew && (
                              <button type="button" title="設為工頭" onClick={() => updateCrewField(g.crew!.id, { is_leader: true })}
                                className={`p-1.5 rounded-lg ${g.crew.is_leader ? 'bg-amber-400 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>
                                <Crown size={15} />
                              </button>
                            )}
                            <button type="button" title="再加一天" onClick={() => quickAddFor(g)}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50">
                              <Plus size={15} />
                            </button>
                            <button type="button" title="移除此人" onClick={() => removePerson(g)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="border-t border-gray-100 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 text-left text-gray-500">
                                <th className="px-3 py-1.5 font-medium">日期</th>
                                <th className="px-3 py-1.5 font-medium">施工項目</th>
                                <th className="px-3 py-1.5 font-medium">備註</th>
                                <th className="px-3 py-1.5 font-medium text-right">工時</th>
                                <th className="px-3 py-1.5 font-medium">計價</th>
                                <th className="px-3 py-1.5 font-medium text-right">單價</th>
                                <th className="px-3 py-1.5 font-medium text-right">成本</th>
                                <th className="px-3 py-1.5"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.logs.length === 0 ? (
                                <tr><td colSpan={8} className="px-3 py-3 text-center text-gray-400">
                                  <Clock size={14} className="inline mr-1" /> 尚無工時紀錄
                                </td></tr>
                              ) : g.logs.slice().sort((a, b) => b.work_date.localeCompare(a.work_date)).map(l => (
                                <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                  <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{l.work_date}</td>
                                  <td className="px-3 py-1.5 text-gray-600">{l.work_item ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-gray-500">{l.notes ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-700">{n(l.hours)}</td>
                                  <td className="px-3 py-1.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${l.rate_type === '外包計件' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{l.rate_type}</span>
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-500">{n(l.rate).toLocaleString()}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-gray-900">{n(l.cost).toLocaleString()}</td>
                                  <td className="px-3 py-1.5 text-right">
                                    <button type="button" onClick={() => removeLog(l)} className="p-1 rounded-lg text-red-500 hover:bg-red-50">
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
