'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Inquiry, InquiryItem, InquiryStatus, Vendor, Product } from '@/types'
import {
  Plus, Trash2, Link2, Mail, Copy, Send, CheckCircle, Sparkles,
  RotateCcw, Lock, AlertTriangle, X, DownloadCloud, FileText,
} from 'lucide-react'
import { knownBrandLogoUrl } from '@/lib/brand-logos'

const fmt = new Intl.NumberFormat('zh-TW')

export const INQUIRY_STATUS_COLORS: Record<InquiryStatus, string> = {
  '草稿':   'bg-gray-100 text-gray-600',
  '已送出': 'bg-blue-100 text-blue-700',
  '已回覆': 'bg-green-100 text-green-700',
  '已結案': 'bg-gray-100 text-gray-400',
}

type ItemForm = {
  id?: string
  product_id: string | null
  brand: string
  product_name: string
  model: string
  unit: string
  quantity: number
  current_cost: number
  vendor_price: number | null
  lead_time_days: number | null
  item_notes: string
  cost_synced: boolean
}

type AiParsedRow = {
  item_index: number
  vendor_price: number | null
  lead_time_days: number | null
  notes: string
  confidence: 'high' | 'low'
  apply: boolean
}

interface InquiryFormProps {
  initialInquiry?: Inquiry
  initialItems?: InquiryItem[]
}

export default function InquiryForm({ initialInquiry, initialItems }: InquiryFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDD, setShowVendorDD] = useState(false)
  const [creatingVendor, setCreatingVendor] = useState(false)
  const [copied, setCopied] = useState(false)

  // AI 回填 modal
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiFile, setAiFile] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiRows, setAiRows] = useState<AiParsedRow[] | null>(null)

  const [status, setStatus] = useState<InquiryStatus>(initialInquiry?.status ?? '草稿')
  const [fillToken, setFillToken] = useState<string | null>(initialInquiry?.fill_token ?? null)
  const [tokenLocked, setTokenLocked] = useState(initialInquiry?.token_locked ?? false)

  const [header, setHeader] = useState({
    inquiry_no: initialInquiry?.inquiry_no ?? '',
    vendor_id: initialInquiry?.vendor_id ?? '',
    vendor_name: initialInquiry?.vendor_name ?? '',
    contact_name: initialInquiry?.contact_name ?? '',
    phone: initialInquiry?.phone ?? '',
    email: initialInquiry?.email ?? '',
    inquiry_date: initialInquiry?.inquiry_date ?? new Date().toISOString().split('T')[0],
    reply_deadline: initialInquiry?.reply_deadline ?? '',
    notes: initialInquiry?.notes ?? '',
  })

  const [items, setItems] = useState<ItemForm[]>(
    initialItems?.map(i => ({
      id: i.id,
      product_id: i.product_id,
      brand: (i as any).brand ?? '',
      product_name: i.product_name,
      model: i.model ?? '',
      unit: i.unit,
      quantity: i.quantity,
      current_cost: i.current_cost,
      vendor_price: i.vendor_price,
      lead_time_days: i.lead_time_days,
      item_notes: i.item_notes ?? '',
      cost_synced: i.cost_synced,
    })) ?? []
  )

  const readonly = status === '已結案'
  const inquiryId = initialInquiry?.id ?? null

  useEffect(() => {
    loadVendors()
    loadProducts()
    if (!initialInquiry?.inquiry_no) generateNo()
    // 新單帶入詢價單預設備註（系統設定）
    if (!initialInquiry) {
      supabase.from('system_settings').select('*').single().then(({ data }) => {
        const s = data as any
        if (s?.inquiry_notes) setHeader(p => ({ ...p, notes: p.notes || s.inquiry_notes }))
      })
    }
  }, [])

  async function loadVendors() {
    const { data } = await supabase.from('vendors').select('*').eq('is_active', true).order('company_name')
    setVendors(data ?? [])
  }

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*, product_categories(main_category, sub_category)')
      .eq('is_active', true)
      .order('product_name')
    setProducts(data ?? [])
  }

  async function generateNo() {
    const res = await fetch('/api/inquiries/generate-no')
    const { inquiry_no } = await res.json()
    setHeader(p => ({ ...p, inquiry_no }))
  }

  const selectedVendor = vendors.find(v => v.id === header.vendor_id) ?? null
  const vendorHasFilter =
    (selectedVendor?.sales_categories?.length ?? 0) > 0 ||
    (selectedVendor?.brand_names?.length ?? 0) > 0

  // 過濾邏輯：產品主分類 ∈ 廠商銷售類別 OR 產品品牌 ∈ 廠商代理品牌
  function productMatchesVendor(p: any, v: Vendor): boolean {
    const mainCat = p.product_categories?.main_category as string | undefined
    const byCategory = !!mainCat && (v.sales_categories ?? []).includes(mainCat)
    const byBrand = !!p.brand && (v.brand_names ?? []).some(b => b.toLowerCase() === p.brand.toLowerCase())
    return byCategory || byBrand
  }

  const sellable = selectedVendor && vendorHasFilter
    ? products.filter(p => productMatchesVendor(p, selectedVendor))
    : products

  const matchesQuery = (p: any) => {
    const q = productSearch.toLowerCase()
    if (!q) return true
    return p.product_name.toLowerCase().includes(q) ||
      (p.model?.toLowerCase() ?? '').includes(q) ||
      (p.brand?.toLowerCase() ?? '').includes(q)
  }

  const filteredProducts = sellable.filter(matchesQuery).slice(0, 20)

  // 範圍外產品：廠商有設定銷售範圍時，範圍外但符合關鍵字的產品也列出（加註提醒），
  // 確保任何品項都能連結產品資料庫、回寫進價
  const outOfRangeProducts = (() => {
    if (!selectedVendor || !vendorHasFilter) return []
    const inRangeIds = new Set(sellable.map((p: any) => p.id))
    return products.filter(p => !inRangeIds.has(p.id) && matchesQuery(p)).slice(0, 15)
  })()

  function onVendorSelect(vendorId: string) {
    const v = vendors.find(v => v.id === vendorId)
    if (!v) return
    // 換廠商：清掉不符合新廠商條件的品項
    const hasFilter = (v.sales_categories?.length ?? 0) > 0 || (v.brand_names?.length ?? 0) > 0
    if (items.length > 0 && hasFilter) {
      const kept = items.filter(it => {
        const p = products.find(p => p.id === it.product_id)
        return p ? productMatchesVendor(p, v) : true
      })
      if (kept.length < items.length) {
        if (!confirm(`更換廠商將移除 ${items.length - kept.length} 個不符合新廠商銷售範圍的品項，確定？`)) return
        setItems(kept)
      }
    }
    setHeader(p => ({
      ...p,
      vendor_id: v.id,
      vendor_name: v.company_name,
      contact_name: v.contact_name ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
    }))
  }

  const filteredVendors = (() => {
    const q = vendorSearch.trim().toLowerCase()
    if (!q) return vendors.slice(0, 20)
    return vendors.filter(v =>
      v.company_name.toLowerCase().includes(q) ||
      (v.contact_name?.toLowerCase() ?? '').includes(q) ||
      (v.phone ?? '').includes(q)
    ).slice(0, 20)
  })()

  async function quickAddVendor(name: string) {
    if (creatingVendor || !name.trim()) return
    setCreatingVendor(true)
    const { data, error } = await supabase.from('vendors')
      .insert({ company_name: name.trim(), is_active: true })
      .select().single()
    setCreatingVendor(false)
    if (error || !data) { alert('新增廠商失敗：' + (error?.message ?? '')); return }
    setVendors(prev => [...prev, data as Vendor].sort((a, b) => a.company_name.localeCompare(b.company_name, 'zh-Hant')))
    setHeader(p => ({
      ...p,
      vendor_id: (data as any).id,
      vendor_name: (data as any).company_name,
      contact_name: '', phone: '', email: '',
    }))
    setVendorSearch('')
    setShowVendorDD(false)
  }

  function addProduct(p: any) {
    setItems(prev => [...prev, {
      product_id: p.id,
      brand: p.brand ?? '',
      product_name: p.product_name,
      model: p.model ?? '',
      unit: p.unit ?? '台',
      quantity: 1,
      current_cost: p.cost_price ?? 0,
      vendor_price: null,
      lead_time_days: null,
      item_notes: '',
      cost_synced: false,
    }])
    setProductSearch('')
    setShowDropdown(false)
  }

  function addEmptyItem() {
    setItems(prev => [...prev, {
      product_id: null, brand: '', product_name: '', model: '', unit: '台',
      quantity: 1, current_cost: 0, vendor_price: null, lead_time_days: null,
      item_notes: '', cost_synced: false,
    }])
  }

  // 每列品名搜尋下拉
  const [rowSearch, setRowSearch] = useState<Record<number, string>>({})
  const [rowDropdown, setRowDropdown] = useState<number | null>(null)
  const rowFiltered = (idx: number) => {
    const q = (rowSearch[idx] ?? '').toLowerCase()
    const list = q
      ? products.filter(p =>
          p.product_name.toLowerCase().includes(q) ||
          (p.model?.toLowerCase() ?? '').includes(q) ||
          (p.brand?.toLowerCase() ?? '').includes(q))
      : sellable
    return list.slice(0, 20)
  }
  function onRowPick(idx: number, p: any) {
    setItems(prev => prev.map((it, i) => i !== idx ? it : {
      ...it, product_id: p.id, brand: p.brand ?? '', product_name: p.product_name,
      model: p.model ?? '', unit: p.unit ?? '台', current_cost: p.cost_price ?? 0,
    }))
    setRowDropdown(null)
    setRowSearch(prev => ({ ...prev, [idx]: '' }))
  }

  function setItem<K extends keyof ItemForm>(idx: number, key: K, val: ItemForm[K]) {
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, [key]: val }))
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  // ── 儲存 ────────────────────────────────────────────
  async function persist(nextStatus?: InquiryStatus): Promise<string | null> {
    if (!header.vendor_id) { setError('請先選擇廠商'); return null }
    if (items.length === 0) { setError('請至少加入一個品項'); return null }
    setSaving(true); setError('')

    const payload = {
      inquiry_no: header.inquiry_no,
      vendor_id: header.vendor_id,
      vendor_name: header.vendor_name || null,
      contact_name: header.contact_name || null,
      phone: header.phone || null,
      email: header.email || null,
      inquiry_date: header.inquiry_date || null,
      reply_deadline: header.reply_deadline || null,
      notes: header.notes || null,
      status: nextStatus ?? status,
    }

    let id = inquiryId
    if (id) {
      const { error: e } = await supabase.from('inquiries').update(payload).eq('id', id)
      if (e) { setError(e.message); setSaving(false); return null }
      await supabase.from('inquiry_items').delete().eq('inquiry_id', id)
    } else {
      const { data, error: e } = await supabase.from('inquiries').insert(payload).select('id, fill_token').single()
      if (e || !data) { setError(e?.message ?? '建立失敗'); setSaving(false); return null }
      id = data.id
      setFillToken(data.fill_token)
    }

    const { error: e2 } = await supabase.from('inquiry_items').insert(
      items.map((it, i) => ({
        inquiry_id: id,
        product_id: it.product_id,
        brand: it.brand || null,
        product_name: it.product_name,
        model: it.model || null,
        unit: it.unit,
        quantity: it.quantity,
        current_cost: it.current_cost,
        vendor_price: it.vendor_price,
        lead_time_days: it.lead_time_days,
        item_notes: it.item_notes || null,
        cost_synced: it.cost_synced,
        sort_order: i,
      }))
    )
    if (e2) { setError(e2.message); setSaving(false); return null }

    if (nextStatus) setStatus(nextStatus)
    setSaving(false)
    return id
  }

  async function handleSaveDraft() {
    const id = await persist('草稿')
    if (id && !inquiryId) router.replace(`/inquiries/${id}`)
    else if (id) router.refresh()
  }

  async function handleSend() {
    if (!confirm('確認送出詢價單？送出後即可分享填價連結給廠商。')) return
    const id = await persist('已送出')
    if (id && !inquiryId) router.replace(`/inquiries/${id}`)
  }

  async function handleMarkReplied() {
    const id = await persist('已回覆')
    if (id && inquiryId) {
      await supabase.from('inquiries').update({ replied_at: new Date().toISOString(), reply_source: 'manual' }).eq('id', id)
    }
  }

  async function handleClose() {
    if (!inquiryId) return
    if (!confirm('確認結案？結案後將無法修改。')) return
    await persist('已結案')
  }

  async function handleReopen() {
    if (!inquiryId) return
    await supabase.from('inquiries').update({ token_locked: false, status: '已送出' }).eq('id', inquiryId)
    setTokenLocked(false)
    setStatus('已送出')
  }

  async function handleDuplicate() {
    if (!inquiryId) return
    const res = await fetch('/api/inquiries/generate-no')
    const { inquiry_no } = await res.json()
    const { data, error: e } = await supabase.from('inquiries').insert({
      inquiry_no,
      vendor_id: header.vendor_id,
      vendor_name: header.vendor_name || null,
      contact_name: header.contact_name || null,
      phone: header.phone || null,
      email: header.email || null,
      inquiry_date: new Date().toISOString().split('T')[0],
      notes: header.notes || null,
      status: '草稿',
    }).select('id').single()
    if (e || !data) { setError(e?.message ?? '複製失敗'); return }
    await supabase.from('inquiry_items').insert(
      items.map((it, i) => ({
        inquiry_id: data.id,
        product_id: it.product_id,
        brand: it.brand || null,
        product_name: it.product_name,
        model: it.model || null,
        unit: it.unit,
        quantity: it.quantity,
        current_cost: it.current_cost,
        item_notes: it.item_notes || null,
        sort_order: i,
      }))
    )
    router.push(`/inquiries/${data.id}`)
  }

  // ── 分享 ────────────────────────────────────────────
  const fillUrl = fillToken && typeof window !== 'undefined'
    ? `${window.location.origin}/rfq/${fillToken}` : ''

  async function handleCopyLink() {
    if (!fillUrl) return
    await navigator.clipboard.writeText(fillUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleEmail() {
    const subject = encodeURIComponent(`[詢價單] ${header.inquiry_no} — 光輝影音科技`)
    const lines = [
      `${header.vendor_name} ${header.contact_name ?? ''} 您好：`,
      '',
      `我們有以下產品需要詢價（單號 ${header.inquiry_no}），`,
      `請點擊以下連結直接填寫報價與交期：`,
      fillUrl,
      '',
      ...items.map((it, i) => `${i + 1}. ${it.product_name}${it.model ? ` (${it.model})` : ''} x ${it.quantity} ${it.unit}`),
      '',
      header.reply_deadline ? `煩請於 ${header.reply_deadline} 前回覆，謝謝。` : '謝謝。',
      '',
      '光輝影音科技',
    ]
    window.location.href = `mailto:${header.email}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`
  }

  // ── 成本回寫 ────────────────────────────────────────
  async function syncCost(idx: number) {
    const it = items[idx]
    if (!it.product_id || it.vendor_price == null) return
    if (!confirm(`將「${it.product_name}」成本更新為 NT$${fmt.format(it.vendor_price)}？`)) return
    const { data: prod } = await supabase.from('products').select('notes').eq('id', it.product_id).single()
    const dateTag = new Date().toISOString().slice(2, 10).replace(/-/g, '')
    const note = `${dateTag} 詢價 ${header.inquiry_no} 回寫成本`
    await supabase.from('products').update({
      cost_price: it.vendor_price,
      notes: prod?.notes ? `${prod.notes}\n${note}` : note,
    }).eq('id', it.product_id)
    setItem(idx, 'cost_synced', true)
    setItem(idx, 'current_cost', it.vendor_price)
    if (it.id) await supabase.from('inquiry_items').update({ cost_synced: true }).eq('id', it.id)
  }

  async function syncAllCosts() {
    const targets = items.map((it, i) => ({ it, i })).filter(({ it }) => it.product_id && it.vendor_price != null && !it.cost_synced)
    if (targets.length === 0) return
    if (!confirm(`將 ${targets.length} 項產品成本更新為廠商回覆價？`)) return
    for (const { it, i } of targets) {
      const { data: prod } = await supabase.from('products').select('notes').eq('id', it.product_id!).single()
      const dateTag = new Date().toISOString().slice(2, 10).replace(/-/g, '')
      const note = `${dateTag} 詢價 ${header.inquiry_no} 回寫成本`
      await supabase.from('products').update({
        cost_price: it.vendor_price,
        notes: prod?.notes ? `${prod.notes}\n${note}` : note,
      }).eq('id', it.product_id!)
      setItems(prev => prev.map((x, j) => j !== i ? x : { ...x, cost_synced: true, current_cost: it.vendor_price! }))
      if (it.id) await supabase.from('inquiry_items').update({ cost_synced: true }).eq('id', it.id)
    }
  }

  // ── AI 回填 ─────────────────────────────────────────
  function onAiFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setAiFile({ data: base64, mimeType: file.type, name: file.name })
    }
    reader.readAsDataURL(file)
  }

  async function runAiParse() {
    if (!aiText.trim() && !aiFile) { setAiError('請貼上廠商回覆內容或上傳檔案'); return }
    setAiLoading(true); setAiError(''); setAiRows(null)
    try {
      const res = await fetch('/api/inquiries/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText.trim() || undefined,
          file: aiFile ?? undefined,
          items: items.map((it, i) => ({ index: i, product_name: it.product_name, model: it.model, quantity: it.quantity })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI 解析失敗')
      const rows: AiParsedRow[] = (data.results ?? []).map((r: any) => ({
        item_index: r.index,
        vendor_price: r.vendor_price ?? null,
        lead_time_days: r.lead_time_days ?? null,
        notes: r.notes ?? '',
        confidence: r.confidence === 'high' ? 'high' : 'low',
        apply: r.confidence === 'high' && r.vendor_price != null,
      }))
      setAiRows(rows)
    } catch (err: any) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  async function applyAiRows() {
    if (!aiRows) return
    setItems(prev => prev.map((it, i) => {
      const r = aiRows.find(r => r.item_index === i && r.apply)
      if (!r) return it
      return {
        ...it,
        vendor_price: r.vendor_price ?? it.vendor_price,
        lead_time_days: r.lead_time_days ?? it.lead_time_days,
        item_notes: r.notes ? (it.item_notes ? `${it.item_notes}；${r.notes}` : r.notes) : it.item_notes,
      }
    }))
    setAiOpen(false)
    setAiRows(null)
    setAiText('')
    setAiFile(null)
    if (inquiryId) {
      await supabase.from('inquiries').update({ reply_source: 'ai' }).eq('id', inquiryId)
    }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
  const labelClass = "text-xs text-gray-600 mb-1 block"

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">{header.inquiry_no || '廠商詢價單'}</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${INQUIRY_STATUS_COLORS[status]}`}>{status}</span>
          {tokenLocked && (
            <span className="flex items-center gap-1 text-xs text-amber-600"><Lock size={12} /> 廠商已回覆，連結已鎖定</span>
          )}
        </div>
        <Link href="/inquiries" className="text-sm text-gray-500 hover:text-gray-700">← 返回列表</Link>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* 基本資訊 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">基本資訊</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>廠商 *</label>
            <div className="relative">
              <input
                value={showVendorDD ? vendorSearch : (selectedVendor?.company_name ?? '')}
                onChange={e => { setVendorSearch(e.target.value); setShowVendorDD(true) }}
                onFocus={() => { setVendorSearch(''); setShowVendorDD(true) }}
                onBlur={() => setTimeout(() => setShowVendorDD(false), 200)}
                placeholder="搜尋廠商名稱／聯絡人／電話，找不到可直接新增..."
                disabled={readonly}
                className={inputClass}
              />
              {showVendorDD && !readonly && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-auto">
                  {filteredVendors.map(v => (
                    <button key={v.id} type="button"
                      onMouseDown={() => { onVendorSelect(v.id); setVendorSearch(''); setShowVendorDD(false) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                      <div className="text-sm text-gray-900">{v.company_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {v.contact_name || '—'}{v.phone ? `　${v.phone}` : ''}
                      </div>
                    </button>
                  ))}
                  {filteredVendors.length === 0 && !vendorSearch.trim() && (
                    <div className="px-4 py-3 text-sm text-gray-400">尚無廠商資料</div>
                  )}
                  {!!vendorSearch.trim() &&
                    !vendors.some(v => v.company_name === vendorSearch.trim()) && (
                    <button type="button"
                      onMouseDown={() => quickAddVendor(vendorSearch)}
                      className="w-full text-left px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium">
                      {creatingVendor ? '新增中…' : `＋ 新增廠商「${vendorSearch.trim()}」`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass}>聯絡人</label>
            <input value={header.contact_name} onChange={e => setHeader(p => ({ ...p, contact_name: e.target.value }))} disabled={readonly} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>電話</label>
            <input value={header.phone} onChange={e => setHeader(p => ({ ...p, phone: e.target.value }))} disabled={readonly} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input value={header.email} onChange={e => setHeader(p => ({ ...p, email: e.target.value }))} disabled={readonly} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>詢價日期</label>
            <input type="date" value={header.inquiry_date} onChange={e => setHeader(p => ({ ...p, inquiry_date: e.target.value }))} disabled={readonly} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>回覆期限</label>
            <input type="date" value={header.reply_deadline} onChange={e => setHeader(p => ({ ...p, reply_deadline: e.target.value }))} disabled={readonly} className={inputClass} />
          </div>
        </div>

        {selectedVendor && !vendorHasFilter && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              此廠商尚未設定「銷售類別」或「代理品牌」，目前顯示全部產品。
              建議先至 <Link href="/vendors" className="underline font-medium">廠商建檔</Link> 補齊，詢價選品會更精準。
            </div>
          </div>
        )}
      </div>

      {/* 詢價品項 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            詢價品項 <span className="text-gray-400 normal-case">（共 {items.length} 項）</span>
          </div>
          <div className="flex items-center gap-3">
            {!readonly && (
              <button onClick={addEmptyItem} className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
                <Plus size={13} /> 新增品項
              </button>
            )}
            {status !== '草稿' && !readonly && (
              <button onClick={() => setAiOpen(true)} className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-medium">
                <Sparkles size={13} /> AI 回填廠商報價
              </button>
            )}
          </div>
        </div>

        {/* 產品搜尋 */}
        {!readonly && (
          <div className="relative mb-4 max-w-md">
            <input
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder={header.vendor_id ? '搜尋產品名稱 / 型號 / 品牌加入詢價...' : '請先選擇廠商'}
              disabled={!header.vendor_id}
              className={inputClass}
            />
            {showDropdown && header.vendor_id && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-auto">
                {filteredProducts.length === 0 && outOfRangeProducts.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">找不到符合的產品</div>
                ) : (
                  <>
                    {filteredProducts.map(p => (
                      <button key={p.id} onMouseDown={() => addProduct(p)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                        <div className="text-sm text-gray-900">
                          {p.brand && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mr-1.5">{p.brand}</span>}
                          {p.product_name}{p.model ? ` — ${p.model}` : ''}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          成本：NT${fmt.format(p.cost_price ?? 0)}　定價：NT${fmt.format(p.list_price ?? 0)}
                          　庫存：<span className={p.stock_qty <= 0 ? 'text-red-500' : ''}>{p.stock_qty}</span>
                          {p.product_categories?.main_category && <span className="ml-1.5">{p.product_categories.main_category}</span>}
                        </div>
                      </button>
                    ))}
                    {outOfRangeProducts.length > 0 && (
                      <>
                        <div className="px-4 py-1.5 text-xs text-amber-600 bg-amber-50 border-y border-amber-100">
                          以下產品不在此廠商登記的銷售範圍，仍可加入詢價
                        </div>
                        {outOfRangeProducts.map(p => (
                          <button key={p.id} onMouseDown={() => addProduct(p)} className="w-full text-left px-4 py-2.5 hover:bg-amber-50 border-b border-gray-50 last:border-0">
                            <div className="text-sm text-gray-700">
                              {p.brand && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mr-1.5">{p.brand}</span>}
                              {p.product_name}{p.model ? ` — ${p.model}` : ''}
                              <span className="ml-1.5 text-xs text-amber-600">範圍外</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              成本：NT${fmt.format(p.cost_price ?? 0)}　定價：NT${fmt.format(p.list_price ?? 0)}
                              　庫存：<span className={p.stock_qty <= 0 ? 'text-red-500' : ''}>{p.stock_qty}</span>
                              {p.product_categories?.main_category && <span className="ml-1.5">{p.product_categories.main_category}</span>}
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 品項表格 */}
        {items.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">尚未加入品項</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left py-2 pr-2 w-8">#</th>
                  <th className="text-left py-2 pr-2 w-20">品牌</th>
                  <th className="text-left py-2 pr-2 min-w-[160px]">品名</th>
                  <th className="text-left py-2 pr-2 w-24">型號</th>
                  <th className="text-left py-2 pr-2 w-14">單位</th>
                  <th className="text-right py-2 pr-2 w-20">數量</th>
                  <th className="text-right py-2 pr-2 w-24">目前成本</th>
                  <th className="text-right py-2 pr-2 w-28">進價</th>
                  <th className="text-right py-2 pr-2 w-20">交期(天)</th>
                  <th className="text-left py-2 pr-2 min-w-[120px]">品項備註</th>
                  <th className="py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-50 align-top">
                    <td className="py-2 pr-2 text-gray-400">{idx + 1}</td>
                    <td className="py-2 pr-2">
                      {(() => {
                        const logo = knownBrandLogoUrl(it.brand)
                        // eslint-disable-next-line @next/next/no-img-element
                        return logo ? <img src={logo} alt="" className="h-3.5 w-auto max-w-[56px] object-contain mb-0.5" /> : null
                      })()}
                      <input
                        value={it.brand} disabled={readonly}
                        onChange={e => setItem(idx, 'brand', e.target.value)}
                        placeholder="品牌"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg disabled:bg-gray-50" style={{ fontSize: 13 }}
                      />
                    </td>
                    <td className="py-2 pr-2 relative">
                      <input
                        value={rowDropdown === idx ? (rowSearch[idx] || it.product_name) : it.product_name}
                        disabled={readonly}
                        onFocus={() => { setRowDropdown(idx); setRowSearch(p => ({ ...p, [idx]: '' })) }}
                        onChange={e => {
                          setRowSearch(p => ({ ...p, [idx]: e.target.value }))
                          setItem(idx, 'product_name', e.target.value)
                        }}
                        onBlur={() => setTimeout(() => setRowDropdown(d => d === idx ? null : d), 200)}
                        placeholder="輸入或搜尋產品"
                        autoComplete="off"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg disabled:bg-gray-50" style={{ fontSize: 13, fontWeight: 500 }}
                      />
                      {rowDropdown === idx && !readonly && (
                        <div className="absolute top-full left-0 z-40 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 w-80 max-h-52 overflow-y-auto">
                          {rowFiltered(idx).map(p => (
                            <button key={p.id} type="button" onMouseDown={() => onRowPick(idx, p)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-50 last:border-none">
                              <div className="font-medium text-gray-900">
                                {p.brand && <span className="text-[11px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mr-1.5">{p.brand}</span>}
                                {p.product_name}{p.model ? ` — ${p.model}` : ''}
                              </div>
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                成本 NT${fmt.format(p.cost_price ?? 0)}　庫存 {p.stock_qty}
                              </div>
                            </button>
                          ))}
                          {rowFiltered(idx).length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-400">找不到符合的產品，可直接手動輸入</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={it.model} disabled={readonly}
                        onChange={e => setItem(idx, 'model', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg disabled:bg-gray-50" style={{ fontSize: 13 }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={it.unit} disabled={readonly}
                        onChange={e => setItem(idx, 'unit', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-center disabled:bg-gray-50" style={{ fontSize: 13 }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number" min={1} value={it.quantity} disabled={readonly}
                        onChange={e => setItem(idx, 'quantity', Number(e.target.value))}
                        className="w-full text-right px-2 py-1.5 border border-gray-200 rounded-lg disabled:bg-gray-50" style={{ fontSize: 13 }}
                      />
                    </td>
                    <td className="py-2 pr-2 text-right text-gray-400" style={{ fontSize: 13 }}>
                      {fmt.format(it.current_cost)}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number" min={0} value={it.vendor_price ?? ''} disabled={readonly}
                        onChange={e => setItem(idx, 'vendor_price', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="—"
                        className={`w-full text-right px-2 py-1.5 border rounded-lg disabled:bg-gray-50 ${
                          it.vendor_price == null ? 'border-gray-200'
                            : it.vendor_price <= it.current_cost ? 'border-green-300 text-green-700'
                            : 'border-red-300 text-red-600'
                        }`}
                        style={{ fontSize: 13 }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number" min={0} value={it.lead_time_days ?? ''} disabled={readonly}
                        onChange={e => setItem(idx, 'lead_time_days', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="—"
                        className="w-full text-right px-2 py-1.5 border border-gray-200 rounded-lg disabled:bg-gray-50" style={{ fontSize: 13 }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <textarea
                        value={it.item_notes} disabled={readonly} rows={1}
                        onChange={e => setItem(idx, 'item_notes', e.target.value)}
                        placeholder="品項備註（選填）"
                        className="w-full px-2 border border-gray-200 rounded-lg resize-none disabled:bg-gray-50"
                        style={{ fontSize: 13, padding: '7px 10px' }}
                      />
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {status === '已回覆' && it.vendor_price != null && (
                        it.cost_synced ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> 已回寫</span>
                        ) : (
                          <button onClick={() => syncCost(idx)} title="回寫產品成本" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                            <DownloadCloud size={12} /> 回寫成本
                          </button>
                        )
                      )}
                      {!readonly && (
                        <button onClick={() => removeItem(idx)} className="ml-2 p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 備註 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">備註</div>
        <textarea
          value={header.notes} disabled={readonly} rows={3}
          onChange={e => setHeader(p => ({ ...p, notes: e.target.value }))}
          placeholder="給廠商的補充說明（會顯示在填價頁）"
          className={inputClass + ' resize-none'}
        />
      </div>

      {/* 填價連結 */}
      {fillToken && status !== '草稿' && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 flex items-center gap-3 flex-wrap">
          <Link2 size={15} className="text-blue-600 shrink-0" />
          <code className="text-xs text-blue-800 break-all flex-1 min-w-[200px]">{fillUrl}</code>
          <button onClick={handleCopyLink} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 shrink-0">
            {copied ? '已複製！' : '複製連結'}
          </button>
        </div>
      )}

      {/* Action bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-60 bg-white border-t border-gray-200 px-4 py-3 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-end gap-2 flex-wrap">
          {status === '草稿' && (
            <>
              <button onClick={handleSaveDraft} disabled={saving} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm disabled:opacity-50">儲存草稿</button>
              <button onClick={handleSend} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                <Send size={14} /> 確認送出
              </button>
            </>
          )}
          {status === '已送出' && (
            <>
              <button onClick={handleEmail} disabled={!header.email} title={header.email ? '' : '廠商未設定 Email'} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm disabled:opacity-40">
                <Mail size={14} /> 寄到信箱
              </button>
              <button onClick={handleCopyLink} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                <Link2 size={14} /> {copied ? '已複製！' : '複製填價連結'}
              </button>
              <button onClick={handleDuplicate} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                <Copy size={14} /> 複製詢價單
              </button>
              <button onClick={() => persist()} disabled={saving} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm disabled:opacity-50">儲存</button>
              <button onClick={handleMarkReplied} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                <CheckCircle size={14} /> 標記已回覆
              </button>
            </>
          )}
          {status === '已回覆' && (
            <>
              <button onClick={syncAllCosts} className="flex items-center gap-1.5 px-3 py-2.5 border border-blue-200 text-blue-700 rounded-xl text-sm">
                <DownloadCloud size={14} /> 回寫成本(全部)
              </button>
              <button onClick={handleReopen} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                <RotateCcw size={14} /> 重新開放填價
              </button>
              <button onClick={handleDuplicate} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
                <Copy size={14} /> 複製詢價單
              </button>
              <button onClick={() => persist()} disabled={saving} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm disabled:opacity-50">儲存</button>
              <button onClick={handleClose} disabled={saving} className="px-4 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-medium disabled:opacity-50">結案</button>
            </>
          )}
          {status === '已結案' && (
            <button onClick={handleDuplicate} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
              <Copy size={14} /> 複製詢價單
            </button>
          )}
        </div>
      </div>

      {/* AI 回填 Modal */}
      {aiOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Sparkles size={16} className="text-violet-600" /> AI 回填廠商報價
              </div>
              <button onClick={() => { setAiOpen(false); setAiRows(null); setAiError('') }} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {!aiRows ? (
              <>
                <p className="text-sm text-gray-500 mb-3">
                  把廠商回覆的 Email / LINE 訊息貼進來，或上傳報價單 PDF / 照片，AI 會自動對應品項填入單價與交期。
                </p>
                <textarea
                  value={aiText}
                  onChange={e => setAiText(e.target.value)}
                  rows={6}
                  placeholder="貼上廠商回覆內容，例如：&#10;QL1 報價 165,000 未稅，交期約兩週&#10;QL5 缺貨，要調貨 30 天，78,500..."
                  className={inputClass + ' resize-none mb-3'}
                />
                <div className="flex items-center gap-3 mb-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer border border-dashed border-gray-300 rounded-xl px-4 py-2.5 hover:border-violet-400">
                    <FileText size={15} />
                    {aiFile ? aiFile.name : '上傳報價單（PDF / 圖片）'}
                    <input type="file" accept="application/pdf,image/*" onChange={onAiFileChange} className="hidden" />
                  </label>
                  {aiFile && <button onClick={() => setAiFile(null)} className="text-xs text-gray-400 hover:text-red-500">移除</button>}
                </div>
                {aiError && <div className="text-sm text-red-600 mb-3">{aiError}</div>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAiOpen(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
                  <button onClick={runAiParse} disabled={aiLoading} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                    {aiLoading ? 'AI 解析中...' : '開始解析'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">請確認 AI 辨識結果，勾選要寫入的項目（黃色為低信心，請人工核對）：</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 bg-gray-50">
                        <th className="py-2 px-2 w-10"></th>
                        <th className="text-left py-2 px-2">品項</th>
                        <th className="text-right py-2 px-2">辨識單價</th>
                        <th className="text-right py-2 px-2">交期(天)</th>
                        <th className="text-left py-2 px-2">備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiRows.map((r, i) => {
                        const it = items[r.item_index]
                        if (!it) return null
                        return (
                          <tr key={i} className={`border-t border-gray-50 ${r.confidence === 'low' ? 'bg-amber-50' : ''}`}>
                            <td className="py-2 px-2 text-center">
                              <input type="checkbox" checked={r.apply} onChange={e => setAiRows(rows => rows!.map((x, j) => j !== i ? x : { ...x, apply: e.target.checked }))} className="accent-violet-600" />
                            </td>
                            <td className="py-2 px-2" style={{ fontSize: 13 }}>{it.product_name}{it.model ? ` (${it.model})` : ''}</td>
                            <td className="py-2 px-2 text-right" style={{ fontSize: 13 }}>{r.vendor_price != null ? `NT$${fmt.format(r.vendor_price)}` : '—'}</td>
                            <td className="py-2 px-2 text-right" style={{ fontSize: 13 }}>{r.lead_time_days ?? '—'}</td>
                            <td className="py-2 px-2 text-gray-500" style={{ fontSize: 13 }}>{r.notes}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAiRows(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">重新解析</button>
                  <button onClick={applyAiRows} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">
                    確認寫入（{aiRows.filter(r => r.apply).length} 項）
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
