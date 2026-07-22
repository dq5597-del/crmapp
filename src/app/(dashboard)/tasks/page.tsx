'use client'

/**
 * 交辦任務（2026-07）
 * - 主管把任務派給「自己組織支線」的下屬（依 user_profiles.manager_id 組織樹）
 * - 可見範圍：交辦人、被交辦人、以及被交辦人在其支線上的所有上級
 * - 被交辦人可更新狀態（待處理 → 進行中 → 已完成）；交辦人可刪除
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { ClipboardList, Plus, Trash2, CheckCircle2, PlayCircle } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  '待處理': 'bg-amber-100 text-amber-700',
  '進行中': 'bg-blue-100 text-blue-700',
  '已完成': 'bg-green-100 text-green-700',
}

export default function AssignedTasksPage() {
  const supabase = createClient()
  const [uid, setUid] = useState<string | null>(null)
  const [people, setPeople] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', assigned_to: '', due_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setUid(user?.id ?? null)
    const [sp, tk] = await Promise.all([
      supabase.from('user_profiles').select('id, full_name, title, manager_id, is_active'),
      supabase.from('assigned_tasks').select('*').order('created_at', { ascending: false }),
    ])
    setPeople((sp.data ?? []).filter((p: any) => p.is_active !== false))
    setTasks(tk.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string | null) => people.find(p => p.id === id)?.full_name ?? '—'

  // 我的支線（下屬子樹，不含自己）
  const mySubtree = useMemo(() => {
    if (!uid) return new Set<string>()
    const ids = new Set<string>([uid])
    let grew = true
    while (grew) {
      grew = false
      for (const p of people) {
        if (!ids.has(p.id) && p.manager_id && ids.has(p.manager_id)) { ids.add(p.id); grew = true }
      }
    }
    ids.delete(uid)
    return ids
  }, [people, uid])

  // 某人是否在「我的支線」（含我自己）—— 用於可見性
  const visibleTasks = useMemo(() => {
    if (!uid) return []
    return tasks.filter(t =>
      t.assigned_by === uid || t.assigned_to === uid || mySubtree.has(t.assigned_to) || mySubtree.has(t.assigned_by)
    )
  }, [tasks, uid, mySubtree])

  const myTasks = visibleTasks.filter(t => t.assigned_to === uid)
  const teamTasks = visibleTasks.filter(t => t.assigned_to !== uid)

  async function assign() {
    if (!form.title.trim() || !form.assigned_to) { alert('請填任務標題並選擇交辦對象'); return }
    setSaving(true)
    const { error } = await supabase.from('assigned_tasks').insert({
      title: form.title.trim(), notes: form.notes || null,
      assigned_by: uid, assigned_to: form.assigned_to,
      due_date: form.due_date || null,
    })
    if (error) alert('交辦失敗：' + error.message)
    else { setForm({ title: '', assigned_to: '', due_date: '', notes: '' }); await load() }
    setSaving(false)
  }

  async function setStatus(t: any, status: string) {
    const { error } = await supabase.from('assigned_tasks')
      .update({ status, completed_at: status === '已完成' ? new Date().toISOString() : null })
      .eq('id', t.id)
    if (error) alert('更新失敗：' + error.message)
    else setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x))
  }

  async function remove(t: any) {
    if (!confirm(`刪除任務「${t.title}」？`)) return
    const { error } = await supabase.from('assigned_tasks').delete().eq('id', t.id)
    if (error) alert('刪除失敗：' + error.message)
    else setTasks(prev => prev.filter(x => x.id !== t.id))
  }

  const TaskRow = ({ t, mine }: { t: any; mine: boolean }) => (
    <div className={`flex items-center gap-3 text-sm rounded-xl px-4 py-2.5 border ${
      t.status === '已完成' ? 'bg-gray-50 border-gray-100 text-gray-400' : 'bg-white border-gray-200'}`}>
      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[t.status]}`}>{t.status}</span>
      <div className="flex-1 min-w-0">
        <div className={`truncate ${t.status === '已完成' ? 'line-through' : 'font-medium text-gray-900'}`}>{t.title}</div>
        <div className="text-xs text-gray-400 truncate">
          {nameOf(t.assigned_by)} → {nameOf(t.assigned_to)}
          {t.due_date ? `｜期限 ${t.due_date}` : ''}{t.notes ? `｜${t.notes}` : ''}
        </div>
      </div>
      {mine && t.status === '待處理' && (
        <button onClick={() => setStatus(t, '進行中')} title="開始處理" className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"><PlayCircle size={13} /> 開始</button>
      )}
      {mine && t.status !== '已完成' && (
        <button onClick={() => setStatus(t, '已完成')} title="標記完成" className="flex items-center gap-1 text-xs text-green-600 hover:underline shrink-0"><CheckCircle2 size={13} /> 完成</button>
      )}
      {t.assigned_by === uid && (
        <button onClick={() => remove(t)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
      )}
    </div>
  )

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  const subs = people.filter(p => mySubtree.has(p.id))

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardList size={22} className="text-orange-600" />
        <h1 className="text-xl font-bold text-gray-900">交辦任務</h1>
        <span className="text-sm text-gray-400">只有你的組織支線看得到</span>
      </div>

      {/* 交辦（有下屬才顯示） */}
      {subs.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <div className="font-semibold text-gray-900 mb-3">交辦新任務</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <label className="block col-span-2">
              <span className="block text-xs text-gray-500 mb-1">任務標題 *</span>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="例：整理會議室音響線材"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">交辦給 *（你的支線）</span>
              <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">— 選擇人員 —</option>
                {subs.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `（${p.title}）` : ''}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1">期限</span>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <label className="block col-span-2 sm:col-span-3">
              <span className="block text-xs text-gray-500 mb-1">說明（選填）</span>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <button type="button" disabled={saving} onClick={assign}
              className="flex items-center justify-center gap-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              <Plus size={14} /> {saving ? '交辦中…' : '交辦'}
            </button>
          </div>
        </div>
      )}

      {/* 我的任務 */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="font-semibold text-gray-900 mb-3">我的任務（{myTasks.filter(t => t.status !== '已完成').length} 件進行中）</div>
        {myTasks.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">目前沒有交辦給你的任務</div> : (
          <div className="space-y-1.5">{myTasks.map(t => <TaskRow key={t.id} t={t} mine />)}</div>
        )}
      </div>

      {/* 支線任務（主管視角） */}
      {teamTasks.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <div className="font-semibold text-gray-900 mb-3">支線任務（{teamTasks.filter(t => t.status !== '已完成').length} 件進行中）</div>
          <div className="space-y-1.5">{teamTasks.map(t => <TaskRow key={t.id} t={t} mine={false} />)}</div>
        </div>
      )}
    </div>
  )
}
