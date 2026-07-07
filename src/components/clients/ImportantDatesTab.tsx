'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Cake, Sparkles, ShieldCheck, CalendarDays, Mail } from 'lucide-react'

interface ImportantDate {
  id: string
  client_id: string
  contact_id: string | null
  title: string
  date_type: string
  the_date: string
  recurring: boolean
  remind_days_before: number
  remind_email: boolean
  is_active: boolean
  notes: string | null
  contacts?: { name: string } | null
}

const TYPE_ICON: Record<string, any> = {
  '生日': Cake, '週年': Sparkles, '保固到期': ShieldCheck, '合約續約': ShieldCheck, '自訂': CalendarDays,
}
const TYPE_COLOR: Record<string, string> = {
  '生日': 'text-pink-600', '週年': 'text-pink-600',
  '保固到期': 'text-amber-600', '合約續約': 'text-amber-600', '自訂': 'text-gray-500',
}

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'text-xs text-gray-600 mb-1 block'

export default function ImportantDatesTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<ImportantDate[]>([])
  const [contacts, setContacts] = useState<{ id: string; name: string; birthday: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [f, setF] = useState({
    title: '', date_type: '自訂', the_date: '', recurring: false,
    remind_days_before: 3, remind_email: true, contact_id: '', notes: '',
  })

  const fetchAll = useCallback(async () => {
    const [dRes, cRes] = await Promise.all([
      supabase.from('important_dates').select('*, contacts(name)').eq('client_id', clientId).order('the_date'),
      supabase.from('contacts').select('id, name, birthday').eq('client_id', clientId),
    ])
    setRows((dRes.data ?? []) as ImportantDate[])
    setContacts((cRes.data ?? []) as any)
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetchAll() }, [fetchAll])

  function startEdit(row?: ImportantDate) {
    if (row) {
      setF({
        title: row.title, date_type: row.date_type, the_date: row.the_date,
        recurring: row.recurring, remind_days_before: row.remind_days_before,
        remind_email: row.remind_email, contact_id: row.contact_id ?? '', notes: row.notes ?? '',
      })
      setEditingId(row.id)
    } else {
      setF({ title: '', date_type: '自訂', the_date: '', recurring: false, remind_days_before: 3, remind_email: true, contact_id: '', notes: '' })
      setEditingId('new')
    }
  }

  async function handleSave() {
    if (!f.title.trim() || !f.the_date) { alert('請填標題與日期'); return }
    const payload = {
      title: f.title.trim(),
      date_type: f.date_type,
      the_date: f.the_date,
      recurring: f.date_type === '生日' || f.date_type === '週年' ? true : f.recurring,
      remind_days_before: f.remind_days_before,
      remind_email: f.remind_email,
      contact_id: f.contact_id || null,
      notes: f.notes || null,
    }
    if (editingId === 'new') {
      await supabase.from('important_dates').insert({ ...payload, client_id: clientId })
    } else {
      await supabase.from('important_dates').update(payload).eq('id', editingId)
    }
    setEditingId(null)
    fetchAll()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此重要日子？')) return
    await supabase.from('important_dates').delete().eq('id', id)
    fetchAll()
  }

  async function toggleRemind(row: ImportantDate) {
    await supabase.from('important_dates').update({ remind_email: !row.remind_email }).eq('id', row.id)
    fetchAll()
  }

  const contactBirthdays = contacts.filter(c => c.birthday)

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">生日／週年／保固到期，會自動出現在行事曆並可 Email 提醒</span>
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium shrink-0">
          <Plus size={14} /> 新增重要日子
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <span className="font-medium text-blue-900 text-sm">{editingId === 'new' ? '新增重要日子' : '編輯重要日子'}</span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>標題 *</label>
              <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="例：會議室工程保固到期" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>類型</label>
              <select value={f.date_type} onChange={e => setF(p => ({ ...p, date_type: e.target.value }))} className={inputClass}>
                {['生日', '週年', '保固到期', '合約續約', '自訂'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>日期 *</label>
              <input type="date" value={f.the_date} onChange={e => setF(p => ({ ...p, the_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>關聯聯絡人（選填）</label>
              <select value={f.contact_id} onChange={e => setF(p => ({ ...p, contact_id: e.target.value }))} className={inputClass}>
                <option value="">— 不指定 —</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>提前提醒</label>
              <select value={f.remind_days_before} onChange={e => setF(p => ({ ...p, remind_days_before: Number(e.target.value) }))} className={inputClass}>
                <option value={0}>當天</option>
                <option value={1}>前 1 天</option>
                <option value={3}>前 3 天</option>
                <option value={7}>前 7 天</option>
                <option value={30}>前 1 個月</option>
              </select>
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.remind_email} onChange={e => setF(p => ({ ...p, remind_email: e.target.checked }))} />
                Email 提醒
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.date_type === '生日' || f.date_type === '週年' ? true : f.recurring}
                  disabled={f.date_type === '生日' || f.date_type === '週年'}
                  onChange={e => setF(p => ({ ...p, recurring: e.target.checked }))}
                />
                每年重複
              </label>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>備註</label>
              <input value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
          </div>
        </div>
      )}

      {/* 聯絡人生日（自動，從聯絡人資料帶出） */}
      {contactBirthdays.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-xs text-gray-400 mb-2">聯絡人生日（自動帶出，到聯絡人頁編輯）</div>
          {contactBirthdays.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-gray-50 first:border-0">
              <Cake size={14} className="text-pink-500 shrink-0" />
              <span className="text-gray-900">{c.name} 生日</span>
              <span className="text-gray-500 text-xs">{c.birthday!.slice(5).replace('-', '/')}（每年）</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
      ) : rows.length === 0 && contactBirthdays.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">尚無重要日子</div>
      ) : (
        rows.map(row => {
          const Icon = TYPE_ICON[row.date_type] ?? CalendarDays
          return (
            <div key={row.id} className="bg-white rounded-xl p-4 border border-gray-100 flex items-center gap-3">
              <Icon size={17} className={`shrink-0 ${TYPE_COLOR[row.date_type]}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm">{row.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {row.date_type}・{row.recurring ? `每年 ${row.the_date.slice(5).replace('-', '/')}` : row.the_date.replace(/-/g, '/')}
                  {row.contacts?.name ? `・${row.contacts.name}` : ''}
                  {row.notes ? `・${row.notes}` : ''}
                </div>
              </div>
              <button
                onClick={() => toggleRemind(row)}
                title={row.remind_email ? `Email 提醒：前 ${row.remind_days_before} 天（點擊關閉）` : 'Email 提醒已關（點擊開啟）'}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${row.remind_email ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
              >
                <Mail size={11} />{row.remind_email ? (row.remind_days_before === 0 ? '當天' : `前${row.remind_days_before}天`) : '關'}
              </button>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(row.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
