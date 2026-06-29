'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Client, Contact } from '@/types'
import { ArrowLeft, Save } from 'lucide-react'

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

export default function NewServiceRequestPage() {
  const supabase = createClient()
  const router = useRouter()

  const [clients, setClients] = useState<Client[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    client_id: '',
    contact_name: '',
    phone: '',
    reported_date: new Date().toISOString().split('T')[0],
    equipment_name: '',
    equipment_model: '',
    serial_no: '',
    issue_description: '',
    warranty_status: '非保固' as '保固內' | '保固外' | '非保固',
    warranty_expiry: '',
    service_type: '到府維修' as '到府維修' | '送廠維修',
    assigned_to: '',
    notes: '',
  })

  useEffect(() => {
    supabase.from('clients').select('id,company_name').order('company_name').then(({ data }) => {
      setClients(data ?? [])
    })
  }, [])

  async function handleClientChange(clientId: string) {
    setForm(f => ({ ...f, client_id: clientId, contact_name: '', phone: '' }))
    if (!clientId) { setContacts([]); return }
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('seq_no')
    setContacts(data ?? [])
    // Auto-fill first contact
    if (data && data.length > 0) {
      setForm(f => ({ ...f, contact_name: data[0].name ?? '', phone: data[0].phone ?? '' }))
    }
  }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.equipment_name.trim()) { alert('請輸入設備名稱'); return }
    setSaving(true)
    try {
      const { data: noData } = await fetch('/api/service-requests/generate-no').then(r => r.json()).then(d => ({ data: d }))
      const serviceNo = noData?.service_no
      if (!serviceNo) throw new Error('無法產生叫修單號')

      const { data, error } = await supabase
        .from('service_requests')
        .insert({
          service_no: serviceNo,
          client_id: form.client_id || null,
          contact_name: form.contact_name || null,
          phone: form.phone || null,
          reported_date: form.reported_date,
          equipment_name: form.equipment_name,
          equipment_model: form.equipment_model || null,
          serial_no: form.serial_no || null,
          issue_description: form.issue_description || null,
          warranty_status: form.warranty_status,
          warranty_expiry: form.warranty_expiry || null,
          service_type: form.service_type,
          assigned_to: form.assigned_to || null,
          notes: form.notes || null,
        })
        .select()
        .single()

      if (error) throw error
      router.push(`/service-requests/${data.id}`)
    } catch (err: any) {
      alert(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">新增叫修單</h1>
          <p className="text-xs text-gray-500">建立新的設備叫修記錄</p>
        </div>
      </div>

      {/* 客戶資訊 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">客戶資訊</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>客戶</label>
            <select className={inputClass} value={form.client_id} onChange={e => handleClientChange(e.target.value)}>
              <option value="">— 選擇客戶 —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>聯絡人</label>
            {contacts.length > 0 ? (
              <select className={inputClass} value={form.contact_name}
                onChange={e => {
                  const c = contacts.find(x => x.name === e.target.value)
                  setForm(f => ({ ...f, contact_name: e.target.value, phone: c?.phone ?? f.phone }))
                }}>
                <option value="">— 選擇 —</option>
                {contacts.map(c => <option key={c.id} value={c.name}>{c.name} {c.title ? `(${c.title})` : ''}</option>)}
              </select>
            ) : (
              <input className={inputClass} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="聯絡人姓名" />
            )}
          </div>
          <div>
            <label className={labelClass}>電話</label>
            <input className={inputClass} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="聯絡電話" />
          </div>
          <div>
            <label className={labelClass}>通報日期</label>
            <input type="date" className={inputClass} value={form.reported_date} onChange={e => set('reported_date', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>負責人員</label>
            <input className={inputClass} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} placeholder="業務/技術人員" />
          </div>
        </div>
      </div>

      {/* 設備資訊 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">設備資訊</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>設備名稱 <span className="text-red-500">*</span></label>
            <input className={inputClass} value={form.equipment_name} onChange={e => set('equipment_name', e.target.value)} placeholder="如：Yamaha QL1" />
          </div>
          <div>
            <label className={labelClass}>型號</label>
            <input className={inputClass} value={form.equipment_model} onChange={e => set('equipment_model', e.target.value)} placeholder="型號" />
          </div>
          <div>
            <label className={labelClass}>序號 (S/N)</label>
            <input className={inputClass} value={form.serial_no} onChange={e => set('serial_no', e.target.value)} placeholder="設備序號" />
          </div>
          <div>
            <label className={labelClass}>維修方式</label>
            <select className={inputClass} value={form.service_type} onChange={e => set('service_type', e.target.value)}>
              <option value="到府維修">到府維修</option>
              <option value="送廠維修">送廠維修</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>故障描述</label>
            <textarea className={inputClass} rows={3} value={form.issue_description} onChange={e => set('issue_description', e.target.value)} placeholder="描述故障狀況..." />
          </div>
        </div>
      </div>

      {/* 保固 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">保固資訊</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>保固狀態</label>
            <select className={inputClass} value={form.warranty_status} onChange={e => set('warranty_status', e.target.value)}>
              <option value="保固內">保固內</option>
              <option value="保固外">保固外</option>
              <option value="非保固">非保固</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>保固到期日</label>
            <input type="date" className={inputClass} value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)} />
          </div>
        </div>
      </div>

      {/* 備註 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className={labelClass}>備註</label>
        <textarea className={inputClass} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="其他備註..." />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-8">
        <button onClick={() => router.back()} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? '儲存中...' : '建立叫修單'}
        </button>
      </div>
    </div>
  )
}
