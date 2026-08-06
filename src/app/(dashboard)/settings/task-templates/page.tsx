'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Plus, Trash2, Save, LayoutTemplate, Copy } from 'lucide-react'

type Item = {
  id?: string
  template_id?: string
  seq_no: number
  task_name: string
  weight: number | string
  default_days: number | string
  notes?: string | null
}
type Template = {
  id: string
  name: string
  category: string | null
  description: string | null
  is_active: boolean
}

const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400'
const n = (v: any) => Number(v ?? 0) || 0

export default function TaskTemplatesPage() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [noTable, setNoTable] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadTemplates() }, [])
  useEffect(() => { if (activeId) loadItems(activeId) }, [activeId])

  async function loadTemplates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('project_task_templates').select('*').order('created_at')
    if (error) { console.error(error); setNoTable(true); setLoading(false); return }
    setTemplates((data as any) ?? [])
    if (!activeId && (data ?? []).length > 0) setActiveId(data![0].id)
    setLoading(false)
  }

  async function loadItems(tid: string) {
    const { data } = await supabase
      .from('project_task_template_items').select('*').eq('template_id', tid).order('seq_no')
    setItems((data as any) ?? [])
  }

  const active = templates.find(t => t.id === activeId)
  const weightTotal = useMemo(() => items.reduce((s, i) => s + n(i.weight), 0), [items])
  const daysTotal = useMemo(() => items.reduce((s, i) => s + n(i.default_days), 0), [items])

  async function addTemplate() {
    const name = prompt('新範本名稱', '新工程範本')
    if (!name?.trim()) return
    const { data, error } = await supabase
      .from('project_task_templates').insert({ name: name.trim(), is_active: true }).select().single()
    if (error) { alert('新增失敗：' + error.message); return }
    setTemplates(ts => [...ts, data as any])
    setActiveId((data as any).id)
    setItems([])
  }

  async function duplicateTemplate() {
    if (!active) return
    const name = prompt('複製為新範本，名稱：', `${active.name} (複製)`)
    if (!name?.trim()) return
    const { data, error } = await supabase.from('project_task_templates')
      .insert({ name: name.trim(), category: active.category, description: active.description, is_active: true })
      .select().single()
    if (error) { alert('複製失敗：' + error.message); return }
    const newId = (data as any).id
    if (items.length > 0) {
      await supabase.from('project_task_template_items').insert(
        items.map(i => ({
          template_id: newId, seq_no: i.seq_no, task_name: i.task_name,
          weight: n(i.weight), default_days: n(i.default_days), notes: i.notes || null,
        }))
      )
    }
    await loadTemplates()
    setActiveId(newId)
  }

  async function removeTemplate() {
    if (!active) return
    if (!confirm(`確定刪除範本「${active.name}」？其工項一併刪除。\n（已套用到專案的工項不受影響）`)) return
    const { error } = await supabase.from('project_task_templates').delete().eq('id', active.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    setTemplates(ts => ts.filter(t => t.id !== active.id))
    setActiveId(templates.find(t => t.id !== active.id)?.id ?? '')
    setItems([])
  }

  function patchTemplate(p: Partial<Template>) {
    setTemplates(ts => ts.map(t => t.id === activeId ? { ...t, ...p } : t))
  }

  function addItem() {
    setItems(is => [...is, { seq_no: is.length + 1, task_name: '', weight: 0, default_days: 1 }])
  }
  function patchItem(i: number, p: Partial<Item>) {
    setItems(is => is.map((x, idx) => idx === i ? { ...x, ...p } : x))
  }
  async function removeItem(i: number) {
    const it = items[i]
    if (it.id) {
      const { error } = await supabase.from('project_task_template_items').delete().eq('id', it.id)
      if (error) { alert('刪除失敗：' + error.message); return }
    }
    setItems(is => is.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, seq_no: idx + 1 })))
  }

  async function save() {
    if (!active) return
    if (items.some(i => !i.task_name?.trim())) { alert('每個工項都要有名稱'); return }
    setSaving(true)

    const { error: tErr } = await supabase.from('project_task_templates').update({
      name: active.name.trim(),
      category: active.category || null,
      description: active.description || null,
      is_active: active.is_active,
    }).eq('id', active.id)

    const payloads = items.map((i, idx) => ({
      id: i.id,
      template_id: active.id,
      seq_no: idx + 1,
      task_name: i.task_name.trim(),
      weight: n(i.weight),
      default_days: n(i.default_days) || 1,
      notes: i.notes || null,
    }))
    const updates = payloads.filter(p => p.id)
    const inserts = payloads.filter(p => !p.id).map(({ id, ...rest }) => rest)

    let err: any = tErr
    if (updates.length) { const { error } = await supabase.from('project_task_template_items').upsert(updates); err = err ?? error }
    if (inserts.length) { const { error } = await supabase.from('project_task_template_items').insert(inserts); err = err ?? error }

    setSaving(false)
    if (err) { alert('儲存失敗：' + err.message); return }
    setMsg('已儲存')
    setTimeout(() => setMsg(''), 2000)
    loadItems(active.id)
  }

  if (noTable) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
          尚未建立工項範本資料表。請到 Supabase SQL Editor 執行 <code>sql/project_tasks.sql</code>。
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={18} />
        </Link>
        <LayoutTemplate size={20} className="text-purple-600" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">工項範本</h1>
          <p className="text-sm text-gray-500 mt-0.5">建立標準施工流程，新專案一鍵套用</p>
        </div>
        <button onClick={addTemplate}
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-sm font-medium">
          <Plus size={15} /> 新範本
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : templates.length === 0 ? (
        <div className="p-10 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
          尚無範本，按右上角「新範本」建立
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 範本清單 */}
          <div className="md:col-span-1 space-y-1">
            {templates.map(t => (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  t.id === activeId ? 'bg-purple-600 text-white' : 'bg-white border border-gray-100 text-gray-700 hover:bg-gray-50'
                }`}>
                <div className="font-medium">{t.name}</div>
                {t.category && (
                  <div className={`text-xs mt-0.5 ${t.id === activeId ? 'text-purple-100' : 'text-gray-400'}`}>{t.category}</div>
                )}
              </button>
            ))}
          </div>

          {/* 範本內容 */}
          {active && (
            <div className="md:col-span-3 space-y-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">範本名稱 *</label>
                    <input value={active.name} onChange={e => patchTemplate({ name: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">工程類別</label>
                    <input value={active.category ?? ''} onChange={e => patchTemplate({ category: e.target.value })}
                      className={inp} placeholder="會議室／禮堂／教室" />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
                      <input type="checkbox" checked={active.is_active}
                        onChange={e => patchTemplate({ is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300" />
                      啟用
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">說明</label>
                  <input value={active.description ?? ''} onChange={e => patchTemplate({ description: e.target.value })} className={inp} />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-gray-600">
                    工項 <b className="text-gray-900">{items.length}</b> 項 ·
                    權重合計 <b className={Math.abs(weightTotal - 100) > 0.01 ? 'text-amber-600' : 'text-green-700'}>{weightTotal}%</b> ·
                    預估總工期 <b className="text-gray-900">{daysTotal}</b> 天
                  </div>
                  <div className="flex items-center gap-2">
                    {msg && <span className="text-xs text-green-600">{msg}</span>}
                    <button onClick={addItem}
                      className="flex items-center gap-1 text-sm border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                      <Plus size={14} /> 加工項
                    </button>
                    <button onClick={save} disabled={saving}
                      className="flex items-center gap-1 text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
                      <Save size={14} /> {saving ? '儲存中…' : '儲存'}
                    </button>
                  </div>
                </div>

                {Math.abs(weightTotal - 100) > 0.01 && items.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    權重合計為 {weightTotal}%，建議調整為 100%，套用後的完成率才會與請款進度一致。
                  </div>
                )}

                {items.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">尚無工項，按「加工項」開始</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, i) => (
                      <div key={it.id ?? `new-${i}`} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end border border-gray-100 rounded-xl p-2.5">
                        <div className="col-span-2 md:col-span-5">
                          <label className="text-xs text-gray-500 mb-1 block">工項名稱 *</label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}</span>
                            <input value={it.task_name} onChange={e => patchItem(i, { task_name: e.target.value })} className={inp} />
                          </div>
                        </div>
                        <div className="col-span-1 md:col-span-2">
                          <label className="text-xs text-gray-500 mb-1 block">權重%</label>
                          <input type="number" min={0} max={100} value={it.weight}
                            onChange={e => patchItem(i, { weight: e.target.value })} className={inp} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                          <label className="text-xs text-gray-500 mb-1 block">預估工期（天）</label>
                          <input type="number" min={1} value={it.default_days}
                            onChange={e => patchItem(i, { default_days: e.target.value })} className={inp} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                          <label className="text-xs text-gray-500 mb-1 block">備註</label>
                          <input value={it.notes ?? ''} onChange={e => patchItem(i, { notes: e.target.value })} className={inp} />
                        </div>
                        <div className="col-span-1 md:col-span-1 flex md:justify-end pb-1">
                          <button onClick={() => removeItem(i)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <button onClick={duplicateTemplate}
                  className="flex items-center gap-1.5 text-sm border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl text-gray-700">
                  <Copy size={14} /> 複製此範本
                </button>
                <button onClick={removeTemplate}
                  className="flex items-center gap-1.5 text-sm border border-red-200 bg-white hover:bg-red-50 px-3 py-2 rounded-xl text-red-600">
                  <Trash2 size={14} /> 刪除範本
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
