'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Project, ProjectStatus } from '@/types'
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const STATUS_OPTIONS: ProjectStatus[] = ['規劃中', '進行中', '施工中', '完工', '暫停', '取消']
const STATUS_COLORS: Record<string, string> = {
  '規劃中': 'bg-purple-100 text-purple-700',
  '進行中': 'bg-blue-100 text-blue-700',
  '施工中': 'bg-orange-100 text-orange-700',
  '完工':   'bg-green-100 text-green-700',
  '暫停':   'bg-yellow-100 text-yellow-700',
  '取消':   'bg-gray-100 text-gray-600',
}

export default function ProjectsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({ project_name: '', status: '規劃中' as ProjectStatus, start_date: '', end_date: '', budget: '', description: '', notes: '' })

  useEffect(() => { fetchProjects() }, [clientId])

  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  function startEdit(p?: Project) {
    if (p) {
      setForm({ project_name: p.project_name, status: p.status, start_date: p.start_date ?? '', end_date: p.end_date ?? '', budget: p.budget ? String(p.budget) : '', description: p.description ?? '', notes: p.notes ?? '' })
      setEditingId(p.id)
    } else {
      setForm({ project_name: '', status: '規劃中', start_date: '', end_date: '', budget: '', description: '', notes: '' })
      setEditingId('new')
    }
  }

  async function handleSave() {
    if (!form.project_name.trim()) return
    const payload = { ...form, budget: form.budget ? Number(form.budget) : null, start_date: form.start_date || null, end_date: form.end_date || null }
    if (editingId === 'new') {
      await supabase.from('projects').insert({ ...payload, client_id: clientId })
    } else {
      await supabase.from('projects').update(payload).eq('id', editingId)
    }
    setEditingId(null)
    fetchProjects()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此專案？')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">共 {projects.length} 個專案</span>
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
          <Plus size={14} /> 新增專案
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="font-medium text-blue-900 text-sm">專案資訊</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">專案名稱 *</label>
              <input value={form.project_name} onChange={e => setForm(p => ({ ...p, project_name: e.target.value }))} className={inputClass} placeholder="例：禮堂音響設備更新" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">狀態</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as ProjectStatus }))} className={inputClass}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">預算</label>
              <input type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">開始日期</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">預計完工</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">描述 / 備註</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">尚無專案</div>
      ) : (
        projects.map(p => (
          <div key={p.id} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Briefcase size={14} className="text-gray-400 shrink-0" />
                  <span className="font-semibold text-gray-900 truncate">{p.project_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                </div>
                {(p.start_date || p.end_date) && (
                  <div className="text-xs text-gray-500 ml-5">{formatDate(p.start_date)} ～ {formatDate(p.end_date)}</div>
                )}
                {p.budget && (
                  <div className="text-xs text-gray-500 ml-5">預算：NT${Number(p.budget).toLocaleString()}</div>
                )}
                {p.description && <p className="text-sm text-gray-700 mt-2 ml-5">{p.description}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
