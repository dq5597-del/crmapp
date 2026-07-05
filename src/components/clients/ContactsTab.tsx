'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Contact } from '@/types'
import { Plus, Pencil, Trash2, Phone, Mail, Camera, Loader2, CheckCircle } from 'lucide-react'
import AppearanceTagPicker from '@/components/ui/AppearanceTagPicker'

export default function ContactsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({
    name: '', title: '', phone: '', email: '',
    line_id: '', appearance: '', provided_info: '', notes: ''
  })
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrDone, setOcrDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchContacts() }, [clientId])

  async function fetchContacts() {
    const { data } = await supabase.from('contacts').select('*').eq('client_id', clientId).order('seq_no')
    setContacts(data ?? [])
    setLoading(false)
  }

  function startEdit(contact?: Contact) {
    if (contact) {
      setForm({
        name: contact.name,
        title: contact.title ?? '',
        phone: contact.phone ?? '',
        email: contact.email ?? '',
        line_id: (contact as any).line_id ?? '',
        appearance: contact.appearance ?? '',
        provided_info: contact.provided_info ?? '',
        notes: contact.notes ?? '',
      })
      setEditingId(contact.id)
    } else {
      setForm({ name: '', title: '', phone: '', email: '', line_id: '', appearance: '', provided_info: '', notes: '' })
      setEditingId('new')
    }
    setOcrDone(false)
  }

  async function handleOCR(file: File) {
    setOcrLoading(true)
    setOcrDone(false)
    try {
      const base64 = await fileToBase64(file)
      const mimeType = file.type || 'image/jpeg'
      const res = await fetch('/api/ocr/business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType }),
      })
      if (!res.ok) throw new Error('OCR 失敗')
      const data = await res.json()
      setForm(f => ({
        name: data.name || f.name,
        title: data.title || f.title,
        phone: data.phone || f.phone,
        email: data.email || f.email,
        line_id: data.line_id || f.line_id,
        appearance: f.appearance,
        provided_info: f.provided_info,
        notes: data.notes ? (f.notes ? f.notes + '\n' + data.notes : data.notes) : f.notes,
      }))
      setOcrDone(true)
      setTimeout(() => setOcrDone(false), 3000)
    } catch (err: any) {
      alert('名片辨識失敗：' + err.message)
    }
    setOcrLoading(false)
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1]) // strip data:...;base64,
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    const payload = {
      name: form.name,
      title: form.title || null,
      phone: form.phone || null,
      email: form.email || null,
      line_id: form.line_id || null,
      appearance: form.appearance || null,
      provided_info: form.provided_info || null,
      notes: form.notes || null,
    }
    if (editingId === 'new') {
      const seq = contacts.length + 1
      await supabase.from('contacts').insert({ ...payload, client_id: clientId, seq_no: seq })
    } else {
      await supabase.from('contacts').update(payload).eq('id', editingId)
    }
    setEditingId(null)
    fetchContacts()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此聯絡人？')) return
    await supabase.from('contacts').delete().eq('id', id)
    fetchContacts()
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "text-xs text-gray-600 mb-1 block"

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">共 {contacts.length} 位聯絡人</span>
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
          <Plus size={14} /> 新增聯絡人
        </button>
      </div>

      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-blue-900 text-sm">{editingId === 'new' ? '新增聯絡人' : '編輯聯絡人'}</span>

            {/* 名片 OCR */}
            <div className="flex items-center gap-2">
              {ocrDone && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle size={13} /> 已自動填入
                </span>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {ocrLoading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                {ocrLoading ? '辨識中...' : '掃描名片'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleOCR(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>姓名 *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>職稱</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>電話</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>LINE ID</label>
              <input value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>長相/特徵</label>
              <AppearanceTagPicker
                key={editingId ?? 'none'}
                value={form.appearance}
                onChange={v => setForm(p => ({ ...p, appearance: v }))}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>備註</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">尚無聯絡人</div>
      ) : (
        contacts.map(c => (
          <div key={c.id} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-gray-900">{c.name}</div>
                {c.title && <div className="text-xs text-gray-500">{c.title}</div>}
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                  {c.phone && <div className="flex items-center gap-1"><Phone size={12} />{c.phone}</div>}
                  {c.email && <div className="flex items-center gap-1"><Mail size={12} />{c.email}</div>}
                  {(c as any).line_id && <div className="flex items-center gap-1 text-green-600 text-xs">LINE: {(c as any).line_id}</div>}
                </div>
                {c.appearance && <div className="text-xs text-gray-400 mt-1">外貌：{c.appearance}</div>}
                {c.notes && <div className="text-xs text-gray-500 mt-1">{c.notes}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
