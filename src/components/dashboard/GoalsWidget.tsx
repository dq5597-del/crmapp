'use client'

/**
 * 目標進度（各戰情室獨立，room 欄位隔離）
 *
 * - 任務完成率型：進度由 todos.goal_id 關聯事項自動計算
 * - 數值型：可在區塊內直接改「目前值」，Enter 或失焦即存
 * - 區塊內可直接新增目標（標題 + 可選目標值）
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Target, Plus, ArrowRight } from 'lucide-react'

interface Goal {
  id: string
  title: string
  category: string | null
  due_date: string | null
  metric_type: 'task' | 'number'
  target_value: number | null
  current_value: number | null
  status: string
}

export default function GoalsWidget({ room = 'sales' }: { room?: string }) {
  const supabase = createClient()
  const [goals, setGoals] = useState<Goal[]>([])
  const [todos, setTodos] = useState<{ goal_id: string | null; is_done: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)

  const [newTitle, setNewTitle] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [g, t] = await Promise.all([
      supabase.from('goals').select('*').eq('room', room)
        .order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('todos').select('goal_id, is_done'),
    ])
    if (g.error) { setAvailable(false); setLoading(false); return }
    setAvailable(true)
    setGoals((g.data ?? []) as Goal[])
    setTodos((t.data ?? []) as any[])
    setLoading(false)
  }, [room]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll() }, [fetchAll])

  function progressOf(g: Goal) {
    if (g.metric_type === 'number' && Number(g.target_value) > 0) {
      const cur = Number(g.current_value ?? 0)
      const tgt = Number(g.target_value)
      return { pct: Math.min(100, Math.round((cur / tgt) * 100)), cur, tgt, isNumber: true, done: 0, total: 0 }
    }
    const linked = todos.filter(x => x.goal_id === g.id)
    const done = linked.filter(x => x.is_done).length
    return {
      pct: linked.length > 0 ? Math.round((done / linked.length) * 100) : 0,
      cur: done, tgt: linked.length, isNumber: false, done, total: linked.length,
    }
  }

  async function addGoal() {
    const title = newTitle.trim()
    if (!title) return
    setSaving(true)
    const isNum = newTarget.trim() !== '' && !isNaN(Number(newTarget))
    const { error } = await supabase.from('goals').insert({
      title,
      category: '工作',
      metric_type: isNum ? 'number' : 'task',
      target_value: isNum ? Number(newTarget) : null,
      current_value: isNum ? 0 : 0,
      auto_source: 'none',
      status: '進行中',
      room,
    })
    setSaving(false)
    if (error) { alert('新增目標失敗：' + error.message); return }
    setNewTitle(''); setNewTarget(''); fetchAll()
  }

  async function saveCurrent(id: string) {
    const v = Number(editVal)
    setEditingId(null)
    if (isNaN(v)) return
    const { error } = await supabase.from('goals').update({ current_value: v }).eq('id', id)
    if (error) { alert('更新失敗：' + error.message); return }
    fetchAll()
  }

  if (!available && !loading) return null

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Target size={17} className="text-blue-600" /> 目標進度
        </h2>
        <Link href="/todos" className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600">
          任務清單 <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-3">載入中…</p>
      ) : goals.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">尚無目標，可在下方直接新增</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {goals.map(g => {
            const p = progressOf(g)
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{g.title}</span>
                  <span className="text-sm font-semibold text-gray-700 shrink-0">{p.pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden my-1.5">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${p.pct}%` }} />
                </div>
                <div className="text-[11px] text-gray-500">
                  {p.isNumber ? (
                    editingId === g.id ? (
                      <input
                        type="number"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => saveCurrent(g.id)}
                        onKeyDown={e => { if (e.key === 'Enter') saveCurrent(g.id); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus
                        className="w-24 px-1.5 py-0.5 border border-blue-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(g.id); setEditVal(String(p.cur)) }}
                        title="點一下可改目前值"
                        className="hover:text-blue-600"
                      >
                        目前 {p.cur.toLocaleString()} / 目標 {p.tgt.toLocaleString()}
                      </button>
                    )
                  ) : (
                    <>關聯事項 {p.done}/{p.total}</>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 行內新增目標 */}
      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addGoal() }}
          placeholder="新增目標…"
          className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={newTarget}
          onChange={e => setNewTarget(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addGoal() }}
          placeholder="目標值（選填）"
          className="w-32 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={addGoal} disabled={saving || !newTitle.trim()}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">
          <Plus size={13} />
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5">
        填目標值＝數值型目標（目前值可點擊修改）；不填＝任務完成率，進度由任務清單關聯事項自動計算。
      </p>
    </div>
  )
}
