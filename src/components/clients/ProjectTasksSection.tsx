'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Save, ListChecks, LayoutTemplate, AlertTriangle } from 'lucide-react'

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
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [noTable, setNoTable] = useState(false)
  const [msg, setMsg] = useState('')

  const [tplId, setTplId] = useState('')
  const [tplStart, setTplStart] = useState(today())
  const [applying, setApplying] = useState(false)

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    const [tRes, tplRes] = await Promise.all([
      supabase.from('project_tasks').select('*').eq('project_id', projectId).order('seq_no'),
      supabase.from('project_task_templates').select('id, name, category').eq('is_active', true).order('name'),
    ])
    if (tRes.error) { console.error(tRes.error); setNoTable(true) }
    setRows((tRes.data as any) ?? [])
    setTemplates(tplRes.data ?? [])
    if (!tplId && (tplRes.data ?? []).length > 0) setTplId(tplRes.data![0].id)
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

  async function applyTemplate() {
    if (!tplId) { alert('請先選擇範本'); return }
    if (onBeforeSave && !(await onBeforeSave())) return
    const replace = rows.length > 0
    if (replace && !confirm(`此專案已有 ${rows.length} 筆工項。\n套用範本會清空現有工項並重建（進度紀錄一併刪除），確定嗎？`)) return

    setApplying(true)
    const { data, error } = await supabase.rpc('apply_task_template', {
      p_project_id: projectId,
      p_template_id: tplId,
      p_start_date: tplStart || today(),
      p_replace: replace,
    })
    setApplying(false)
    if (error) { alert('套用範本失敗：' + error.message); return }
    setMsg(`已套用 ${data} 個工項`)
    setTimeout(() => setMsg(''), 2500)
    load()
  }

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
        {weightOff && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            權重合計 {stats.wTotal}%（非 100%）。完成率仍以加權平均計算，但建議調整為 100% 以免與請款進度對不上。
          </div>
        )}
      </div>

      {/* 套用範本 */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
              <LayoutTemplate size={12} /> 套用工項範本
            </label>
            <select value={tplId} onChange={e => setTplId(e.target.value)} className={inp}>
              {templates.length === 0 && <option value="">（尚無範本）</option>}
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.category ? `（${t.category}）` : ''}</option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label className="text-xs text-gray-500 mb-1 block">起始日</label>
            <input type="date" value={tplStart} onChange={e => setTplStart(e.target.value)} className={inp} />
          </div>
          <button type="button" onClick={applyTemplate} disabled={applying || !tplId}
            className="text-sm border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
            {applying ? '套用中…' : rows.length > 0 ? '覆蓋套用' : '一鍵套用'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          依範本的預估工期從起始日往後排預定起訖日。已有工項時會清空重建，進度紀錄一併刪除。
        </p>
      </div>

      {/* 工項清單 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">工項清單</span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-green-600">{msg}</span>}
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
          尚未建立工項。上方選範本一鍵套用，或按「加工項」自行輸入。
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const pct = n(r.progress_pct)
            const delayed = pct < 100 && !!r.planned_end && r.planned_end < today()
            return (
              <div key={r.id ?? `new-${i}`}
                className={`rounded-xl border p-3 ${delayed ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 md:col-span-4">
                    <label className="text-xs text-gray-500 mb-1 block">工項名稱 *</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}</span>
                      <input value={r.task_name} onChange={e => patch(i, { task_name: e.target.value })} className={inp} />
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
                    <label className="text-xs text-gray-500 mb-1 block">負責人／工班</label>
                    <input value={r.assignee ?? ''} onChange={e => patch(i, { assignee: e.target.value })} className={inp} />
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
