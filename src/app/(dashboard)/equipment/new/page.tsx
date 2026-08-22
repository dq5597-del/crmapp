'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Client, Project } from '@/types'
import { ArrowLeft, Save, Plus, PackageSearch } from 'lucide-react'

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
const optionalLabelClass = 'block text-xs font-medium text-gray-600 mb-1 after:content-["（選填）"] after:font-normal after:text-gray-400 after:ml-1'

type WorkLog = { id: string; work_date: string; name: string; work_item: string | null }
type QuoteItemOption = {
  id: string
  brand: string | null
  product_name: string
  model: string | null
  quote_no: string
}

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
  const [quoteItems, setQuoteItems] = useState<QuoteItemOption[]>([])
  const [saving, setSaving] = useState<'exit' | 'continue' | false>(false)
  const [addedCount, setAddedCount] = useState(0)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  // 一台設備可能是好幾個點工一起裝的，所以「來源派工紀錄」可以複選
  const [workLogIds, setWorkLogIds] = useState<string[]>([])

  const [form, setForm] = useState({
    client_id: searchParams.get('client_id') ?? '',
    project_id: searchParams.get('project_id') ?? '',
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

  // 選了專案之後，把該專案已確認報價單的品項抓出來，設備資訊可以直接點選帶入，不用重打
  useEffect(() => {
    if (!form.project_id) { setQuoteItems([]); return }
    supabase
      .from('quotes')
      .select('id, quote_no')
      .eq('project_id', form.project_id)
      .in('status', ['已確認', '已轉銷貨單', '已轉訂購單'])
      .then(async ({ data: quotes }) => {
        if (!quotes || quotes.length === 0) { setQuoteItems([]); return }
        const { data: items } = await supabase
          .from('quote_items')
          .select('id, quote_id, brand, product_name, model')
          .in('quote_id', quotes.map(q => q.id))
          .order('seq_no')
        const quoteNoMap = new Map(quotes.map(q => [q.id, q.quote_no]))
        setQuoteItems((items ?? []).map((it: any) => ({
          id: it.id,
          brand: it.brand,
          product_name: it.product_name,
          model: it.model,
          quote_no: quoteNoMap.get(it.quote_id) ?? '',
        })))
      })
  }, [form.project_id])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function onClientChange(clientId: string) {
    setForm(f => ({ ...f, client_id: clientId, project_id: '' }))
    setWorkLogIds([])
  }

  function onProjectChange(projectId: string) {
    setForm(f => ({ ...f, project_id: projectId }))
    setWorkLogIds([])
  }

  function toggleWorkLog(id: string) {
    setWorkLogIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function fillFromQuoteItem(item: QuoteItemOption) {
    setForm(f => ({ ...f, brand: item.brand ?? f.brand, model: item.model ?? item.product_name }))
  }

  const selectedClientName = clients.find(c => c.id === form.client_id)?.company_name ?? ''
  const filteredClients = clientSearch
    ? clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients

  function onClientPick(c: Client) {
    setClientSearch('')
    setShowClientDropdown(false)
    onClientChange(c.id)
  }

  async function handleSave(continueAdding: boolean) {
    if (!form.client_id) { alert('請選擇客戶'); return }
    if (!form.brand.trim() && !form.model.trim() && !form.serial_no.trim()) {
      alert('品牌、型號、序號至少要填一項，才能認出是哪台設備')
      return
    }
    setSaving(continueAdding ? 'continue' : 'exit')
    try {
      const { data: inserted, error } = await supabase.from('equipment').insert({
        client_id: form.client_id,
        project_id: form.project_id || null,
        work_log_id: workLogIds[0] || null, // 舊欄位相容：保留第一筆點工
        brand: form.brand || null,
        model: form.model || null,
        serial_no: form.serial_no || null,
        install_location: form.install_location || null,
        installed_date: form.installed_date || null,
        warranty_expiry: form.warranty_expiry || null,
        notes: form.notes || null,
      }).select().single()
      if (error) throw error

      if (workLogIds.length > 0) {
        const { error: linkError } = await supabase.from('equipment_work_logs').insert(
          workLogIds.map(wid => ({ equipment_id: inserted.id, work_log_id: wid }))
        )
        if (linkError) throw linkError
      }

      if (continueAdding) {
        // 同一批安裝：客戶／專案／安裝日期保留，其餘清空繼續登下一台（點工每台不一定一樣，重新選）
        setForm(f => ({
          ...f,
          brand: '',
          model: '',
          serial_no: '',
          install_location: '',
          warranty_expiry: '',
          notes: '',
        }))
        setWorkLogIds([])
        setAddedCount(n => n + 1)
        setSaving(false)
      } else {
        router.push('/equipment')
      }
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

      {addedCount > 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-sm">
          已新增 {addedCount} 台設備，客戶／專案／安裝日期已幫你保留，繼續填下一台的品牌型號就好。
        </div>
      )}

      {/* 客戶／專案來源 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">安裝地點</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className={labelClass}>客戶 <span className="text-red-500">*</span></label>
            <input
              className={inputClass}
              value={clientSearch || selectedClientName}
              onChange={e => {
                setClientSearch(e.target.value)
                if (form.client_id) onClientChange('')
                setShowClientDropdown(true)
              }}
              onFocus={() => setShowClientDropdown(true)}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              placeholder="輸入搜尋客戶"
              autoComplete="off"
            />
            {showClientDropdown && (
              <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
                {filteredClients.length > 0 ? filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => onClientPick(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                  >
                    {c.company_name}
                  </button>
                )) : (
                  <div className="px-3 py-2 text-sm text-gray-400">查無符合的客戶</div>
                )}
              </div>
            )}
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
              <label className={optionalLabelClass}>來源派工紀錄（可複選，同一台設備可能是好幾個點工一起裝的）</label>
              {workLogs.length === 0 ? (
                <p className="text-xs text-gray-400">這個專案目前沒有派工紀錄</p>
              ) : (
                <div className="border border-gray-200 rounded-lg bg-white p-2 max-h-40 overflow-y-auto space-y-1">
                  {workLogs.map(w => {
                    const checked = workLogIds.includes(w.id)
                    return (
                      <label key={w.id} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg cursor-pointer ${checked ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleWorkLog(w.id)} className="w-3.5 h-3.5 rounded border-gray-300" />
                        <span className="text-gray-400 text-xs">{w.work_date}</span>
                        {w.name}
                        {w.work_item && <span className="text-gray-400 text-xs">・{w.work_item}</span>}
                      </label>
                    )
                  })}
                </div>
              )}
              {workLogIds.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">已選 {workLogIds.length} 位點工</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 設備資訊 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">設備資訊</h2>

        {form.project_id && quoteItems.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-blue-700 flex items-center gap-1.5">
              <PackageSearch size={13} />
              這個專案的報價單品項，點一下直接帶入品牌／型號
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quoteItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => fillFromQuoteItem(item)}
                  className="text-xs px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors"
                  title={`來自報價單 ${item.quote_no}`}
                >
                  {[item.brand, item.model || item.product_name].filter(Boolean).join(' ')}
                </button>
              ))}
            </div>
          </div>
        )}

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
          {addedCount > 0 ? '完成' : '取消'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={!!saving}
          className="flex items-center gap-2 px-5 py-2 border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
        >
          <Plus size={15} />
          {saving === 'continue' ? '儲存中...' : '儲存並繼續新增'}
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={!!saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={15} />
          {saving === 'exit' ? '儲存中...' : '儲存設備'}
        </button>
      </div>
    </div>
  )
}
