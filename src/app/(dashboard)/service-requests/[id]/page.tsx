'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useColWidths, ResizableTH, ColWidthTools } from '@/components/ResizableTable'
import {
  ServiceRequest, ServiceVendorRepair, ServiceRepairQuote,
  ServiceRepairQuoteItem, Vendor, ServiceStatus, Product
} from '@/types'
import {
  ArrowLeft, Copy, ExternalLink, CheckCircle, XCircle,
  Building2, Wrench, FileText, Lock, FileDown, Plus, Tag, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

const STATUS_COLORS: Record<ServiceStatus, string> = {
  '待處理':       'bg-gray-100 text-gray-600',
  '處理中':       'bg-blue-100 text-blue-700',
  '報價中':       'bg-amber-100 text-amber-700',
  '等待客戶確認': 'bg-orange-100 text-orange-700',
  '維修中':       'bg-purple-100 text-purple-700',
  '已完成':       'bg-green-100 text-green-700',
  '收費中':       'bg-red-100 text-red-700',
  '已結案':       'bg-gray-100 text-gray-400',
}

const ALL_STATUSES: ServiceStatus[] = [
  '待處理','處理中','報價中','等待客戶確認','維修中','已完成','收費中','已結案'
]

type TabKey = 'info' | 'vendor' | 'quote' | 'close'

interface ProductCategory {
  id: string
  main_category: string
  sub_category: string
}

export default function ServiceRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [req, setReq] = useState<ServiceRequest | null>(null)
  const [vendorRepair, setVendorRepair] = useState<ServiceVendorRepair | null>(null)
  const [repairQuote, setRepairQuote] = useState<ServiceRepairQuote | null>(null)
  const [repairItems, setRepairItems] = useState<ServiceRepairQuoteItem[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [tab, setTab] = useState<TabKey>('info')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchAll = useCallback(async () => {
    const [{ data: r }, { data: vr }, { data: rq }] = await Promise.all([
      supabase.from('service_requests').select('*, client:clients(company_name)').eq('id', id).single(),
      supabase.from('service_vendor_repairs').select('*').eq('service_request_id', id).maybeSingle(),
      supabase.from('service_repair_quotes').select('*, items:service_repair_quote_items(*)').eq('service_request_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setReq(r as ServiceRequest)
    setVendorRepair(vr as ServiceVendorRepair)
    setRepairQuote(rq as ServiceRepairQuote)
    setRepairItems((rq as any)?.items ?? [])
  }, [id])

  const loadProducts = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([
      supabase.from('products').select('*, product_categories(main_category, sub_category)').eq('is_active', true).order('product_name'),
      supabase.from('product_categories').select('id, main_category, sub_category').order('main_category').order('sub_category'),
    ])
    setProducts(pRes.data ?? [])
    setCategories(cRes.data ?? [])
  }, [])

  useEffect(() => {
    fetchAll()
    loadProducts()
    supabase.from('vendors').select('id,company_name,repair_contact,repair_phone,repair_email,repair_address').eq('is_active', true).order('company_name').then(({ data }) => setVendors(data ?? []))
  }, [fetchAll, loadProducts])

  async function updateStatus(status: ServiceStatus) {
    await supabase.from('service_requests').update({ status }).eq('id', id)
    setReq(r => r ? { ...r, status } : r)
  }

  function copyTrackLink() {
    if (!req) return
    const url = `${window.location.origin}/track/${req.track_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!req) return <div className="p-6 text-sm text-gray-400">載入中...</div>

  const locked = req.is_closed

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{req.service_no}</h1>
            <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', STATUS_COLORS[req.status])}>
              {req.status}
            </span>
            {locked && (
              <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                <Lock size={11} /> 已結案
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {(req.client as any)?.company_name ?? '—'} · {req.equipment_name} {req.equipment_model ? `(${req.equipment_model})` : ''}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => window.open(`/service-requests/${id}/print`, '_blank')}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium text-gray-700"
          >
            <FileDown size={14} /> 匯出 PDF
          </button>
          <button
            onClick={copyTrackLink}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink size={14} />
            {copied ? '已複製！' : '複製追蹤連結'}
          </button>
          {!locked && (
            <select
              value={req.status}
              onChange={e => updateStatus(e.target.value as ServiceStatus)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: 'info',   label: '叫修資訊', icon: Wrench },
          { key: 'vendor', label: '送廠維修', icon: Building2 },
          { key: 'quote',  label: '維修報價單', icon: FileText },
          { key: 'close',  label: '結案', icon: CheckCircle },
        ] as { key: TabKey; label: string; icon: any }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* === Tab: 叫修資訊 === */}
      {tab === 'info' && (
        <InfoTab req={req} locked={locked} onSave={async (updates) => {
          await supabase.from('service_requests').update(updates).eq('id', id)
          await fetchAll()
        }} />
      )}

      {/* === Tab: 送廠維修 === */}
      {tab === 'vendor' && (
        <VendorRepairTab
          req={req}
          vendorRepair={vendorRepair}
          vendors={vendors}
          locked={locked}
          onSave={async (data) => {
            if (vendorRepair) {
              await supabase.from('service_vendor_repairs').update(data).eq('id', vendorRepair.id)
            } else {
              await supabase.from('service_vendor_repairs').insert({ ...data, service_request_id: id })
            }
            await fetchAll()
          }}
        />
      )}

      {/* === Tab: 維修報價單 === */}
      {tab === 'quote' && (
        <RepairQuoteTab
          req={req}
          repairQuote={repairQuote}
          repairItems={repairItems}
          products={products}
          categories={categories}
          onProductsReload={loadProducts}
          locked={locked}
          onSave={async (quoteData, items) => {
            if (repairQuote) {
              await supabase.from('service_repair_quotes').update(quoteData).eq('id', repairQuote.id)
              // Replace items
              await supabase.from('service_repair_quote_items').delete().eq('repair_quote_id', repairQuote.id)
              if (items.length > 0) {
                await supabase.from('service_repair_quote_items').insert(items.map((it, i) => ({ ...it, repair_quote_id: repairQuote.id, seq_no: i + 1 })))
              }
            } else {
              // Generate quote number
              const noRes = await fetch('/api/service-requests/generate-repair-quote-no').then(r => r.json())
              const { data: newQuote } = await supabase.from('service_repair_quotes').insert({
                ...quoteData,
                repair_quote_no: noRes.repair_quote_no,
                service_request_id: id,
                client_id: req.client_id,
              }).select().single()
              if (newQuote && items.length > 0) {
                await supabase.from('service_repair_quote_items').insert(items.map((it, i) => ({ ...it, repair_quote_id: (newQuote as any).id, seq_no: i + 1 })))
              }
            }
            await fetchAll()
          }}
          onDecision={async (decision) => {
            if (!repairQuote) return
            await supabase.from('service_repair_quotes').update({
              customer_decision: decision,
              decision_date: new Date().toISOString().split('T')[0],
            }).eq('id', repairQuote.id)
            // Update main status
            const newStatus: ServiceStatus = decision === '確認維修' ? '維修中' : '收費中'
            await supabase.from('service_requests').update({ status: newStatus }).eq('id', id)
            await fetchAll()
          }}
        />
      )}

      {/* === Tab: 結案 === */}
      {tab === 'close' && (
        <CloseTab
          req={req}
          locked={locked}
          onClose={async (data) => {
            await supabase.from('service_requests').update({
              ...data,
              status: '已結案',
              is_closed: true,
            }).eq('id', id)
            await fetchAll()
            setTab('info')
          }}
        />
      )}
    </div>
  )
}

// ============================================================
// InfoTab
// ============================================================
function InfoTab({ req, locked, onSave }: {
  req: ServiceRequest
  locked: boolean
  onSave: (updates: any) => Promise<void>
}) {
  const [form, setForm] = useState<any>({ ...req })
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  function set(k: string, v: string) { setForm((f: any) => ({ ...f, [k]: v })) }

  // 所屬專案（維修成本回掛到專案毛利用）
  useEffect(() => {
    if (!(req as any).client_id) return
    const supabase = createClient()
    supabase.from('projects').select('id, project_name').eq('client_id', (req as any).client_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data ?? []))
  }, [(req as any).client_id])

  async function save() {
    setSaving(true)
    await onSave({
      contact_name: form.contact_name,
      phone: form.phone,
      equipment_name: form.equipment_name,
      equipment_model: form.equipment_model,
      serial_no: form.serial_no,
      issue_description: form.issue_description,
      warranty_status: form.warranty_status,
      warranty_expiry: form.warranty_expiry,
      service_type: form.service_type,
      assigned_to: form.assigned_to,
      project_id: form.project_id || null,
      notes: form.notes,
    })
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">單位資訊</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>聯絡人</label><input disabled={locked} className={inputClass} value={form.contact_name ?? ''} onChange={e => set('contact_name', e.target.value)} /></div>
          <div><label className={labelClass}>電話</label><input disabled={locked} className={inputClass} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} /></div>
          <div><label className={labelClass}>通報日期</label><input type="date" disabled={locked} className={inputClass} value={form.reported_date} onChange={e => set('reported_date', e.target.value)} /></div>
          <div><label className={labelClass}>負責人員</label><input disabled={locked} className={inputClass} value={form.assigned_to ?? ''} onChange={e => set('assigned_to', e.target.value)} /></div>
          <div><label className={labelClass}>所屬專案（毛利分析用）</label>
            <select disabled={locked} className={inputClass} value={form.project_id ?? ''} onChange={e => set('project_id', e.target.value)}>
              <option value="">— 不屬於任何專案 —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">設備資訊</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>設備名稱</label><input disabled={locked} className={inputClass} value={form.equipment_name} onChange={e => set('equipment_name', e.target.value)} /></div>
          <div><label className={labelClass}>型號</label><input disabled={locked} className={inputClass} value={form.equipment_model ?? ''} onChange={e => set('equipment_model', e.target.value)} /></div>
          <div><label className={labelClass}>序號 (S/N)</label><input disabled={locked} className={inputClass} value={form.serial_no ?? ''} onChange={e => set('serial_no', e.target.value)} /></div>
          <div><label className={labelClass}>維修方式</label>
            <select disabled={locked} className={inputClass} value={form.service_type} onChange={e => set('service_type', e.target.value)}>
              <option value="到府維修">到府維修</option>
              <option value="送廠維修">送廠維修</option>
            </select>
          </div>
          <div className="col-span-2"><label className={labelClass}>故障描述</label><textarea disabled={locked} className={inputClass} rows={3} value={form.issue_description ?? ''} onChange={e => set('issue_description', e.target.value)} /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">保固資訊</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>保固狀態</label>
            <select disabled={locked} className={inputClass} value={form.warranty_status} onChange={e => set('warranty_status', e.target.value)}>
              <option value="保固內">保固內</option>
              <option value="保固外">保固外</option>
              <option value="非保固">非保固</option>
            </select>
          </div>
          <div><label className={labelClass}>保固到期日</label><input type="date" disabled={locked} className={inputClass} value={form.warranty_expiry ?? ''} onChange={e => set('warranty_expiry', e.target.value)} /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className={labelClass}>備註</label>
        <textarea disabled={locked} className={inputClass} rows={3} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
      </div>

      {!locked && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// VendorRepairTab
// ============================================================
function VendorRepairTab({ req, vendorRepair, vendors, locked, onSave }: {
  req: ServiceRequest
  vendorRepair: ServiceVendorRepair | null
  vendors: Vendor[]
  locked: boolean
  onSave: (data: any) => Promise<void>
}) {
  const [form, setForm] = useState({
    vendor_id: vendorRepair?.vendor_id ?? '',
    repair_contact: vendorRepair?.repair_contact ?? '',
    repair_phone: vendorRepair?.repair_phone ?? '',
    repair_email: vendorRepair?.repair_email ?? '',
    repair_address: vendorRepair?.repair_address ?? '',
    // 客戶資料（auto-fill 自叫修單）
    client_name: vendorRepair?.client_name ?? (req.client as any)?.company_name ?? '',
    client_contact: vendorRepair?.client_contact ?? req.contact_name ?? '',
    client_phone: vendorRepair?.client_phone ?? req.phone ?? '',
    client_email: vendorRepair?.client_email ?? '',
    equipment_serial_no: vendorRepair?.equipment_serial_no ?? req.serial_no ?? '',
    condition_note: vendorRepair?.condition_note ?? '',
    // 廠商回報
    vendor_repair_no: vendorRepair?.vendor_repair_no ?? '',
    vendor_diagnosis: vendorRepair?.vendor_diagnosis ?? '',
    vendor_quote_amount: vendorRepair?.vendor_quote_amount?.toString() ?? '',
    estimated_done_date: vendorRepair?.estimated_done_date ?? '',
    returned_date: vendorRepair?.returned_date ?? '',
    sent_date: vendorRepair?.sent_date ?? new Date().toISOString().split('T')[0],
    notes: vendorRepair?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleVendorChange(vendorId: string) {
    const v = vendors.find(x => x.id === vendorId)
    setForm(f => ({
      ...f,
      vendor_id: vendorId,
      repair_contact: (v as any)?.repair_contact ?? '',
      repair_phone: (v as any)?.repair_phone ?? '',
      repair_email: (v as any)?.repair_email ?? '',
      repair_address: (v as any)?.repair_address ?? '',
    }))
  }

  async function save() {
    setSaving(true)
    await onSave({
      ...form,
      vendor_id: form.vendor_id || null,
      vendor_quote_amount: form.vendor_quote_amount ? parseFloat(form.vendor_quote_amount) : null,
    })
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">送修廠商</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>廠商</label>
            <select disabled={locked} className={inputClass} value={form.vendor_id} onChange={e => handleVendorChange(e.target.value)}>
              <option value="">— 選擇廠商 —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
            </select>
          </div>
          <div><label className={labelClass}>維修部聯絡人</label><input disabled={locked} className={inputClass} value={form.repair_contact} onChange={e => set('repair_contact', e.target.value)} /></div>
          <div><label className={labelClass}>維修部電話</label><input disabled={locked} className={inputClass} value={form.repair_phone} onChange={e => set('repair_phone', e.target.value)} /></div>
          <div><label className={labelClass}>維修部 Email</label><input disabled={locked} className={inputClass} value={form.repair_email} onChange={e => set('repair_email', e.target.value)} /></div>
          <div><label className={labelClass}>送修地址</label><input disabled={locked} className={inputClass} value={form.repair_address} onChange={e => set('repair_address', e.target.value)} /></div>
          <div><label className={labelClass}>送修日期</label><input type="date" disabled={locked} className={inputClass} value={form.sent_date} onChange={e => set('sent_date', e.target.value)} /></div>
        </div>
      </div>

      <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-blue-800">送修單位資料（供廠商參考）</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>單位公司</label><input disabled={locked} className={inputClass} value={form.client_name} onChange={e => set('client_name', e.target.value)} /></div>
          <div><label className={labelClass}>單位聯絡人</label><input disabled={locked} className={inputClass} value={form.client_contact} onChange={e => set('client_contact', e.target.value)} /></div>
          <div><label className={labelClass}>單位電話</label><input disabled={locked} className={inputClass} value={form.client_phone} onChange={e => set('client_phone', e.target.value)} /></div>
          <div><label className={labelClass}>單位 Email（選填）</label><input disabled={locked} className={inputClass} value={form.client_email} onChange={e => set('client_email', e.target.value)} /></div>
          <div><label className={labelClass}>設備序號</label><input disabled={locked} className={inputClass} value={form.equipment_serial_no} onChange={e => set('equipment_serial_no', e.target.value)} /></div>
          <div><label className={labelClass}>送修外觀說明</label><input disabled={locked} className={inputClass} value={form.condition_note} onChange={e => set('condition_note', e.target.value)} placeholder="如：外殼有刮痕" /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">廠商回報</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>廠商維修單號</label><input disabled={locked} className={inputClass} value={form.vendor_repair_no} onChange={e => set('vendor_repair_no', e.target.value)} /></div>
          <div><label className={labelClass}>廠商報價金額</label><input type="number" disabled={locked} className={inputClass} value={form.vendor_quote_amount} onChange={e => set('vendor_quote_amount', e.target.value)} /></div>
          <div><label className={labelClass}>預計完成日</label><input type="date" disabled={locked} className={inputClass} value={form.estimated_done_date} onChange={e => set('estimated_done_date', e.target.value)} /></div>
          <div><label className={labelClass}>取回日期</label><input type="date" disabled={locked} className={inputClass} value={form.returned_date} onChange={e => set('returned_date', e.target.value)} /></div>
          <div className="col-span-2"><label className={labelClass}>廠商診斷說明</label><textarea disabled={locked} className={inputClass} rows={3} value={form.vendor_diagnosis} onChange={e => set('vendor_diagnosis', e.target.value)} /></div>
          <div className="col-span-2"><label className={labelClass}>備註</label><textarea disabled={locked} className={inputClass} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        </div>
      </div>

      {!locked && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? '儲存中...' : '儲存送廠資料'}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 快速新增產品 Modal（維修報價單用）
// ============================================================
interface RepairQuickAddProductModalProps {
  initialName: string
  categories: ProductCategory[]
  onClose: () => void
  onCreated: (product: Product, itemNotes: string) => void
}

function RepairQuickAddProductModal({ initialName, categories, onClose, onCreated }: RepairQuickAddProductModalProps) {
  const supabase = createClient()
  const [mainCat, setMainCat] = useState('')
  const [form, setForm] = useState({
    category_id: '' as string,
    brand: '',
    product_name: initialName,
    model: '',
    unit: '台',
    list_price: 0,
    cost_price: 0,
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [itemNotes, setItemNotes] = useState('')
  const [isNewMain, setIsNewMain] = useState(false)
  const [newMainCat, setNewMainCat] = useState('')
  const [isNewSub, setIsNewSub] = useState(false)
  const [newSubCat, setNewSubCat] = useState('')

  const mainCats = Array.from(new Set(categories.map(c => c.main_category)))
  const subCats = categories.filter(c => c.main_category === mainCat)

  function handleMainCatChange(val: string) {
    setMainCat(val)
    setForm(p => ({ ...p, category_id: '' }))
  }

  function handleMainCatSelect(val: string) {
    if (val === '__new__') {
      setIsNewMain(true)
      setMainCat('')
      setForm(p => ({ ...p, category_id: '' }))
      setIsNewSub(true)
      setNewSubCat('')
    } else {
      handleMainCatChange(val)
    }
  }

  function cancelNewMain() {
    setIsNewMain(false)
    setNewMainCat('')
    setIsNewSub(false)
    setNewSubCat('')
  }

  function handleSubCatSelect(val: string) {
    if (val === '__new__') {
      setIsNewSub(true)
      setNewSubCat('')
    } else {
      setForm(p => ({ ...p, category_id: val }))
    }
  }

  const canSave = form.product_name.trim() !== '' && (!isNewMain || newMainCat.trim() !== '') && (!isNewSub || newSubCat.trim() !== '')

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    let categoryId = form.category_id
    if (isNewMain || isNewSub) {
      const finalMain = isNewMain ? newMainCat.trim() : mainCat
      const finalSub = newSubCat.trim()
      const { data: catData, error: catError } = await supabase.from('product_categories')
        .insert({ main_category: finalMain, sub_category: finalSub })
        .select('id')
        .single()
      if (catError || !catData) { setSaving(false); return }
      categoryId = (catData as any).id
    }
    const payload = { ...form, category_id: categoryId || null, notes: null, stock_qty: 0 }
    const { data, error } = await supabase.from('products').insert(payload).select('*').single()
    if (!error && data) {
      onCreated(data as Product, itemNotes.trim())
    }
    setSaving(false)
  }

  const modalInputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">快速新增產品</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">大分類</label>
              {isNewMain ? (
                <div className="flex gap-1">
                  <input value={newMainCat} onChange={e => setNewMainCat(e.target.value)} className={modalInputClass} placeholder="輸入新大分類名稱" autoFocus />
                  <button type="button" onClick={cancelNewMain} className="px-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">取消</button>
                </div>
              ) : (
                <select value={mainCat} onChange={e => handleMainCatSelect(e.target.value)} className={modalInputClass}>
                  <option value="">— 請選擇 —</option>
                  {mainCats.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="__new__">+ 新增大分類</option>
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">子分類</label>
              {isNewSub ? (
                <div className="flex gap-1">
                  <input value={newSubCat} onChange={e => setNewSubCat(e.target.value)} className={modalInputClass} placeholder="輸入新子分類名稱" />
                  {!isNewMain && (
                    <button type="button" onClick={() => { setIsNewSub(false); setNewSubCat('') }} className="px-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">取消</button>
                  )}
                </div>
              ) : (
                <select value={form.category_id} onChange={e => handleSubCatSelect(e.target.value)} className={modalInputClass} disabled={!mainCat}>
                  <option value="">— 請選擇 —</option>
                  {subCats.map(c => <option key={c.id} value={c.id}>{c.sub_category}</option>)}
                  <option value="__new__">+ 新增子分類</option>
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">品牌</label>
              <input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} className={modalInputClass} placeholder="Yamaha" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">單位</label>
              <input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={modalInputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">產品名稱 *</label>
            <input value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} className={modalInputClass} placeholder="請輸入產品名稱" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">規格型號</label>
            <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} className={modalInputClass} placeholder="選填" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">品項備註（僅套用本次維修項目）</label>
            <input value={itemNotes} onChange={e => setItemNotes(e.target.value)} className={modalInputClass} placeholder="選填" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">定價（售價）</label>
              <input type="number" value={form.list_price} onChange={e => setForm(p => ({ ...p, list_price: Number(e.target.value) }))} className={modalInputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">進貨價（成本）</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: Number(e.target.value) }))} className={modalInputClass} />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <p className="text-xs text-gray-400">儲存後自動帶入維修項目</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSave} disabled={saving || !canSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? '新增中...' : '新增並帶入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// RepairQuoteTab
// ============================================================
function RepairQuoteTab({ req, repairQuote, repairItems, products, categories, onProductsReload, locked, onSave, onDecision }: {
  req: ServiceRequest
  repairQuote: ServiceRepairQuote | null
  repairItems: ServiceRepairQuoteItem[]
  products: Product[]
  categories: ProductCategory[]
  onProductsReload: () => Promise<void>
  locked: boolean
  onSave: (quote: any, items: any[]) => Promise<void>
  onDecision: (decision: '確認維修' | '放棄維修') => Promise<void>
}) {
  const [form, setForm] = useState({
    contact_name: repairQuote?.contact_name ?? req.contact_name ?? '',
    client_phone: repairQuote?.client_phone ?? req.phone ?? '',
    equipment_name: repairQuote?.equipment_name ?? req.equipment_name ?? '',
    equipment_model: repairQuote?.equipment_model ?? req.equipment_model ?? '',
    serial_no: repairQuote?.serial_no ?? req.serial_no ?? '',
    diagnosis_note: repairQuote?.diagnosis_note ?? '',
    estimated_days: repairQuote?.estimated_days?.toString() ?? '',
    notes: repairQuote?.notes ?? '',
  })
  const emptyItem = () => ({ product_id: null, description: '', model: '', unit: '項', quantity: 1, unit_price: 0, notes: '', provide_catalog: false, provide_manual: false })
  const [items, setItems] = useState<Partial<ServiceRepairQuoteItem>[]>(
    repairItems.length > 0 ? repairItems : [emptyItem()]
  )
  // 欄寬微調：每個使用者自己存，拖動即時生效
  const { widths: colW, startResize, reset: resetColW } = useColWidths('repair-quote-items', {
    name: 220, model: 120, unit: 64, qty: 80, price: 110, total: 112,
  })
  const [saving, setSaving] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [productDropdown, setProductDropdown] = useState<number | null>(null)
  const [productSearch, setProductSearch] = useState<Record<number, string>>({})
  const [catFilter, setCatFilter] = useState('')
  const [quickAddIdx, setQuickAddIdx] = useState<number | null>(null)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }
  function setItem(i: number, k: string, v: any) {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  }
  function addItem() { setItems(arr => [...arr, emptyItem()]) }
  function removeItem(i: number) { setItems(arr => arr.filter((_, idx) => idx !== i)) }

  function onProductSelect(idx: number, product: Product) {
    setItems(prev => prev.map((item, i) => i !== idx ? item : {
      ...item, product_id: product.id, description: product.product_name,
      model: product.model ?? '', unit: product.unit, unit_price: product.list_price,
    }))
    setProductDropdown(null)
    setProductSearch(p => ({ ...p, [idx]: '' }))
  }

  const mainCats = [...new Set(categories.map(c => c.main_category))]

  function filteredProducts(idx: number) {
    const q = (productSearch[idx] ?? '').toLowerCase()
    let list = products

    if (catFilter) {
      list = list.filter(p => {
        const pc = (p as any).product_categories
        return pc?.main_category === catFilter
      })
    }

    if (q) {
      list = list.filter(p => {
        const pc = (p as any).product_categories
        const catStr = `${pc?.main_category ?? ''} ${pc?.sub_category ?? ''}`.toLowerCase()
        return (
          p.product_name.toLowerCase().includes(q) ||
          (p.model?.toLowerCase() ?? '').includes(q) ||
          (p.brand?.toLowerCase() ?? '').includes(q) ||
          catStr.includes(q)
        )
      })
    }

    return list.slice(0, 20)
  }

  const subtotal = items.reduce((sum, it) => sum + ((it.quantity ?? 0) * (it.unit_price ?? 0)), 0)
  const taxAmount = 0
  const total = subtotal

  async function save() {
    setSaving(true)
    await onSave({
      contact_name: form.contact_name,
      client_phone: form.client_phone,
      equipment_name: form.equipment_name,
      equipment_model: form.equipment_model,
      serial_no: form.serial_no,
      diagnosis_note: form.diagnosis_note,
      estimated_days: form.estimated_days ? parseInt(form.estimated_days) : null,
      notes: form.notes,
      subtotal, tax_amount: taxAmount, total_amount: total,
    }, items.map(it => ({
      product_id: it.product_id ?? null,
      description: it.description ?? '',
      model: it.model ?? '',
      unit: it.unit ?? '項',
      quantity: it.quantity ?? 1,
      unit_price: it.unit_price ?? 0,
      notes: it.notes ?? null,
      provide_catalog: it.provide_catalog ?? false,
      provide_manual: it.provide_manual ?? false,
    })))
    setSaving(false)
  }

  const hasDecision = !!repairQuote?.customer_decision

  return (
    <div className="space-y-4">
      {quickAddIdx !== null && (
        <RepairQuickAddProductModal
          initialName={productSearch[quickAddIdx] ?? ''}
          categories={categories}
          onClose={() => setQuickAddIdx(null)}
          onCreated={async (product, itemNotes) => {
            await onProductsReload()
            onProductSelect(quickAddIdx, product)
            if (itemNotes) setItem(quickAddIdx, 'notes', itemNotes)
            setQuickAddIdx(null)
          }}
        />
      )}

      {repairQuote && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">維修報價單號</p>
            <p className="font-semibold text-gray-900">{repairQuote.repair_quote_no}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(`/service-requests/${req.id}/repair-quote/print`, '_blank')}
              className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700"
            >
              <FileText size={14} /> 匯出 PDF
            </button>
          {hasDecision ? (
            <span className={cn('text-sm font-medium px-3 py-1.5 rounded-full',
              repairQuote.customer_decision === '確認維修' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
              單位決定：{repairQuote.customer_decision}
            </span>
          ) : (
            !locked && (
              <div className="flex gap-2">
                <button disabled={deciding} onClick={async () => { setDeciding(true); await onDecision('確認維修'); setDeciding(false) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle size={14} /> 單位確認維修
                </button>
                <button disabled={deciding} onClick={async () => { setDeciding(true); await onDecision('放棄維修'); setDeciding(false) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  <XCircle size={14} /> 單位放棄維修
                </button>
              </div>
            )
          )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">基本資訊</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>聯絡人</label><input disabled={locked} className={inputClass} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
          <div><label className={labelClass}>電話</label><input disabled={locked} className={inputClass} value={form.client_phone} onChange={e => set('client_phone', e.target.value)} /></div>
          <div><label className={labelClass}>設備名稱</label><input disabled={locked} className={inputClass} value={form.equipment_name} onChange={e => set('equipment_name', e.target.value)} /></div>
          <div><label className={labelClass}>型號</label><input disabled={locked} className={inputClass} value={form.equipment_model} onChange={e => set('equipment_model', e.target.value)} /></div>
          <div><label className={labelClass}>序號</label><input disabled={locked} className={inputClass} value={form.serial_no} onChange={e => set('serial_no', e.target.value)} /></div>
          <div><label className={labelClass}>預計完工天數</label><input type="number" disabled={locked} className={inputClass} value={form.estimated_days} onChange={e => set('estimated_days', e.target.value)} /></div>
          <div className="col-span-2"><label className={labelClass}>診斷說明</label><textarea disabled={locked} className={inputClass} rows={3} value={form.diagnosis_note} onChange={e => set('diagnosis_note', e.target.value)} /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">維修項目</h3>
          {!locked && (
            <div className="flex items-center gap-3">
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"><Plus size={13} /> 新增項目</button>
              <ColWidthTools tableKey="repair-quote-items" widths={colW} onReset={resetColW} />
            </div>
          )}
        </div>

        {mainCats.length > 0 && (
          <div className="flex gap-1.5 px-5 py-2.5 border-b border-gray-100 flex-wrap items-center">
            <Tag size={13} className="text-gray-400 shrink-0" />
            <button onClick={() => setCatFilter('')} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${!catFilter ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>全部</button>
            {mainCats.map(m => (
              <button key={m} onClick={() => setCatFilter(catFilter === m ? '' : m)} className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${catFilter === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>{m}</button>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs text-gray-500 w-6">#</th>
              <ResizableTH col="name" widths={colW} startResize={startResize} className="px-3 py-2.5 text-left text-xs text-gray-500">品名</ResizableTH>
              <ResizableTH col="model" widths={colW} startResize={startResize} className="px-3 py-2.5 text-left text-xs text-gray-500">型號</ResizableTH>
              <ResizableTH col="unit" widths={colW} startResize={startResize} className="px-2 py-2.5 text-center text-xs text-gray-500">單位</ResizableTH>
              <ResizableTH col="qty" widths={colW} startResize={startResize} className="px-1 pr-2 py-2.5 text-center text-xs text-gray-500">數量</ResizableTH>
              <ResizableTH col="price" widths={colW} startResize={startResize} className="px-3 py-2.5 text-right text-xs text-gray-500">單價</ResizableTH>
              <ResizableTH col="total" widths={colW} startResize={startResize} className="px-3 py-2.5 text-right text-xs text-gray-500">小計</ResizableTH>
              {!locked && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((it, i) => {
              const results = filteredProducts(i)
              const searchStr = productSearch[i] ?? ''
              return (
                <Fragment key={i}>
                <tr className="hover:bg-blue-50/30 group">
                  <td className="px-3 py-2 text-xs text-gray-400 text-center">{i + 1}</td>
                  <td className="px-3 py-2 relative">
                    <input
                      disabled={locked}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={productDropdown === i ? searchStr || it.description : it.description ?? ''}
                      onFocus={() => { setProductDropdown(i); setProductSearch(p => ({ ...p, [i]: '' })) }}
                      onChange={e => {
                        setProductSearch(p => ({ ...p, [i]: e.target.value }))
                        setItem(i, 'description', e.target.value)
                        setItem(i, 'product_id', null)
                      }}
                      onBlur={() => setTimeout(() => setProductDropdown(null), 200)}
                      placeholder="輸入或搜尋產品"
                    />
                    {productDropdown === i && !locked && (
                      <div className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 w-80 max-h-56 overflow-y-auto">
                        {results.length > 0 ? results.map(p => {
                          const pc = (p as any).product_categories
                          return (
                            <button key={p.id} type="button" onMouseDown={() => onProductSelect(i, p)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-none">
                              <div className="font-medium text-gray-900">{p.product_name}</div>
                              <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                {pc && <span className="text-blue-500">{pc.main_category} · {pc.sub_category}</span>}
                                {pc && <span className="text-gray-300">|</span>}
                                <span>{p.brand} {p.model}</span>
                                <span className="text-gray-300">|</span>
                                <span className={p.stock_qty <= 0 ? 'text-red-500 font-medium' : ''}>庫存 {p.stock_qty}</span>
                                <span className="text-gray-300">|</span>
                                <span>NT${p.list_price.toLocaleString()}</span>
                              </div>
                            </button>
                          )
                        }) : (
                          <div className="px-3 py-2 text-sm text-gray-400">找不到符合的產品</div>
                        )}
                        <button
                          type="button"
                          onMouseDown={() => { setQuickAddIdx(i); setProductDropdown(null) }}
                          className="w-full text-left px-3 py-2.5 text-sm text-blue-600 font-medium hover:bg-blue-50 border-t border-gray-100 flex items-center gap-1.5"
                        >
                          <Plus size={13} /> 新增「{searchStr || '產品'}」到產品資料庫
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2"><input disabled={locked} className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none" value={it.model ?? ''} onChange={e => setItem(i, 'model', e.target.value)} /></td>
                  <td className="px-2 py-2"><input disabled={locked} className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] text-center focus:outline-none" value={it.unit ?? '項'} onChange={e => setItem(i, 'unit', e.target.value)} onFocus={e => e.target.select()} /></td>
                  <td className="pl-1 pr-1 py-2"><input type="number" min="0" step="1" disabled={locked} className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] text-center focus:outline-none" value={it.quantity === 0 ? '' : it.quantity ?? 1} onChange={e => setItem(i, 'quantity', e.target.value === '' ? 0 : (Number(e.target.value) || 0))} onFocus={e => e.target.select()} /></td>
                  <td className="pl-1 pr-1 py-2"><input type="number" min="0" disabled={locked} className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] text-right focus:outline-none" value={it.unit_price === 0 ? '' : it.unit_price ?? 0} onChange={e => setItem(i, 'unit_price', e.target.value === '' ? 0 : (Number(e.target.value) || 0))} onFocus={e => e.target.select()} /></td>
                  <td className="pl-1 pr-3 py-2 text-right font-semibold text-gray-700 text-[13px]">{((it.quantity ?? 0) * (it.unit_price ?? 0)).toLocaleString()}</td>
                  {!locked && <td className="px-2 py-2 text-center"><button onClick={() => removeItem(i)} disabled={items.length === 1} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 disabled:opacity-20 transition-opacity">✕</button></td>}
                </tr>
                <tr className="border-b border-gray-100">
                  <td />
                  <td colSpan={locked ? 6 : 7} className="px-3 pb-2 pt-0">
                    <div className="flex items-center gap-3">
                      <input
                        disabled={locked}
                        value={it.notes ?? ''}
                        onChange={e => setItem(i, 'notes', e.target.value)}
                        placeholder="品項備註（選填）"
                        className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0 whitespace-nowrap">
                        <input type="checkbox" disabled={locked} checked={it.provide_catalog ?? false} onChange={e => setItem(i, 'provide_catalog', e.target.checked)} className="accent-blue-600 w-3.5 h-3.5" />
                        型錄
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0 whitespace-nowrap">
                        <input type="checkbox" disabled={locked} checked={it.provide_manual ?? false} onChange={e => setItem(i, 'provide_manual', e.target.checked)} className="accent-blue-600 w-3.5 h-3.5" />
                        說明書
                      </label>
                    </div>
                  </td>
                </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={6} className="px-3 py-3 text-right text-sm font-semibold text-gray-800">含稅總金額</td>
              <td className="px-3 py-3 text-right text-base font-bold text-blue-700">NT${total.toLocaleString()}</td>
              {!locked && <td />}
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className={labelClass}>備註</label>
        <textarea disabled={locked} className={inputClass} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {!locked && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? '儲存中...' : repairQuote ? '更新維修報價單' : '建立維修報價單'}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// CloseTab
// ============================================================
function CloseTab({ req, locked, onClose }: {
  req: ServiceRequest
  locked: boolean
  onClose: (data: any) => Promise<void>
}) {
  const [form, setForm] = useState({
    closed_date: new Date().toISOString().split('T')[0],
    actual_repair_cost: req.actual_repair_cost?.toString() ?? '',
    payment_confirmed: req.payment_confirmed,
    pickup_confirmed: req.pickup_confirmed,
    close_notes: req.close_notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  if (locked) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle size={20} />
          <span className="font-semibold">此叫修單已結案</span>
        </div>
        <p className="text-sm text-gray-600">結案日期：{req.closed_date}</p>
        {req.close_notes && <p className="text-sm text-gray-600">結案備註：{req.close_notes}</p>}
        {(req as any).satisfaction_rating ? (
          <div className="pt-3 mt-1 border-t border-gray-100">
            <p className="text-sm text-gray-700">
              單位滿意度：{'★'.repeat((req as any).satisfaction_rating)}{'☆'.repeat(5 - (req as any).satisfaction_rating)}
              <span className="text-gray-400 ml-1">（{(req as any).satisfaction_rating}/5）</span>
            </p>
            {(req as any).satisfaction_comment && (
              <p className="text-sm text-gray-600 mt-1">單位留言：{(req as any).satisfaction_comment}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 pt-2 mt-1 border-t border-gray-100">單位尚未填寫滿意度評分</p>
        )}
      </div>
    )
  }

  if (req.status !== '已完成') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
        叫修單狀態需為「已完成」才能進行結案。目前狀態：<strong>{req.status}</strong>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">結案資訊</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>結案日期</label>
            <input type="date" className={inputClass} value={form.closed_date} onChange={e => setForm(f => ({ ...f, closed_date: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>實際維修費用 (NT$)</label>
            <input type="number" className={inputClass} value={form.actual_repair_cost} onChange={e => setForm(f => ({ ...f, actual_repair_cost: e.target.value }))} placeholder="保固外才填" />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.payment_confirmed} onChange={e => setForm(f => ({ ...f, payment_confirmed: e.target.checked }))} className="w-4 h-4" />
              收款已確認
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.pickup_confirmed} onChange={e => setForm(f => ({ ...f, pickup_confirmed: e.target.checked }))} className="w-4 h-4" />
              單位取件已確認
            </label>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>結案備註</label>
            <textarea className={inputClass} rows={3} value={form.close_notes} onChange={e => setForm(f => ({ ...f, close_notes: e.target.value }))} placeholder="如：更換電源板，測試正常" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={async () => {
            if (!confirm('確認結案？結案後叫修單將鎖定無法修改。')) return
            setSaving(true)
            await onClose({
              closed_date: form.closed_date,
              actual_repair_cost: form.actual_repair_cost ? parseFloat(form.actual_repair_cost) : null,
              payment_confirmed: form.payment_confirmed,
              pickup_confirmed: form.pickup_confirmed,
              close_notes: form.close_notes || null,
            })
            setSaving(false)
          }}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle size={16} />
          {saving ? '結案中...' : '確認結案'}
        </button>
      </div>
    </div>
  )
}
