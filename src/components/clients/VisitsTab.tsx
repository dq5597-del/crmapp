'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { VisitRecord } from '@/types'
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default function VisitsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({ visit_date: '', progress_memo: '', special_notes: '', next_action: '' })

  useEffect(() => { fetchVisits() }, [clientId])

  async function fetchVisits() {
    const { data } = await supabase.from('visit_records').select('*').eq('client_id', clientId).order('visit_date', { ascending: false })
    setVisits(data ?? [])
    setLoading(false)
  }

  function startEdit(v?: VisitRecord) {
    if (v) {
      setForm({ visit_date: v.visit_date, progress_memo: v.progress_memo ?? '', special_notes: v.special_notes ?? '', next_action: v.next_action ?? '' })
      setEditingId(v.id)
    } else {
      setForm({ visit_date: new Date().toISOString().split('T')[0], progress_memo: '', special_notes: '', next_action: '' })
      setEditingId('new')
    }
  }

  async function handleSave() {
    if (!form.visit_date) return
    if (editingId === 'new') {
      await supabase.from('visit_records').insert({ ...form, client_id: clientId })
    } else {
      await supabase.from('visit_records').update(form).eq('id', editingId)
    }
    setEditingId(null)
    fetchVisits()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此拜訪紀錄？')) return
    await supabase.from('visit_records').delete().eq('id', id)
    fetchVisits()
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const areaClass = inputClass + ' resize-none'

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">共 {visits.length} 筆拜訪紀錄</span>
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
          <Plus size={14} /> 新增紀錄
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="font-medium text-blue-900 text-sm">拜訪紀錄</div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">拜訪日期 *</label>
            <input type="date" value={form.visit_date} onChange={e => setForm(p => ({ ...p, visit_date: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">現場進度備忘錄</label>
            <textarea value={form.progress_memo} onChange={e => setForm(p => ({ ...p, progress_memo: e.target.value }))} rows={3} className={areaClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">特別注意事項</label>
            <textarea value={form.special_notes} onChange={e => setForm(p => ({ ...p, special_notes: e.target.value }))} rows={2} className={areaClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">後續行動</label>
            <input value={form.next_action} onChange={e => setForm(p => ({ ...p, next_action: e.target.value }))} className={inputClass} placeholder="下次要跟進的事項..." />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">尚無拜訪紀錄</div>
      ) : (
        visits.map(v => (
          <div key={v.id} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-blue-700">
                <Calendar size={14} />
                <span className="font-semibold">{formatDate(v.visit_date)}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(v)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(v.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
            {v.progress_memo && <p className="text-sm text-gray-700 mb-1">{v.progress_memo}</p>}
            {v.special_notes && <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded mb-1">⚠️ {v.special_notes}</p>}
            {v.next_action && <p className="text-xs text-blue-700">→ {v.next_action}</p>}
          </div>
        ))
      )}
    </div>
  )
}
