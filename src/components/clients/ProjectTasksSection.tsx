'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Save, ListChecks, AlertTriangle, CheckCheck } from 'lucide-react'

type Task = {
  id?: string
  project_id: string
  seq_no: number
  task_name: string
  weight: number | string
  progress_pct: number | string
  planned_start?: string | null
  planned_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  assignee?: string | null
  notes?: string | null
}

const KINDS = ['員工', '協力廠商', '臨時工'] as const

const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400'
const n = (v: any) => Number(v ?? 0) || 0
const today = () => new Date().toISOString().slice(0, 10)

function barColor(pct: number, delayed: boolean) {
  if (delayed) return 'bg-red-500'
  if (pct >= 100) return 'bg-green-500'
  if (pct > 0) return 'bg-blue-500'
  return 'bg-gray-300'
}

export default function ProjectTasksSection({ projectId, onBeforeSave }: {
  projectId: string
  onBeforeSave?: () => Promise<boolean>
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Task[]>([])
  const [taskCatalog, setTaskCatalog] = useState<string[]>([])
  const [crew, setCrew] = useState<{ id: string; name: string; member_kind: string; is_leader: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [noTable, setNoTable] = useState(false)
  const [msg, setMsg] = useState('')
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({})
  const [assigneeCustomMode, setAssigneeCustomMode] = useState<Record<string, boolean>>({})

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    const [tRes, catRes, crewRes] = await Promise.all([
      supabase.from('project_tasks').select('*').eq('project_id', projectId).order('seq_no'),
      // 工項名稱下拉固定抓「標準施工範本」的 7 個工項名稱，跟派工紀錄的施工項目下拉共用同一份清單
      supabase.from('project_task_template_items')
        .select('task_name, seq_no, project_task_templates!inner(name)')
        .eq('project_task_templates.name', '標準施工範本')
        .order('seq_no'),
      // 負責人／工班下拉連結本專案的施工人員名單（施工人員與派工紀錄分頁裡的那份）
      supabase.from('project_crew').select('id, name, member_kind, is_leader')
        .eq('project_id', projectId).order('is_leader', { ascending: false }).order('name'),
    ])
    if (tRes.error) { console.error(tRes.error); setNoTable(true) }
    setRows((tRes.data as any) ?? [])
    setTaskCatalog(((catRes.data as any) ?? []).map((x: any) => x.task_name))
    setCrew((crewRes.data as any) ?? [])
    setLoading(false)
  }

  const stats = useMemo(() => {
    const wTotal = rows.reduce((s, r) => s + n(r.weight), 0)
    const weighted = wTotal > 0
      ? rows.reduce((s, r) => s + n(r.weight) * n(r.progress_pct), 0) / wTotal
      : 0
    const delayed = rows.filter(r => n(r.progress_pct) < 100 && r.planned_end && r.planned_end < today()).length
    const done = rows.filter(r => n(r.progress_pct) >= 100).length
    return { wTotal, progress: Math.round(weighted * 10) / 10, delayed, done }
  }, [rows])

  /** 整案「實際開工／完工」：不用今天的日期，改用兩個里程碑工項自己的起迄日──
   *  開工＝「拉線與管路施作」的預定起，完工＝「竣工交付與正式驗收」的預定迄。
   *  兩個日期剛好同一天時，不重複顯示成「X ～ X」，只顯示一個日期。 */
  const milestones = useMemo(() => {
    const startTask = rows.find(r => (r.task_name || '').includes('拉線'))
    const endTask = rows.find(r => (r.task_name || '').includes('竣工交付'))
    const actualStart = startTask?.planned_start || null
    const actualEnd = endTask?.planned_end || null
    const sameDay = !!actualStart && !!actualEnd && actualStart === actualEnd
    return { actualStart, actualEnd, sameDay }
  }, [rows])

  function addRow() {
    setRows(rs => [...rs, {
      project_id: projectId,
      seq_no: rs.length + 1,
      task_name: '', weight: 0, progress_pct: 0,
    }])
  }

  function patch(i: number, p: Partial<Task>) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...p } : r))
  }

  /** 整案已完工時的捷徑：不用一項一項拖進度，全部一次設 100% */
  function markAllDone() {
    if (rows.length === 0) return
    if (!confirm(`確定把全部 ${rows.length} 個工項都設為 100% 完工？記得設完要按「儲存進度」才會真的存檔。`)) return
    setRows(rs => rs.map(r => ({ ...r, progress_pct: 100 })))
  }

  async function removeRow(i: number) {
    const r = rows[i]
    if (r.id) {
      if (!confirm(`確定刪除工項「${r.task_name || '未命名'}」？`)) return
      const { error } = await supabase.from('project_tasks').delete().eq('id', r.id)
      if (error) { alert('刪除失敗：' + error.message); return }
    }
    setRows(rs => rs.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, seq_no: idx + 1 })))
  }

  async function save() {
    if (onBeforeSave && !(await onBeforeSave())) return
    if (rows.some(r => !r.task_name?.trim())) { alert('每個工項都要有名稱'); return }
    setSaving(true)

    const payloads = rows.map((r, idx) => ({
      id: r.id,
      project_id: projectId,
      seq_no: idx + 1,
      task_name: r.task_name.trim(),
      weight: n(r.weight),
      progress_pct: Math.min(100, Math.max(0, n(r.progress_pct))),
      planned_start: r.planned_start || null,
      planned_end: r.planned_end || null,
      assignee: r.assignee || null,
      notes: r.notes || null,
    }))

    const updates = payloads.filter(p => p.id)
    const inserts = payloads.filter(p => !p.id).map(({ id, ...rest }) => rest)

    let err: any = null
    if (updates.length) { const { error } = await supabase.from('project_tasks').upsert(updates); err = err ?? error }
    if (inserts.length) { const { error } = await supabase.from('project_tasks').insert(inserts); err = err ?? error }

    setSaving(false)
    if (err) { alert('儲存失敗：' + err.message); return }
    setMsg('已儲存')
    setTimeout(() => setMsg(''), 2000)
    load()
  }

  if (noTable) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
        尚未建立工項資料表。請到 Supabase SQL Editor 執行 <code>sql/project_tasks.sql</code>。
      </div>
    )
  }

  const weightOff = rows.length > 0 && Math.abs(stats.wTotal - 100) > 0.01

  return (
    <div className="space-y-3">
      {/* 整案完成率 */}
      <div className="rounded-xl bg-gray-50 p-3 space-y-2">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs text-gray-500">整案完成率</div>
            <div className="text-2xl font-semibold text-gray-900 leading-tight">{stats.progress}%</div>
          </div>
          <div className="text-xs text-gray-500 text-right">
            <div>工項 <b className="text-gray-900">{rows.length}</b> 項 · 已完成 <b className="text-gray-900">{stats.done}</b> 項</div>
            {stats.delayed > 0 && (
              <div className="text-red-600 font-medium flex items-center gap-1 justify-end mt-0.5">
                <AlertTriangle size={12} /> {stats.delayed} 項已逾預定完成日
              </div>
            )}
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
          <div className={`h-full transition-all ${stats.delayed > 0 ? 'bg-amber-500' : stats.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, stats.progress)}%` }} />
        </div>
        {(milestones.actualStart || milestones.actualEnd) && (
          <div className="text-xs text-gray-500">
            {milestones.sameDay ? (
              <span>實際開工／完工 <b className="text-gray-900">{milestones.actualStart}</b></span>
            ) : (
              <>
                {milestones.actualStart && <span>實際開工 <b className="text-gray-900">{milestones.actualStart}</b></span>}
                {milestones.actualStart && milestones.actualEnd && <span className="mx-1.5">～</span>}
                {milestones.actualEnd && <span className="text-green-700">完工 <b className="text-gray-900">{milestones.actualEnd}</b></span>}
              </>
            )}
          </div>
        )}
        {weightOff && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            權重合計 {stats.wTotal}%（非 100%）。完成率仍以加權平均計算，但建議調整為 100% 以免與請款進度對不上。
          </div>
        )}
      </div>

      {/* 工項清單 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-gray-600">工項清單</span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-green-600">{msg}</span>}
          {rows.length > 0 && (
            <button type="button" onClick={markAllDone}
              className="flex items-center gap-1 text-sm border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg">
              <CheckCheck size={14} /> 已完工，全部設 100%
            </button>
          )}
          <button type="button" onClick={addRow}
            className="flex items-center gap-1 text-sm border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg">
            <Plus size={14} /> 加工項
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
            <Save size={14} /> {saving ? '儲存中…' : '儲存進度'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-400 text-sm">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          <ListChecks size={20} className="mx-auto mb-1 text-gray-300" />
          尚未建立工項。按「加工項」開始新增。
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const pct = n(r.progress_pct)
            const delayed = pct < 100 && !!r.planned_end && r.planned_end < today()
            const rowKey = r.id ?? `new-${i}`
            const forcedCustom = !!r.task_name && !taskCatalog.includes(r.task_name)
            const inCustomMode = customMode[rowKey] ?? forcedCustom
            const assigneeForcedCustom = !!r.assignee && !crew.some(c => c.name === r.assignee)
            const assigneeInCustomMode = assigneeCustomMode[rowKey] ?? assigneeForcedCustom
            return (
              <div key={rowKey}
                className={`rounded-xl border p-3 ${delayed ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 md:col-span-4">
                    <label className="text-xs text-gray-500 mb-1 block flex items-center justify-between">
                      <span>工項名稱 *</span>
                      <button type="button"
                        onClick={() => setCustomMode(m => ({ ...m, [rowKey]: !inCustomMode }))}
                        className="text-blue-500 hover:underline font-normal normal-case">
                        {inCustomMode ? '改用清單選擇' : '改自行輸入'}
                      </button>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}</span>
                      {inCustomMode ? (
                        <input value={r.task_name} onChange={e => patch(i, { task_name: e.target.value })}
                          className={inp} placeholder="自行輸入工項名稱" />
                      ) : (
                        <select value={r.task_name} onChange={e => patch(i, { task_name: e.target.value })} className={inp}>
                          <option value="">— 請選擇 —</option>
                          {taskCatalog.map(nm => <option key={nm} value={nm}>{nm}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 md:col-span-1">
                    <label className="text-xs text-gray-500 mb-1 block">權重%</label>
                    <input type="number" min={0} max={100} value={r.weight}
                      onChange={e => patch(i, { weight: e.target.value })} className={inp} />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">預定起</label>
                    <input type="date" value={r.planned_start ?? ''} onChange={e => patch(i, { planned_start: e.target.value })} className={inp} />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">預定迄</label>
                    <input type="date" value={r.planned_end ?? ''} onChange={e => patch(i, { planned_end: e.target.value })} className={inp} />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block flex items-center justify-between">
                      <span>負責人／工班</span>
                      <button type="button"
                        onClick={() => setAssigneeCustomMode(m => ({ ...m, [rowKey]: !assigneeInCustomMode }))}
                        className="text-blue-500 hover:underline font-normal normal-case">
                        {assigneeInCustomMode ? '改用名單選擇' : '改自行輸入'}
                      </button>
                    </label>
                    {assigneeInCustomMode ? (
                      <input value={r.assignee ?? ''} onChange={e => patch(i, { assignee: e.target.value })}
                        className={inp} placeholder="自行輸入" />
                    ) : (
                      <select value={r.assignee ?? ''} onChange={e => patch(i, { assignee: e.target.value })} className={inp}>
                        <option value="">— 請選擇 —</option>
                        {KINDS.map(k => {
                          const list = crew.filter(c => c.member_kind === k)
                          if (!list.length) return null
                          return (
                            <optgroup key={k} label={k}>
                              {list.map(c => (
                                <option key={c.id} value={c.name}>{c.name}{c.is_leader ? '（工頭）' : ''}</option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                    )}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex md:justify-end pb-1">
                    <button type="button" onClick={() => removeRow(i)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2.5">
                  <input type="range" min={0} max={100} step={5} value={pct}
                    onChange={e => patch(i, { progress_pct: e.target.value })}
                    className="flex-1 accent-blue-600" />
                  <input type="number" min={0} max={100} value={r.progress_pct}
                    onChange={e => patch(i, { progress_pct: e.target.value })}
                    className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right" />
                  <span className="text-xs text-gray-400 w-3">%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1.5">
                  <div className={`h-full ${barColor(pct, delayed)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>

                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 flex-wrap">
                  {r.actual_start && <span>實際開工 {r.actual_start}</span>}
                  {r.actual_end && <span className="text-green-600">完工 {r.actual_end}</span>}
                  {delayed && (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <AlertTriangle size={11} /> 已逾預定完成日
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
