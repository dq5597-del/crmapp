'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, HardHat, Crown, Save } from 'lucide-react'

type Crew = {
  id?: string
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
  days?: number | string
  daily_rate?: number | string
  cost?: number | string
  notes?: string | null
}

const KINDS = ['員工', '協力廠商', '臨時工'] as const
const ROLES = ['工頭', '技師', '工班人員', '助手'] as const
const KIND_COLORS: Record<string, string> = {
  '員工': 'bg-blue-100 text-blue-700',
  '協力廠商': 'bg-purple-100 text-purple-700',
  '臨時工': 'bg-amber-100 text-amber-700',
}
const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400'
const num = (v: any) => Number(v ?? 0) || 0

export default function ProjectCrewSection({ projectId, onBeforeSave }: {
  projectId: string
  onBeforeSave?: () => Promise<boolean>
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Crew[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [noTable, setNoTable] = useState(false)

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    const [cRes, rRes] = await Promise.all([
      supabase.from('project_crew').select('*').eq('project_id', projectId).order('is_leader', { ascending: false }).order('created_at'),
      supabase.from('hr_roster').select('*').order('name'),
    ])
    if (cRes.error) { console.error(cRes.error); setNoTable(true) }
    setRows((cRes.data as any) ?? [])
    setRoster(rRes.data ?? [])
    setLoading(false)
  }

  const leader = rows.find(r => r.is_leader)
  const totalCost = useMemo(() => rows.reduce((s, r) => s + num(r.cost), 0), [rows])

  function addRow() {
    setRows(rs => [...rs, {
      project_id: projectId, member_kind: '員工', name: '', role: rs.length === 0 ? '工頭' : '工班人員',
      is_leader: rs.length === 0, days: 0, daily_rate: 0, cost: 0,
    }])
  }

  function patch(i: number, p: Partial<Crew>) {
    setRows(rs => rs.map((r, idx) => {
      if (idx !== i) return p.is_leader ? { ...r, is_leader: false } : r   // 工頭只能有一位
      const next = { ...r, ...p }
      if ('days' in p || 'daily_rate' in p) next.cost = Math.round(num(next.days) * num(next.daily_rate))
      if (p.is_leader) next.role = '工頭'
      return next
    }))
  }

  /** 從名冊選人：自動帶入姓名、電話、工種、日薪 */
  function pickPerson(i: number, key: string) {
    if (!key) { patch(i, { employee_id: null, contractor_id: null }); return }
    const [kind, id] = key.split('|')
    const p = roster.find(x => x.id === id && x.kind === kind)
    if (!p) return
    patch(i, {
      member_kind: kind,
      employee_id: kind === '員工' ? id : null,
      contractor_id: kind === '員工' ? null : id,
      name: p.name,
      phone: p.phone ?? '',
      daily_rate: num(p.day_rate) || 0,
      cost: Math.round(num(rows[i]?.days) * (num(p.day_rate) || 0)),
    })
  }

  function keyOf(r: Crew) {
    const id = r.member_kind === '員工' ? r.employee_id : r.contractor_id
    return id ? `${r.member_kind}|${id}` : ''
  }

  async function removeRow(i: number) {
    const r = rows[i]
    if (r.id) {
      if (!confirm(`確定移除「${r.name || '未命名'}」？`)) return
      const { error } = await supabase.from('project_crew').delete().eq('id', r.id)
      if (error) { alert('刪除失敗：' + error.message); return }
    }
    setRows(rs => rs.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (onBeforeSave && !(await onBeforeSave())) return
    const bad = rows.find(r => !r.name?.trim())
    if (bad) { alert('每一位工班人員都要有姓名'); return }
    setSaving(true); setMsg('')

    const payloads = rows.map(r => ({
      id: r.id,
      project_id: projectId,
      member_kind: r.member_kind,
      employee_id: r.employee_id || null,
      contractor_id: r.contractor_id || null,
      name: r.name.trim(),
      phone: r.phone || null,
      role: r.role,
      is_leader: !!r.is_leader,
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      days: num(r.days),
      daily_rate: num(r.daily_rate),
      cost: num(r.cost),
      notes: r.notes || null,
    }))

    const inserts = payloads.filter(p => !p.id).map(({ id, ...rest }) => rest)
    const updates = payloads.filter(p => p.id)

    let err: any = null
    if (updates.length) {
      const { error } = await supabase.from('project_crew').upsert(updates)
      err = err ?? error
    }
    if (inserts.length) {
      const { error } = await supabase.from('project_crew').insert(inserts)
      err = err ?? error
    }
    setSaving(false)
    if (err) { alert('儲存失敗：' + err.message); return }
    setMsg('已儲存')
    setTimeout(() => setMsg(''), 2000)
    load()
  }

  if (noTable) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        尚未建立施工團隊資料表。請到 Supabase SQL Editor 執行 <code>supabase/schema_project_crew.sql</code>。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <Crown size={14} className="text-amber-500" />
            工頭：
            {leader ? <b className="text-gray-900">{leader.name || '（未填姓名）'}</b> : <span className="text-gray-400">尚未指定</span>}
          </span>
          <span className="text-gray-300">|</span>
          <span>工班人數 <b className="text-gray-900">{rows.length}</b></span>
          <span className="text-gray-300">|</span>
          <span>人工成本 <b className="text-gray-900">NT${Math.round(totalCost).toLocaleString()}</b></span>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-green-600">{msg}</span>}
          <button type="button" onClick={addRow}
            className="flex items-center gap-1 text-sm border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg">
            <Plus size={14} /> 加人
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
            <Save size={14} /> {saving ? '儲存中…' : '儲存團隊'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-400 text-sm">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          <HardHat size={20} className="mx-auto mb-1 text-gray-300" />
          尚未編排施工團隊，按「加人」開始（第一位預設為工頭）
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`}
              className={`rounded-xl border p-3 ${r.is_leader ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'}`}>
              <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-500 mb-1 block">從名冊選人</label>
                  <select value={keyOf(r)} onChange={e => pickPerson(i, e.target.value)} className={inp}>
                    <option value="">— 手動輸入 —</option>
                    {KINDS.map(k => {
                      const list = roster.filter(p => p.kind === k)
                      if (!list.length) return null
                      return (
                        <optgroup key={k} label={k}>
                          {list.map(p => (
                            <option key={`${k}|${p.id}`} value={`${k}|${p.id}`}>
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
                  <input value={r.name} onChange={e => patch(i, { name: e.target.value })} className={inp} />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">身分</label>
                  <select value={r.member_kind} onChange={e => patch(i, { member_kind: e.target.value })} className={inp}>
                    {KINDS.map(k => <option key={k}>{k}</option>)}
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">角色</label>
                  <select value={r.role} onChange={e => patch(i, { role: e.target.value })} className={inp}>
                    {ROLES.map(k => <option key={k}>{k}</option>)}
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">電話</label>
                  <input value={r.phone ?? ''} onChange={e => patch(i, { phone: e.target.value })} className={inp} />
                </div>

                <div className="col-span-2 md:col-span-1 flex md:justify-end gap-1 pb-1">
                  <button type="button" title="設為工頭" onClick={() => patch(i, { is_leader: true })}
                    className={`p-1.5 rounded-lg ${r.is_leader ? 'bg-amber-400 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <Crown size={15} />
                  </button>
                  <button type="button" onClick={() => removeRow(i)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end mt-2">
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">進場日</label>
                  <input type="date" value={r.start_date ?? ''} onChange={e => patch(i, { start_date: e.target.value })} className={inp} />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">退場日</label>
                  <input type="date" value={r.end_date ?? ''} onChange={e => patch(i, { end_date: e.target.value })} className={inp} />
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className="text-xs text-gray-500 mb-1 block">天數</label>
                  <input type="number" step="0.5" value={r.days ?? 0} onChange={e => patch(i, { days: e.target.value })} className={inp} />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">日薪／日工資</label>
                  <input type="number" value={r.daily_rate ?? 0} onChange={e => patch(i, { daily_rate: e.target.value })} className={inp} />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">人工成本</label>
                  <input type="number" value={r.cost ?? 0} onChange={e => patch(i, { cost: e.target.value })} className={inp} />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-xs text-gray-500 mb-1 block">備註（負責工項）</label>
                  <input value={r.notes ?? ''} onChange={e => patch(i, { notes: e.target.value })} className={inp} />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${KIND_COLORS[r.member_kind] ?? 'bg-gray-100 text-gray-600'}`}>
                  {r.member_kind}
                </span>
                {r.is_leader && (
                  <span className="text-xs px-2 py-0.5 rounded-lg font-medium bg-amber-400 text-white flex items-center gap-1">
                    <Crown size={11} /> 工頭
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
