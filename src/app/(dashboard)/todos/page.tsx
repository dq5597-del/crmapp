'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { formatDate } from '@/lib/utils'
import {
  Plus, X, Check, Trash2, Pencil, CalendarPlus, CalendarCheck, ListTodo, Tag, Target, Flag,
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
  goal_id: string | null
  created_at: string
}

interface Goal {
  id: string
  title: string
  category: string | null
  due_date: string | null
  metric_type: 'task' | 'number'
  target_value: number | null
  current_value: number | null
  auto_source?: string | null
  start_date?: string | null
  status: string
  sort_order: number | null
  created_at: string
}

const emptyForm = () => ({ title: '', category: '工作', notes: '', due_date: '', goal_id: '' })
const emptyGoalForm = () => ({ title: '', category: '工作', due_date: '', metric_type: 'task' as 'task' | 'number', target_value: '', current_value: '', auto_sales: false, start_date: '' })

function daysLeft(due: string | null): number | null {
  if (!due) return null
  const d = new Date(due).getTime() - new Date(new Date().toDateString()).getTime()
  return Math.round(d / 86400000)
}

export default function TodosPage() {
  const supabase = createClient()
  const { permOf } = usePermissions()
  const perm = permOf('todos')
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('全部')
  const [goalFilter, setGoalFilter] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(true)

  // 新增 / 編輯表單
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [newCat, setNewCat] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // 目標表單
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [goalForm, setGoalForm] = useState(emptyGoalForm())
  const [savingGoal, setSavingGoal] = useState(false)

  useEffect(() => { fetchTodos(); fetchGoals() }, [])

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

  const [salesForGoals, setSalesForGoals] = useState<{ created_at: string; total_amount: number }[]>([])

  async function fetchGoals() {
    const [{ data }, { data: sales }] = await Promise.all([
      supabase.from('goals').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('sales_orders').select('created_at, total_amount').neq('status', '取消').neq('status', '草稿'),
    ])
    setGoals((data as Goal[]) ?? [])
    setSalesForGoals((sales as any[]) ?? [])
  }

  // 自動累計銷貨金額（起算日～期限/今天）
  function autoSalesSum(goal: Goal): number {
    const from = goal.start_date ?? '0000-01-01'
    const to = (goal.due_date ?? '9999-12-31') + 'T23:59:59'
    return salesForGoals
      .filter(s => s.created_at >= from && s.created_at <= to)
      .reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
  }

  // 目標進度計算
  function progressOf(goal: Goal) {
    const linked = todos.filter(t => t.goal_id === goal.id)
    const done = linked.filter(t => t.is_done).length
    if (goal.metric_type === 'number' && Number(goal.target_value) > 0) {
      const isAuto = goal.auto_source === 'sales_orders'
      const cur = isAuto ? autoSalesSum(goal) : Number(goal.current_value ?? 0)
      const tgt = Number(goal.target_value)
      return { pct: Math.min(100, Math.round((cur / tgt) * 100)), done, total: linked.length, isNumber: true, cur, tgt, isAuto }
    }
    return { pct: linked.length > 0 ? Math.round((done / linked.length) * 100) : 0, done, total: linked.length, isNumber: false, cur: done, tgt: linked.length, isAuto: false }
  }

  const selectedGoal = goals.find(g => g.id === goalFilter) ?? null

  function openAddGoal() { setEditingGoalId(null); setGoalForm(emptyGoalForm()); setShowGoalForm(true) }
  function openEditGoal(g: Goal) {
    setEditingGoalId(g.id)
    setGoalForm({
      title: g.title, category: g.category ?? '工作', due_date: g.due_date ?? '',
      metric_type: g.metric_type, target_value: g.target_value != null ? String(g.target_value) : '',
      current_value: g.current_value != null ? String(g.current_value) : '',
      auto_sales: g.auto_source === 'sales_orders',
      start_date: g.start_date ?? '',
    })
    setShowGoalForm(true)
  }

  async function handleSaveGoal() {
    const title = goalForm.title.trim()
    if (!title) { alert('請輸入目標名稱'); return }
    setSavingGoal(true)
    const payload = {
      title,
      category: goalForm.category || null,
      due_date: goalForm.due_date || null,
      metric_type: goalForm.metric_type,
      target_value: goalForm.metric_type === 'number' && goalForm.target_value !== '' ? Number(goalForm.target_value) : null,
      current_value: goalForm.metric_type === 'number' && goalForm.current_value !== '' ? Number(goalForm.current_value) : 0,
      auto_source: goalForm.metric_type === 'number' && goalForm.auto_sales ? 'sales_orders' : 'none',
      start_date: goalForm.metric_type === 'number' && goalForm.auto_sales && goalForm.start_date ? goalForm.start_date : null,
    }
    const res = editingGoalId
      ? await supabase.from('goals').update(payload).eq('id', editingGoalId)
      : await supabase.from('goals').insert(payload)
    setSavingGoal(false)
    if (res.error) { alert('儲存失敗：' + res.error.message); return }
    setShowGoalForm(false)
    fetchGoals()
  }

  async function handleDeleteGoal() {
    if (!editingGoalId) return
    if (!confirm('確定刪除此目標？關聯的事項會保留，只會解除與此目標的連結。')) return
    setSavingGoal(true)
    const { error } = await supabase.from('goals').delete().eq('id', editingGoalId)
    setSavingGoal(false)
    if (error) { alert('刪除失敗：' + error.message); return }
    setShowGoalForm(false)
    if (goalFilter === editingGoalId) setGoalFilter(null)
    fetchGoals(); fetchTodos()
  }

  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES)
    todos.forEach(t => t.category && set.add(t.category))
    return Array.from(set)
  }, [todos])

  const filtered = todos.filter(t => {
    if (goalFilter && t.goal_id !== goalFilter) return false
    if (filter !== '全部' && t.category !== filter) return false
    if (!showDone && t.is_done) return false
    return true
  })

  const openAdd = () => { setEditingId(null); setForm({ ...emptyForm(), goal_id: goalFilter ?? '' }); setAddingCat(false); setNewCat(''); setShowForm(true) }
  const openEdit = (t: Todo) => {
    setEditingId(t.id)
    setForm({ title: t.title, category: t.category, notes: t.notes ?? '', due_date: t.due_date ?? '', goal_id: t.goal_id ?? '' })
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
      goal_id: form.goal_id || null,
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
          <div className="flex items-center gap-2">
            <button
              onClick={openAddGoal}
              className="flex items-center gap-2 px-4 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <Target size={16} /> 新增目標
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={16} /> 新增事項
            </button>
          </div>
        )}
      </div>

      {/* 目標卡片列 */}
      {goals.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-gray-500 mb-2">目標（點卡片可篩選下方事項）</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {goals.map(g => {
              const p = progressOf(g)
              const dl = daysLeft(g.due_date)
              const active = goalFilter === g.id
              return (
                <button
                  key={g.id}
                  onClick={() => setGoalFilter(active ? null : g.id)}
                  className={`text-left bg-white rounded-xl p-3.5 border transition-colors ${active ? 'border-blue-500 border-2 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    {g.category
                      ? <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${catStyle(g.category, allCategories)}`}>{g.category}</span>
                      : <span />}
                    <span className="flex items-center gap-1.5">
                      {dl != null && (
                        <span className={`text-[11px] ${dl < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {dl < 0 ? `逾期 ${-dl} 天` : `剩 ${dl} 天`}
                        </span>
                      )}
                      <span onClick={e => { e.stopPropagation(); openEditGoal(g) }} className="p-1 -m-1 text-gray-300 hover:text-gray-600" title="編輯目標">
                        <Pencil size={12} />
                      </span>
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mb-1">{g.title}</div>
                  <div className="text-[11px] text-gray-500 mb-2">
                    {p.isNumber
                      ? <>目前 {p.cur.toLocaleString()} / 目標 {p.tgt.toLocaleString()}{p.isAuto && <span className="ml-1 text-green-600">（自動：銷貨累計）</span>}</>
                      : '任務完成率'}
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${p.pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-700">{p.pct}%</span>
                    <span>關聯事項 {p.done}/{p.total}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 選定目標的進度提示列 */}
      {selectedGoal && (() => {
        const p = progressOf(selectedGoal)
        const remainTxt = p.isNumber
          ? `距目標還差 ${(p.tgt - p.cur).toLocaleString()}`
          : `還有 ${p.total - p.done} 件待完成`
        return (
          <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
            <div className="text-sm font-medium text-blue-700 flex items-center gap-1.5">
              <Flag size={14} /> {selectedGoal.title} 的相關事項
            </div>
            <div className="text-xs text-blue-700 flex items-center gap-3">
              <span>{p.pct}% 完成</span>
              <span>{remainTxt}</span>
              <button onClick={() => setGoalFilter(null)} className="text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                <X size={13} /> 清除篩選
              </button>
            </div>
          </div>
        )
      })()}

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
                  {t.goal_id && (() => {
                    const g = goals.find(x => x.id === t.goal_id)
                    return g ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 flex items-center gap-0.5">
                        <Target size={11} /> {g.title}
                      </span>
                    ) : null
                  })()}
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

              {goals.length > 0 && (
                <div>
                  <label className={labelClass}>所屬目標（選填）</label>
                  <select value={form.goal_id} onChange={e => setForm(p => ({ ...p, goal_id: e.target.value }))} className={inputClass}>
                    <option value="">— 不歸屬目標 —</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </div>
              )}

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

      {/* 新增 / 編輯 目標 Modal */}
      {showGoalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editingGoalId ? '編輯目標' : '新增目標'}</h2>
              <button onClick={() => setShowGoalForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelClass}>目標名稱 *</label>
                <input value={goalForm.title} onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))}
                  className={inputClass} placeholder="例：Q4 業績衝刺、考取證照" autoFocus />
              </div>

              <div>
                <label className={labelClass}>分類</label>
                <div className="flex gap-2 flex-wrap">
                  {allCategories.map(c => (
                    <button key={c} type="button"
                      onClick={() => setGoalForm(p => ({ ...p, category: c }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${goalForm.category === c ? 'bg-gray-900 text-white border-gray-900' : catStyle(c, allCategories)}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>進度衡量方式</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setGoalForm(p => ({ ...p, metric_type: 'task' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition ${goalForm.metric_type === 'task' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'}`}>
                    任務完成率（依關聯事項）
                  </button>
                  <button type="button" onClick={() => setGoalForm(p => ({ ...p, metric_type: 'number' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition ${goalForm.metric_type === 'number' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'}`}>
                    數值目標（自訂數字）
                  </button>
                </div>
              </div>

              {goalForm.metric_type === 'number' && (
                <>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={goalForm.auto_sales}
                      onChange={e => setGoalForm(p => ({ ...p, auto_sales: e.target.checked }))}
                      className="accent-blue-600 w-4 h-4" />
                    自動累計銷貨金額（目前值不用手動更新）
                  </label>
                  {goalForm.auto_sales ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>起算日（此日起的銷貨計入）</label>
                        <input type="date" value={goalForm.start_date} onChange={e => setGoalForm(p => ({ ...p, start_date: e.target.value }))} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>目標值</label>
                        <input type="number" value={goalForm.target_value} onChange={e => setGoalForm(p => ({ ...p, target_value: e.target.value }))} className={inputClass} placeholder="5000000" />
                      </div>
                      <p className="col-span-2 text-[11px] text-gray-400 -mt-1">
                        自動加總「起算日～期限」內銷貨單金額（排除草稿與取消），銷貨一建立進度就更新。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>目前值</label>
                        <input type="number" value={goalForm.current_value} onChange={e => setGoalForm(p => ({ ...p, current_value: e.target.value }))} className={inputClass} placeholder="320" />
                      </div>
                      <div>
                        <label className={labelClass}>目標值</label>
                        <input type="number" value={goalForm.target_value} onChange={e => setGoalForm(p => ({ ...p, target_value: e.target.value }))} className={inputClass} placeholder="500" />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className={labelClass}>期限（選填）</label>
                <input type="date" value={goalForm.due_date} onChange={e => setGoalForm(p => ({ ...p, due_date: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              {editingGoalId
                ? <button onClick={handleDeleteGoal} disabled={savingGoal} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">刪除目標</button>
                : <span />}
              <div className="flex gap-2">
                <button onClick={() => setShowGoalForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
                <button onClick={handleSaveGoal} disabled={savingGoal || !goalForm.title.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingGoal ? '儲存中…' : (editingGoalId ? '儲存' : '新增')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
