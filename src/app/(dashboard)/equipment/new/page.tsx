'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Client, Project } from '@/types'
import { ArrowLeft, Save } from 'lucide-react'

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
const optionalLabelClass = 'block text-xs font-medium text-gray-600 mb-1 after:content-["（選填）"] after:font-normal after:text-gray-400 after:ml-1'

type WorkLog = { id: string; work_date: string; name: string; work_item: string | null }

export default function NewEquipmentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">載入中...</div>}>
      <NewEquipmentForm />
    </Suspense>
  )
}

function NewEquipmentForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    client_id: searchParams.get('client_id') ?? '',
    project_id: searchParams.get('project_id') ?? '',
    work_log_id: '',
    brand: '',
    model: '',
    serial_no: '',
    install_location: '',
    installed_date: new Date().toISOString().split('T')[0],
    warranty_expiry: '',
    notes: '',
  })

  useEffect(() => {
    supabase.from('clients').select('id,company_name').order('company_name').then(({ data }) => setClients(data ?? []))
  }, [])

  useEffect(() => {
    if (!form.client_id) { setProjects([]); return }
    supabase.from('projects').select('*').eq('client_id', form.client_id).order('created_at', { ascending: false })
      .then(({ data }) => setProjects((data as Project[]) ?? []))
  }, [form.client_id])

  useEffect(() => {
    if (!form.project_id) { setWorkLogs([]); return }
    supabase.from('project_work_logs').select('id, work_date, name, work_item').eq('project_id', form.project_id)
      .order('work_date', { ascending: false })
      .then(({ data }) => setWorkLogs((data as WorkLog[]) ?? []))
  }, [form.project_id])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function onClientChange(clientId: string) {
    setForm(f => ({ ...f, client_id: clientId, project_id: '', work_log_id: '' }))
  }

  function onProjectChange(projectId: string) {
    setForm(f => ({ ...f, project_id: projectId, work_log_id: '' }))
  }

  async function handleSave() {
    if (!form.client_id) { alert('請選擇客戶'); return }
    if (!form.brand.trim() && !form.model.trim() && !form.serial_no.trim()) {
      alert('品牌、型號、序號至少要填一項，才能認出是哪台設備')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('equipment').insert({
        client_id: form.client_id,
        project_id: form.project_id || null,
        work_log_id: form.work_log_id || null,
        brand: form.brand || null,
        model: form.model || null,
        serial_no: form.serial_no || null,
        install_location: form.install_location || null,
        installed_date: form.installed_date || null,
        warranty_expiry: form.warranty_expiry || null,
        notes: form.notes || null,
      })
      if (error) throw error
      router.push('/equipment')
    } catch (err: any) {
      alert('儲存失敗：' + err.message)
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
          <h1 className="text-xl font-bold text-gray-900">新增設備</h1>
          <p className="text-xs text-gray-500">記一次，之後叫修、保固查詢都用得到</p>
        </div>
      </div>

      {/* 客戶／專案來源 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">安裝地點</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>客戶 <span className="text-red-500">*</span></label>
            <select className={inputClass} value={form.client_id} onChange={e => onClientChange(e.target.value)}>
              <option value="">— 請選擇 —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className={optionalLabelClass}>來源專案</label>
            <select className={inputClass} value={form.project_id} onChange={e => onProjectChange(e.target.value)} disabled={!form.client_id}>
              <option value="">— 不指定 —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
          {form.project_id && (
            <div className="col-span-2">
              <label className={optionalLabelClass}>來源派工紀錄</label>
              <select className={inputClass} value={form.work_log_id} onChange={e => set('work_log_id', e.target.value)}>
                <option value="">— 不指定 —</option>
                {workLogs.map(w => (
                  <option key={w.id} value={w.id}>{w.work_date}　{w.name}{w.work_item ? `・${w.work_item}` : ''}</option>
                ))}
              </select>
              {workLogs.length === 0 && <p className="text-xs text-gray-400 mt-1">這個專案目前沒有派工紀錄</p>}
            </div>
          )}
        </div>
      </div>

      {/* 設備資訊 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">設備資訊</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>品牌</label>
            <input className={inputClass} value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="例：TEV" />
          </div>
          <div>
            <label className={labelClass}>型號</label>
            <input className={inputClass} value={form.model} onChange={e => set('model', e.target.value)} placeholder="例：TR-8100" />
          </div>
          <div>
            <label className={optionalLabelClass}>序號</label>
            <input className={inputClass} value={form.serial_no} onChange={e => set('serial_no', e.target.value)} placeholder="機身序號（有的話）" />
          </div>
          <div>
            <label className={labelClass}>安裝位置</label>
            <input className={inputClass} value={form.install_location} onChange={e => set('install_location', e.target.value)} placeholder="例：舞台左側控制箱" />
          </div>
        </div>
      </div>

      {/* 日期 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">安裝與保固</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>安裝日期</label>
            <input type="date" className={inputClass} value={form.installed_date} onChange={e => set('installed_date', e.target.value)} />
          </div>
          <div>
            <label className={optionalLabelClass}>保固到期日</label>
            <input type="date" className={inputClass} value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)} />
          </div>
        </div>
      </div>

      {/* 備註 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className={optionalLabelClass}>備註</label>
        <textarea className={inputClass} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="其他要記的事" />
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
          {saving ? '儲存中...' : '儲存設備'}
        </button>
      </div>
    </div>
  )
}
