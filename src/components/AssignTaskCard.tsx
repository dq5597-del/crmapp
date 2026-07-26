'use client'

/**
 * 戰情室內建：指派任務給下屬（2026-07）
 * ------------------------------------------------------------------
 * 用途：所有主管戰情室（董事長／總經理／經理／業務主任／會計主管／技術主管／
 *       總工程師／資深工程師／CEO）都能直接在自己的戰情室交辦任務並追蹤進度，
 *       不必再切到「交辦任務」頁面。
 *
 * 指派範圍：只能派給「自己的直屬組織支線」——依 user_profiles.manager_id
 *          往下 BFS 展開的所有下屬（不含自己），與 /tasks 頁面規則一致。
 *          沒有下屬的人（例如會計人員戰情室）不會看到交辦表單。
 *
 * 資料表：assigned_tasks（title, notes, assigned_by, assigned_to, due_date,
 *        status, completed_at），與 /tasks 頁面共用同一份資料。
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ClipboardList, Plus, Trash2, CheckCircle2, PlayCircle, ChevronRight } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  '待處理': 'bg-amber-100 text-amber-700',
  '進行中': 'bg-blue-100 text-blue-700',
  '已完成': 'bg-green-100 text-green-700',
}

const todayStr = () => new Date().toLocaleDateString('sv')

export default function AssignTaskCard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [people, setPeople] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [showDone, setShowDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', assigned_to: '', due_date: '', notes: '' })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setUid(user?.id ?? null)
    const [sp, tk] = await Promise.all([
      supabase.from('user_profiles').select('id, full_name, title, manager_id, is_active'),
      supabase.from('assigned_tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    ])
    setPeople((sp.data ?? []).filter((p: any) => p.is_active !== false))
    setTasks(tk.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string | null) => people.find(p => p.id === id)?.full_name ?? '—'

  // 我的直屬組織支線（往下展開全部下屬，不含自己）
  const subtree = useMemo(() => {
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

  const subs = useMemo(() => people.filter(p => subtree.has(p.id)), [people, subtree])

  // 支線任務：我派出去的 + 支線成員身上的（不含只給我自己的個人任務，那在「交辦任務」頁看）
  const teamTasks = useMemo(() => {
    if (!uid) return []
    return tasks.filter(t => (t.assigned_by === uid && t.assigned_to !== uid) || subtree.has(t.assigned_to))
  }, [tasks, uid, subtree])

  const open = teamTasks.filter(t => t.status !== '已完成')
  const done = teamTasks.filter(t => t.status === '已完成')
  const overdue = open.filter(t => t.due_date && t.due_date < todayStr())

  async function assign() {
    if (!form.title.trim() || !form.assigned_to) { alert('請填任務標題並選擇交辦對象'); return }
    setSaving(true)
    const { error } = await supabase.from('assigned_tasks').insert({
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      assigned_by: uid,
      assigned_to: form.assigned_to,
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

  // 沒有下屬、也沒有任何支線任務 → 整張卡不顯示（例如會計人員戰情室）
  if (loading || (subs.length === 0 && teamTasks.length === 0)) return null

  const Row = ({ t }: { t: any }) => {
    const late = t.status !== '已完成' && t.due_date && t.due_date < todayStr()
    return (
      <div className={`flex items-center gap-3 text-sm rounded-xl px-3 py-2 border ${
        t.status === '已完成' ? 'bg-gray-50 border-gray-100 text-gray-400'
        : late ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
        <div className="flex-1 min-w-0">
          <div className={`truncate ${t.status === '已完成' ? 'line-through' : 'font-medium text-gray-900'}`}>{t.title}</div>
          <div className="text-xs text-gray-400 truncate">
            {nameOf(t.assigned_by)} → <span className="text-gray-600">{nameOf(t.assigned_to)}</span>
            {t.due_date ? <span className={late ? 'text-red-600 font-semibold' : ''}>｜期限 {t.due_date}{late ? '（逾期）' : ''}</span> : ''}
            {t.notes ? `｜${t.notes}` : ''}
          </div>
        </div>
        {t.status === '待處理' && (
          <button type="button" onClick={() => setStatus(t, '進行中')} title="標記進行中"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"><PlayCircle size={13} /> 進行中</button>
        )}
        {t.status !== '已完成' && (
          <button type="button" onClick={() => setStatus(t, '已完成')} title="標記完成"
            className="flex items-center gap-1 text-xs text-green-600 hover:underline shrink-0"><CheckCircle2 size={13} /> 完成</button>
        )}
        {t.assigned_by === uid && (
          <button type="button" onClick={() => remove(t)} title="刪除"
            className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
      <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
        <ClipboardList size={16} className="text-orange-600" />
        指派任務給下屬
        <span className="text-xs font-normal text-gray-400">
          可指派 {subs.length} 人・進行中 {open.length} 件
          {overdue.length > 0 && <span className="text-red-600 font-semibold">・逾期 {overdue.length} 件</span>}
        </span>
        <Link href="/tasks" className="ml-auto flex items-center text-xs font-normal text-gray-400 hover:text-orange-600">
          完整交辦任務 <ChevronRight size={12} />
        </Link>
      </div>

      {/* 交辦表單（有下屬才顯示） */}
      {subs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mb-4">
          <label className="block col-span-2">
            <span className="block text-xs text-gray-500 mb-1">任務標題 *</span>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="例：整理會議室音響線材"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">交辦給 *</span>
            <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">— 選擇下屬 —</option>
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
      )}

      {/* 支線任務進度 */}
      {open.length === 0 && done.length === 0 ? (
        <div className="text-sm text-gray-400 py-3 text-center border-t border-gray-100">支線目前沒有任務</div>
      ) : (
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          {open.map(t => <Row key={t.id} t={t} />)}
          {open.length === 0 && <div className="text-sm text-gray-400 py-2 text-center">支線任務都完成了</div>}
          {done.length > 0 && (
            <>
              <button type="button" onClick={() => setShowDone(s => !s)}
                className="text-xs text-gray-400 hover:text-gray-700 pt-1">
                {showDone ? '隱藏' : '顯示'}已完成（{done.length} 件）
              </button>
              {showDone && done.map(t => <Row key={t.id} t={t} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
