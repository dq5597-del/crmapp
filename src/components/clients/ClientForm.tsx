'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Client, ClientStatus } from '@/types'
import { Camera, Loader2, CheckCircle } from 'lucide-react'
import AppearanceTagPicker from '@/components/ui/AppearanceTagPicker'

const STATUS_OPTIONS: ClientStatus[] = ['有需求', '規劃中', '服務未完成', '已完成', '暫緩']

interface ClientFormProps {
  initialData?: Partial<Client>
  onSuccess: (id: string) => void
}

export default function ClientForm({ initialData, onSuccess }: ClientFormProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrDone, setOcrDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    company_name: initialData?.company_name ?? '',
    contact_name: initialData?.contact_name ?? '',
    appearance: initialData?.appearance ?? '',
    phone: initialData?.phone ?? '',
    line_id: initialData?.line_id ?? '',
    email: initialData?.email ?? '',
    address: initialData?.address ?? '',
    birthday: initialData?.birthday ?? '',
    interest: initialData?.interest ?? '',
    dm_provided: initialData?.dm_provided ?? false,
    status: (initialData?.status ?? '有需求') as ClientStatus,
    service_cycle_months: initialData?.service_cycle_months ?? '',
    last_service_date: initialData?.last_service_date ?? '',
    next_visit_date: initialData?.next_visit_date ?? '',
    notes: initialData?.notes ?? '',
  })

  const set = (k: keyof typeof form, v: unknown) =>
    setForm(prev => ({ ...prev, [k]: v }))

  // ── 名片 OCR ──────────────────────────────────────────────
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleOCR(file: File) {
    setOcrLoading(true)
    setOcrDone(false)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/ocr/business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type || 'image/jpeg' }),
      })
      if (!res.ok) throw new Error('OCR 失敗')
      const data = await res.json()
      setForm(f => ({
        ...f,
        company_name: data.company || f.company_name,
        contact_name: data.name || f.contact_name,
        phone: data.phone || f.phone,
        email: data.email || f.email,
        address: data.address || f.address,
        line_id: data.line_id || f.line_id,
        notes: data.notes ? (f.notes ? f.notes + '\n' + data.notes : data.notes) : f.notes,
      }))
      setOcrDone(true)
      setTimeout(() => setOcrDone(false), 3000)
    } catch (err: any) {
      alert('名片辨識失敗：' + err.message)
    }
    setOcrLoading(false)
  }
  // ─────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) { setError('請填寫公司/單位名稱'); return }
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      service_cycle_months: form.service_cycle_months !== '' ? Number(form.service_cycle_months) : null,
      birthday: form.birthday || null,
      last_service_date: form.last_service_date || null,
      next_visit_date: form.next_visit_date || null,
    }

    let result
    if (initialData?.id) {
      result = await supabase.from('clients').update(payload).eq('id', initialData.id).select('id').single()
    } else {
      result = await supabase.from('clients').insert(payload).select('id').single()
    }

    if (result.error) { setError('儲存失敗：' + result.error.message) }
    else { onSuccess(result.data.id) }
    setSaving(false)
  }

  const inputClass = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5"

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">

      {/* 名片 OCR 區 */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={ocrLoading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {ocrLoading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          {ocrLoading ? '辨識中...' : '掃描名片自動填入'}
        </button>
        {ocrDone && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <CheckCircle size={15} /> 已自動填入欄位
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleOCR(f); e.target.value = '' }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelClass}>公司 / 單位名稱 <span className="text-red-500">*</span></label>
          <input value={form.company_name} onChange={e => set('company_name', e.target.value)} className={inputClass} placeholder="例：花蓮縣政府" required />
        </div>

        <div>
          <label className={labelClass}>聯絡人姓名</label>
          <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className={inputClass} placeholder="王小明" />
        </div>

        <div>
          <label className={labelClass}>聯絡電話</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} placeholder="0912-345-678" />
        </div>

        <div>
          <label className={labelClass}>LINE ID</label>
          <input value={form.line_id} onChange={e => set('line_id', e.target.value)} className={inputClass} placeholder="line_id" />
        </div>

        <div>
          <label className={labelClass}>電子信箱</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} placeholder="email@example.com" />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>地址</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} className={inputClass} placeholder="花蓮市中正路1號" />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>長相 / 特徵</label>
          <AppearanceTagPicker key={initialData?.id ?? 'new'} value={form.appearance} onChange={v => set('appearance', v)} />
        </div>

        <div>
          <label className={labelClass}>生日</label>
          <input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>興趣</label>
          <input value={form.interest} onChange={e => set('interest', e.target.value)} className={inputClass} placeholder="釣魚、高爾夫..." />
        </div>

        <div>
          <label className={labelClass}>客戶狀態</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>服務週期（月）</label>
          <input type="number" min="0" value={form.service_cycle_months} onChange={e => set('service_cycle_months', e.target.value)} className={inputClass} placeholder="12" />
        </div>

        <div>
          <label className={labelClass}>上次服務日期</label>
          <input type="date" value={form.last_service_date} onChange={e => set('last_service_date', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>下次應回訪日期</label>
          <input type="date" value={form.next_visit_date} onChange={e => set('next_visit_date', e.target.value)} className={inputClass} />
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" id="dm_provided" checked={form.dm_provided} onChange={e => set('dm_provided', e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <label htmlFor="dm_provided" className="text-sm text-gray-700">已提供 DM / 型錄</label>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>備註</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inputClass + ' resize-none'} placeholder="其他備注事項..." />
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => history.back()} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
          取消
        </button>
        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-medium">
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </form>
  )
}
