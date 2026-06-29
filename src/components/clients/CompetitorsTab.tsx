'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { CompetitorInfo } from '@/types'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const HUALIEN_CITIES = ['花蓮市','吉安鄉','新城鄉','秀林鄉','壽豐鄉','鳳林鎮','光復鄉','豐濱鄉','瑞穗鄉','萬榮鄉','玉里鎮','卓溪鄉','富里鄉']
const SERVICE_STATUS = ['正常使用','老舊待汰換','已故障','已停用']
const SERVICE_STATUS_COLORS: Record<string, string> = {
  '正常使用': 'bg-green-100 text-green-700',
  '老舊待汰換': 'bg-yellow-100 text-yellow-700',
  '已故障': 'bg-red-100 text-red-700',
  '已停用': 'bg-gray-100 text-gray-600',
}

export default function CompetitorsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<CompetitorInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({
    company_name: '', city: '', service_status: '', equipment_age: '', equipment_issues: '', notes: ''
  })

  useEffect(() => { fetchItems() }, [clientId])

  async function fetchItems() {
    const { data } = await supabase.from('competitor_info').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  function startEdit(item?: CompetitorInfo) {
    if (item) {
      setForm({ company_name: item.company_name, city: item.city ?? '', service_status: item.service_status ?? '', equipment_age: item.equipment_age ? String(item.equipment_age) : '', equipment_issues: item.equipment_issues ?? '', notes: item.notes ?? '' })
      setEditingId(item.id)
    } else {
      setForm({ company_name: '', city: '', service_status: '', equipment_age: '', equipment_issues: '', notes: '' })
      setEditingId('new')
    }
  }

  async function handleSave() {
    if (!form.company_name.trim()) return
    const payload = { ...form, equipment_age: form.equipment_age ? Number(form.equipment_age) : null, service_status: form.service_status || null, client_id: clientId }
    if (editingId === 'new') {
      await supabase.from('competitor_info').insert(payload)
    } else {
      await supabase.from('competitor_info').update(payload).eq('id', editingId)
    }
    setEditingId(null)
    fetchItems()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除？')) return
    await supabase.from('competitor_info').delete().eq('id', id)
    fetchItems()
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">共 {items.length} 筆同業資訊</span>
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
          <Plus size={14} /> 新增同業
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="font-medium text-blue-900 text-sm">同業資訊</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">同業公司名稱 *</label>
              <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">縣市鄉鎮</label>
              <select value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className={inputClass}>
                <option value="">請選擇</option>
                {HUALIEN_CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">服務狀況</label>
              <select value={form.service_status} onChange={e => setForm(p => ({ ...p, service_status: e.target.value }))} className={inputClass}>
                <option value="">請選擇</option>
                {SERVICE_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">設備使用年限（年）</label>
              <input type="number" min="0" value={form.equipment_age} onChange={e => setForm(p => ({ ...p, equipment_age: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">設備問題</label>
              <input value={form.equipment_issues} onChange={e => setForm(p => ({ ...p, equipment_issues: e.target.value }))} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">備註</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
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
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">尚無同業資訊</div>
      ) : (
        items.map(item => (
          <div key={item.id} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-gray-900">{item.company_name}</div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {item.city && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{item.city}</span>}
                  {item.service_status && <span className={`text-xs px-2 py-0.5 rounded font-medium ${SERVICE_STATUS_COLORS[item.service_status]}`}>{item.service_status}</span>}
                  {item.equipment_age && <span className="text-xs text-gray-500">使用 {item.equipment_age} 年</span>}
                </div>
                {item.equipment_issues && <p className="text-sm text-gray-600 mt-1.5">問題：{item.equipment_issues}</p>}
                {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
