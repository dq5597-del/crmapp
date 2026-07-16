'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { formatDate } from '@/lib/utils'
import {
  Plus, X, Check, Trash2, Pencil, CalendarPlus, CalendarCheck, ListTodo, Tag,
} from 'lucide-react'

const DEFAULT_CATEGORIES = ['工作', '家庭', '興趣']

const CATEGORY_STYLE: Record<string, string> = {
  '工作': 'bg-blue-100 text-blue-700 border-blue-200',
  '家庭': 'bg-rose-100 text-rose-700 border-rose-200',
  '興趣': 'bg-emerald-100 text-emerald-700 border-emerald-200',
}
const FALLBACK_STYLES = [
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
]
function catStyle(cat: string, allCats: string[]): string {
  if (CATEGORY_STYLE[cat]) return CATEGORY_STYLE[cat]
  const idx = allCats.filter(c => !CATEGORY_STYLE[c]).indexOf(cat)
  return FALLBACK_STYLES[idx % FALLBACK_STYLES.length] ?? 'bg-gray-100 text-gray-600 border-gray-200'
}

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-gray-600 mb-1 block'

interface Todo {
  id: string
  title: string
  category: string
  notes: string | null
  is_done: boolean
  done_at: string | null
  due_date: string | null
  schedule_id: string | null
  created_at: string
}

const emptyForm = () => ({ title: '', category: '工作', notes: '', due_date: '' })

export default function TodosPage() {
  const supabase = createClient()
  const { permOf } = usePermissions()
  const perm = permOf('todos')
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('全部')
  const [showDone, setShowDone] = useState(true)

  // 新增 / 編輯表單
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [newCat, setNewCat] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { fetchTodos() }, [])

  async function fetchTodos() {
    setLoading(true)
    const { data } = await supabase
      .from('todos')
      .select('*')
      .order('is_done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    setTodos((data as Todo[]) ?? [])
    setLoading(false)
  }

  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES)
    todos.forEach(t => t.category && set.add(t.category))
    return Array.from(set)
  }, [todos])

  const filtered = todos.filter(t => {
    if (filter !== '全部' && t.category !== filter) return false
    if (!showDone && t.is_done) return false
    return true
  })

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setAddingCat(false); setNewCat(''); setShowForm(true) }
  const openEdit = (t: Todo) => {
    setEditingId(t.id)
    setForm({ title: t.title, category: t.category, notes: t.notes ?? '', due_date: t.due_date ?? '' })
    setAddingCat(false); setNewCat(''); setShowForm(true)
  }

  async function handleSave() {
    const title = form.title.trim()
    if (!title) { alert('請輸入事項標題'); return }
    const category = (addingCat ? newCat.trim() : form.category) || '工作'
    setSaving(true)
    const payload = {
      title,
      category,
      notes: form.notes.trim() || null,
      due_date: form.due_date || null,
    }
    const res = editingId
      ? await supabase.from('todos').update(payload).eq('id', editingId)
      : await supabase.from('todos').insert(payload)
    const error = res.error
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setShowForm(false)
    fetchTodos()
  }

  async function toggleDone(t: Todo) {
    setBusyId(t.id)
    const next = !t.is_done
    const { error } = await supabase
      .from('todos')
      .update({ is_done: next, done_at: next ? new Date().toISOString() : null })
      .eq('id', t.id)
    setBusyId(null)
    if (error) { alert('更新失敗：' + error.message); return }
    setTodos(prev => prev.map(x => x.id === t.id ? { ...x, is_done: next, done_at: next ? new Date().toISOString() : null } : x))
  }

  async function handleDelete(t: Todo) {
    if (!confirm(`確定刪除事項「${t.title}」？此動作無法復原。`)) return
    setBusyId(t.id)
    const { error } = await supabase.from('todos').delete().eq('id', t.id)
    setBusyId(null)
    if (error) { alert('刪除失敗：' + error.message); return }
    setTodos(prev => prev.filter(x => x.id !== t.id))
  }

  // 放入行事曆：在 schedules 建立一筆行程，並回寫 schedule_id
  async function pushToCalendar(t: Todo) {
    if (!t.due_date) { alert('請先設定此事項的日期，才能放入行事曆。'); return }
    if (t.schedule_id) { alert('此事項已經在行事曆中了。'); return }
    setBusyId(t.id)
    const { data: sch, error: schErr } = await supabase
      .from('schedules')
      .insert({
        schedule_date: t.due_date,
        title: t.title,
        type: '內部作業',
        plan_notes: `[事情清單/${t.category}]${t.notes ? ' ' + t.notes : ''}`,
        is_gap_task: false,
        is_adhoc: false,
        remind_email: false,
        remind_days_before: 0,
      })
      .select('id')
      .single()
    if (schErr || !sch) { setBusyId(null); alert('放入行事曆失敗：' + (schErr?.message ?? '')); return }
    const { error: upErr } = await supabase.from('todos').update({ schedule_id: sch.id }).eq('id', t.id)
    setBusyId(null)
    if (upErr) { alert('已建立行程，但連結失敗：' + upErr.message); return }
    setTodos(prev => prev.map(x => x.id === t.id ? { ...x, schedule_id: sch.id } : x))
    alert('已放入行事曆（每日行程），也會顯示在戰情室行事曆。')
  }

  const undoneCount = todos.filter(t => !t.is_done).length

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <ListTodo size={20} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">事情清單</h1>
            <p className="text-sm text-gray-500 mt-0.5">待辦 {undoneCount} 件</p>
          </div>
        </div>
        {perm.can_create && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> 新增事項
          </button>
        )}
      </div>

      {/* 分類篩選 */}
      <div className="flex gap-2 flex-wrap mb-4">
        {['全部', ...allCategories].map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              filter === c
                ? 'bg-gray-900 text-white border-gray-900'
                : c === '全部'
                  ? 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                  : catStyle(c, allCategories)
            }`}
          >
            {c}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          顯示已完成
        </label>
      </div>

      {/* 清單 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">目前沒有事項</div>
        ) : (
          filtered.map(t => (
            <div key={t.id} className={`flex items-start gap-3 px-4 py-3 ${t.is_done ? 'bg-gray-50/60' : ''}`}>
              <button
                onClick={() => toggleDone(t)}
                disabled={busyId === t.id || !perm.can_edit}
                title={t.is_done ? '標記為未完成' : '標記為已完成'}
                className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                  t.is_done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                }`}
              >
                {t.is_done && <Check size={13} />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${t.is_done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {t.title}
                  </span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-md border font-medium ${catStyle(t.category, allCategories)}`}>
                    {t.category}
                  </span>
                  {t.due_date && (
                    <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
                      <CalendarPlus size={11} /> {formatDate(t.due_date)}
                    </span>
                  )}
                  {t.schedule_id && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 flex items-center gap-0.5">
                      <CalendarCheck size={11} /> 已排入行事曆
                    </span>
                  )}
                </div>
                {t.notes && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{t.notes}</div>}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {perm.can_edit && !t.schedule_id && (
                  <button
                    onClick={() => pushToCalendar(t)}
                    disabled={busyId === t.id}
                    title="放入行事曆（同步到每日行程）"
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                  >
                    <CalendarPlus size={15} />
                  </button>
                )}
                {perm.can_edit && (
                  <button onClick={() => openEdit(t)} title="編輯"
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <Pencil size={15} />
                  </button>
                )}
                {perm.can_delete && (
                  <button onClick={() => handleDelete(t)} disabled={busyId === t.id} title="刪除"
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新增 / 編輯 Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editingId ? '編輯事項' : '新增事項'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelClass}>事項標題 *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className={inputClass} placeholder="要做的事" autoFocus />
              </div>

              <div>
                <label className={labelClass}>分類</label>
                <div className="flex gap-2 flex-wrap">
                  {allCategories.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setAddingCat(false); setForm(p => ({ ...p, category: c })) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        !addingCat && form.category === c ? 'bg-gray-900 text-white border-gray-900' : catStyle(c, allCategories)
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddingCat(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1 ${
                      addingCat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-dashed border-gray-300 text-gray-500 hover:border-blue-300'
                    }`}
                  >
                    <Tag size={12} /> 新分類
                  </button>
                </div>
                {addingCat && (
                  <input
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    className={inputClass + ' mt-2'}
                    placeholder="輸入新的分類名稱"
                    autoFocus
                  />
                )}
              </div>

              <div>
                <label className={labelClass}>日期（選填，設定後可放入行事曆）</label>
                <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                  className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>備註</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} className={inputClass + ' resize-none'} placeholder="補充說明（選填）" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? '儲存中…' : (editingId ? '儲存' : '新增')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
