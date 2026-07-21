'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Quote, QuoteItem, Product, SystemSettings } from '@/types'
import { Plus, Trash2, Clock, X, Tag, TrendingUp, ExternalLink, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, FolderPlus, Search, GripVertical } from 'lucide-react'
import BrandInput from '@/components/BrandInput'
import { useColWidths, ResizableTH, ColWidthReset } from '@/components/ResizableTable'
import { knownBrandLogoUrl } from '@/lib/brand-logos'
import ProductPickerModal from '@/components/ProductPickerModal'

type MarketPlatform = {
  key: string
  name: string
  ok: boolean
  count: number
  min: number | null
  mid: number | null
  max: number | null
  searchUrl: string
  note?: string
}

interface ProductCategory {
  id: string
  main_category: string
  sub_category: string
}

interface QuoteItemForm {
  id?: string
  product_id: string | null
  brand: string
  product_name: string
  item_notes: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  provide_catalog: boolean
  provide_manual: boolean
  is_category: boolean
}

interface QuoteFormProps {
  initialQuote?: Partial<Quote>
  initialItems?: QuoteItem[]
  prefillClientId?: string
  prefillClientName?: string
  prefillPhone?: string
  prefillContact?: string
  prefillProjectId?: string
  prefillProjectName?: string
  onSuccess?: () => void
}

const emptyItem = (): QuoteItemForm => ({
  product_id: null, brand: '', product_name: '', item_notes: '', model: '', unit: '台',
  quantity: 1, unit_price: 0, provide_catalog: false, provide_manual: false, is_category: false,
})

const categoryItem = (): QuoteItemForm => ({
  product_id: null, brand: '', product_name: '', item_notes: '', model: '', unit: '',
  quantity: 0, unit_price: 0, provide_catalog: false, provide_manual: false, is_category: true,
})

// ============================================================
// 快速新增單位名稱 Modal
// ============================================================
interface QuickAddClientModalProps {
  initialName: string
  onClose: () => void
  onCreated: (client: any) => void
}

function QuickAddClientModal({ initialName, onClose, onCreated }: QuickAddClientModalProps) {
  const supabase = createClient()
  const [form, setForm] = useState({
    company_name: initialName,
    contact_name: '',
    phone: '',
    address: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.company_name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clients').insert(form).select('*').single()
    if (!error && data) onCreated(data)
    setSaving(false)
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">快速新增單位名稱</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">單位名稱 *</label>
            <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className={inputClass} placeholder="公司或單位名稱" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">聯絡人</label>
            <input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} className={inputClass} placeholder="聯絡人姓名" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">電話</label>
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="連絡電話" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">地址</label>
            <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputClass} placeholder="地址（選填）" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
          <button onClick={handleSave} disabled={saving || !form.company_name.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? '新增中...' : '新增並帶入'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 快速新增產品 Modal
// ============================================================
interface QuickAddProductModalProps {
  initialName: string
  categories: ProductCategory[]
  onClose: () => void
  onCreated: (product: Product, itemNotes: string) => void
}

function QuickAddProductModal({ initialName, categories, onClose, onCreated }: QuickAddProductModalProps) {
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

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

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
                  <input value={newMainCat} onChange={e => setNewMainCat(e.target.value)} className={inputClass} placeholder="輸入新大分類名稱" autoFocus />
                  <button type="button" onClick={cancelNewMain} className="px-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">取消</button>
                </div>
              ) : (
                <select value={mainCat} onChange={e => handleMainCatSelect(e.target.value)} className={inputClass}>
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
                  <input value={newSubCat} onChange={e => setNewSubCat(e.target.value)} className={inputClass} placeholder="輸入新子分類名稱" />
                  {!isNewMain && (
                    <button type="button" onClick={() => { setIsNewSub(false); setNewSubCat('') }} className="px-2 text-xs text-gray-400 hover:text-gray-600 shrink-0">取消</button>
                  )}
                </div>
              ) : (
                <select value={form.category_id} onChange={e => handleSubCatSelect(e.target.value)} className={inputClass} disabled={!mainCat}>
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
              <input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} className={inputClass} placeholder="Yamaha" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">單位</label>
              <input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">產品名稱 *</label>
            <input value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} className={inputClass} placeholder="請輸入產品名稱" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">規格型號</label>
            <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} className={inputClass} placeholder="選填" />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">品項備註（僅套用本次報價項目）</label>
            <input value={itemNotes} onChange={e => setItemNotes(e.target.value)} className={inputClass} placeholder="選填" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">定價（售價）</label>
              <input type="number" value={form.list_price} onChange={e => setForm(p => ({ ...p, list_price: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">進貨價（成本）</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: Number(e.target.value) }))} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <p className="text-xs text-gray-400">儲存後自動帶入報價品項</p>
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
// QuoteForm
// ============================================================
export default function QuoteForm({
  initialQuote, initialItems,
  prefillClientId, prefillClientName, prefillPhone, prefillContact,
  prefillProjectId, prefillProjectName,
  onSuccess
}: QuoteFormProps) {
  const projectId = (initialQuote as any)?.project_id ?? prefillProjectId ?? null
  const router = useRouter()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [clients, setClients] = useState<any[]>([])
  const [salespeople, setSalespeople] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [productSearch, setProductSearch] = useState<Record<number, string>>({})
  const [productDropdown, setProductDropdown] = useState<number | null>(null)
  const [catFilter, setCatFilter] = useState<string>('')
  const [historyPanel, setHistoryPanel] = useState<number | null>(null)
  const [historyData, setHistoryData] = useState<Record<number, { order_no: string; client_name: string; date: string; quantity: number; unit_price: number }[]>>({})
  const [historyLoading, setHistoryLoading] = useState<number | null>(null)
  const [marketPanel, setMarketPanel] = useState<number | null>(null)
  const [marketData, setMarketData] = useState<Record<number, MarketPlatform[]>>({})
  const [marketLoading, setMarketLoading] = useState<number | null>(null)
  const [quickAddIdx, setQuickAddIdx] = useState<number | null>(null)
  const [pickerTarget, setPickerTarget] = useState<number | 'append' | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showQuickAddClient, setShowQuickAddClient] = useState(false)

  const [header, setHeader] = useState({
    quote_no: initialQuote?.quote_no ?? '',
    client_id: initialQuote?.client_id ?? prefillClientId ?? '',
    client_name_display: initialQuote?.client_id ? '' : (prefillClientName ?? ''),
    project_name: initialQuote?.project_name ?? prefillProjectName ?? '',
    contact_name: initialQuote?.contact_name ?? prefillContact ?? '',
    client_phone: initialQuote?.client_phone ?? prefillPhone ?? '',
    client_address: initialQuote?.client_address ?? '',
    valid_until: initialQuote?.valid_until ?? '',
    win_probability: initialQuote?.win_probability ?? '',
    expected_close_date: initialQuote?.expected_close_date ?? '',
    delivery_days: initialQuote?.delivery_days ?? 14,
    payment_terms: initialQuote?.payment_terms ?? '',
    bank_account: initialQuote?.bank_account ?? '',
    notes: initialQuote?.notes ?? '',
    salesperson_id: (initialQuote as any)?.salesperson_id ?? '',
  })

  const [items, setItems] = useState<QuoteItemForm[]>(
    initialItems?.map(i => ({
      id: i.id,
      product_id: i.product_id,
      brand: (i as any).brand ?? '',
      product_name: i.product_name,
      item_notes: i.item_notes ?? '',
      model: i.model ?? '',
      unit: i.unit,
      quantity: i.quantity,
      unit_price: i.unit_price,
      provide_catalog: i.provide_catalog,
      provide_manual: i.provide_manual,
      is_category: (i as any).is_category ?? false,
    })) ?? [emptyItem()]
  )

  useEffect(() => {
    loadSettings()
    loadClients()
    loadProducts()
    loadSalespeople()
    if (!initialQuote?.quote_no) generateQuoteNo()
  }, [])

  useEffect(() => {
    if (settings && !initialQuote?.valid_until && !header.valid_until) {
      const d = new Date()
      d.setDate(d.getDate() + (settings.valid_days ?? 30))
      setHeader(p => ({ ...p, valid_until: d.toISOString().split('T')[0], payment_terms: settings.payment_terms ?? '', bank_account: settings.bank_account ?? '', delivery_days: settings.delivery_days ?? 14, notes: settings.quote_notes ?? '' }))
    }
  }, [settings])

  async function loadSettings() {
    const { data } = await supabase.from('system_settings').select('*').single()
    setSettings(data)
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('id, company_name, contact_name, phone, address').order('company_name')
    setClients(data ?? [])
  }

  async function loadSalespeople() {
    const { data } = await supabase.from('user_profiles').select('id, full_name').eq('is_active', true).order('full_name')
    setSalespeople(data ?? [])
  }

  async function loadProducts() {
    const [pRes, cRes] = await Promise.all([
      supabase.from('products').select('*, product_categories(main_category, sub_category)').eq('is_active', true).order('product_name'),
      supabase.from('product_categories').select('id, main_category, sub_category').order('main_category').order('sub_category'),
    ])
    setProducts(pRes.data ?? [])
    setCategories(cRes.data ?? [])
  }

  async function generateQuoteNo() {
    const res = await fetch('/api/quotes/generate-no')
    const { quote_no } = await res.json()
    setHeader(p => ({ ...p, quote_no }))
  }

  function onClientSelect(clientId: string) {
    const c = clients.find(c => c.id === clientId)
    if (c) {
      setHeader(p => ({
        ...p, client_id: c.id, client_name_display: c.company_name,
        contact_name: p.contact_name || (c.contact_name ?? ''),
        client_phone: p.client_phone || (c.phone ?? ''),
        client_address: p.client_address || (c.address ?? ''),
      }))
    }
  }

  function onProductSelect(idx: number, product: Product) {
    setItems(prev => prev.map((item, i) => i !== idx ? item : {
      ...item, product_id: product.id, brand: product.brand ?? '', product_name: product.product_name,
      model: product.model ?? '', unit: product.unit, unit_price: product.list_price,
    }))
    setProductDropdown(null)
    setProductSearch(p => ({ ...p, [idx]: '' }))
  }

  function addItem() { setItems(prev => [...prev, emptyItem()]) }

  function productToItem(p: any): QuoteItemForm {
    return {
      ...emptyItem(), product_id: p.id, brand: p.brand ?? '', product_name: p.product_name,
      model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.list_price) || 0,
    }
  }

  function handlePickerConfirm(picked: any[]) {
    setItems(prev => {
      const next = [...prev]
      let list = picked
      if (typeof pickerTarget === 'number') {
        const t = next[pickerTarget]
        if (t && !t.is_category && !t.product_name.trim() && picked.length > 0) {
          const p = picked[0]
          next[pickerTarget] = { ...t, product_id: p.id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.list_price) || 0 }
          list = picked.slice(1)
        }
      }
      list.forEach(p => next.push(productToItem(p)))
      return next
    })
    setPickerTarget(null)
  }

  function handlePickerQuickAdd(text: string) {
    let idx: number
    if (typeof pickerTarget === 'number') {
      idx = pickerTarget
    } else {
      idx = items.length
      setItems(prev => [...prev, emptyItem()])
    }
    setProductSearch(p => ({ ...p, [idx]: text }))
    setPickerTarget(null)
    setQuickAddIdx(idx)
  }
  function addCategory() { setItems(prev => [...prev, categoryItem()]) }
  function moveItem(idx: number, dir: -1 | 1) {
    setItems(prev => {
      const to = idx + dir
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[to]] = [next[to], next[idx]]
      return next
    })
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }
  /** 整組移動：分類標題 + 底下所有品項一起，與上/下一個分類區塊交換位置（2026-07 新增） */
  function moveCategoryBlock(idx: number, dir: -1 | 1) {
    setItems(prev => {
      if (!prev[idx]?.is_category) return prev
      const blockEnd = (start: number) => {
        let e = start + 1
        while (e < prev.length && !prev[e].is_category) e++
        return e
      }
      const end = blockEnd(idx)
      const block = prev.slice(idx, end)
      if (dir === -1) {
        // 找上一個分類標題；沒有就代表已是第一個分類，不動（最前面的散裝品項不受影響）
        let p = idx - 1
        while (p >= 0 && !prev[p].is_category) p--
        if (p < 0) return prev
        return [...prev.slice(0, p), ...block, ...prev.slice(p, idx), ...prev.slice(end)]
      } else {
        // 下一個分類區塊
        if (end >= prev.length || !prev[end].is_category) return prev
        const nextEnd = blockEnd(end)
        return [...prev.slice(0, idx), ...prev.slice(end, nextEnd), ...block, ...prev.slice(nextEnd)]
      }
    })
  }
  function setItem<K extends keyof QuoteItemForm>(idx: number, key: K, val: QuoteItemForm[K]) {
    setItems(prev => prev.map((item, i) => i !== idx ? item : { ...item, [key]: val }))
  }

  // ── 拖拉排序（2026-07 新增）：抓左側把手拖動。品項=單筆移動、分類標題=整組移動 ──
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropPos, setDropPos] = useState<{ idx: number; after: boolean } | null>(null)
  function clearDrag() { setDragIdx(null); setDropPos(null) }
  function rowDragOver(idx: number) {
    return (e: React.DragEvent) => {
      if (dragIdx === null) return
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setDropPos({ idx, after: e.clientY > r.top + r.height / 2 })
    }
  }
  function rowDrop(e: React.DragEvent) {
    e.preventDefault()
    if (dragIdx === null || dropPos === null) { clearDrag(); return }
    const insertAt = dropPos.idx + (dropPos.after ? 1 : 0)
    const from = dragIdx
    setItems(prev => {
      let start = from, end = from + 1
      if (prev[start]?.is_category) { while (end < prev.length && !prev[end].is_category) end++ }
      if (insertAt >= start && insertAt <= end) return prev
      const block = prev.slice(start, end)
      const rest = [...prev.slice(0, start), ...prev.slice(end)]
      const adj = insertAt > end ? insertAt - (end - start) : insertAt
      return [...rest.slice(0, adj), ...block, ...rest.slice(adj)]
    })
    clearDrag()
  }
  const dropLine = (idx: number) =>
    dropPos?.idx === idx ? (dropPos.after ? ' shadow-[inset_0_-2px_0_0_#3b82f6]' : ' shadow-[inset_0_2px_0_0_#3b82f6]') : ''
  const gripProps = (idx: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: clearDrag,
  })

  // 品項顯示編號：遇到分類標題就重新從 1 起算
  let __no = 0
  const displayNos = items.map(it => { if (it.is_category) { __no = 0; return 0 } __no += 1; return __no })

  const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_price)), 0)
  const taxAmount = 0
  const totalAmount = subtotal

  // 毛利計算（內部參考，僅計入有成本資料的品項）
  function costOf(item: QuoteItemForm): number | null {
    if (!item.product_id) return null
    const p = products.find(p => p.id === item.product_id)
    return p != null ? Number(p.cost_price) : null
  }
  const marginTotals = items.reduce(
    (acc, i) => {
      const c = costOf(i)
      if (c == null) return acc
      acc.revenue += Number(i.quantity) * Number(i.unit_price)
      acc.cost += Number(i.quantity) * c
      return acc
    },
    { revenue: 0, cost: 0 }
  )
  const grossProfit = marginTotals.revenue - marginTotals.cost
  const grossMarginPct = marginTotals.revenue > 0 ? (grossProfit / marginTotals.revenue) * 100 : null
  const marginColor = (pct: number) => pct >= 20 ? 'text-green-600' : pct >= 0 ? 'text-amber-600' : 'text-red-500'

  const filteredClients = clientSearch
    ? clients.filter(c =>
        c.company_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.contact_name ?? '').toLowerCase().includes(clientSearch.toLowerCase())
      )
    : clients

  const mainCats = [...new Set(categories.map(c => c.main_category))]

  const filteredProducts = (idx: number) => {
    const q = (productSearch[idx] ?? '').toLowerCase()
    let list = products

    // 該列已選品牌 → 只顯示該品牌的產品（2026-07 新增）
    const rowBrand = (items[idx]?.brand ?? '').trim().toLowerCase()
    if (rowBrand) {
      list = list.filter(p => ((p.brand ?? '') as string).trim().toLowerCase() === rowBrand)
    }

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

  async function fetchHistory(idx: number, productId: string) {
    if (historyData[idx]) { setHistoryPanel(historyPanel === idx ? null : idx); return }
    setHistoryLoading(idx)
    setHistoryPanel(idx)
    const res = await fetch(`/api/products/${productId}/price-history`)
    const { history } = await res.json()
    setHistoryData(p => ({ ...p, [idx]: history ?? [] }))
    setHistoryLoading(null)
  }

  // 市場行情（蝦皮 / PChome / momo 即時查價）
  async function fetchMarket(idx: number) {
    if (marketData[idx]) { setMarketPanel(marketPanel === idx ? null : idx); return }
    const item = items[idx]
    const q = [item.product_name, item.model].filter(Boolean).join(' ').trim()
    if (!q) return
    setMarketLoading(idx)
    setMarketPanel(idx)
    setHistoryPanel(null)
    try {
      const res = await fetch(`/api/market-prices?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setMarketData(p => ({ ...p, [idx]: data.platforms ?? [] }))
    } catch {
      setMarketData(p => ({ ...p, [idx]: [] }))
    }
    setMarketLoading(null)
  }

  async function handleSave(newStatus?: string) {
    if (!header.quote_no) { setError('請等待報價單號產生'); return }
    if (!header.client_id && !header.client_name_display) { setError('請選擇單位名稱'); return }

    // 草稿可以沒有品項（空白列自動略過）；確認報價才要求至少一筆完整品項
    const finalStatus = newStatus ?? (initialQuote?.status ?? '草稿')
    const isDraft = finalStatus === '草稿'
    const validItems = items.filter(i => i.is_category || i.product_name.trim())
    if (!isDraft) {
      if (items.some(i => !i.is_category && !i.product_name.trim())) { setError('請填寫所有品項的產品名稱'); return }
      if (validItems.filter(i => !i.is_category).length === 0) { setError('確認報價前，請至少新增一個品項'); return }
    }

    setSaving(true)
    setError('')

    const quotePayload = {
      quote_no: header.quote_no,
      client_id: header.client_id || null,
      project_name: header.project_name || null,
      project_id: projectId,
      contact_name: header.contact_name || null,
      client_phone: header.client_phone || null,
      client_address: header.client_address || null,
      valid_until: header.valid_until || null,
      win_probability: header.win_probability === '' ? null : Number(header.win_probability),
      expected_close_date: header.expected_close_date || null,
      delivery_days: Number(header.delivery_days) || null,
      payment_terms: header.payment_terms || null,
      bank_account: header.bank_account || null,
      notes: header.notes || null,
      salesperson_id: header.salesperson_id || null,
      subtotal, tax_amount: taxAmount, total_amount: totalAmount,
      status: newStatus ?? (initialQuote?.status ?? '草稿'),
    }

    let quoteId = initialQuote?.id

    if (quoteId) {
      const { error: e } = await supabase.from('quotes').update(quotePayload).eq('id', quoteId)
      if (e) { setError('儲存失敗：' + e.message); setSaving(false); return }
      await supabase.from('quote_items').delete().eq('quote_id', quoteId)
    } else {
      const { data, error: e } = await supabase.from('quotes').insert(quotePayload).select('id').single()
      if (e || !data) { setError('儲存失敗：' + e?.message); setSaving(false); return }
      quoteId = data.id
    }

    const itemsPayload = validItems.map((item, i) => ({
      quote_id: quoteId,
      seq_no: i + 1,
      product_id: item.product_id,
      brand: item.brand || null,
      product_name: item.product_name,
      item_notes: item.item_notes || null,
      model: item.model || null,
      unit: item.unit,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      provide_catalog: item.provide_catalog,
      provide_manual: item.provide_manual,
      is_category: item.is_category,
    }))

    if (itemsPayload.length > 0) {
      const { error: itemsErr } = await supabase.from('quote_items').insert(itemsPayload)
      if (itemsErr) { setError('品項儲存失敗：' + itemsErr.message); setSaving(false); return }
    }

    if (onSuccess) { onSuccess() } else { router.push(`/quotes/${quoteId}`) }
  }

  // 欄寬微調：每個使用者自己存（localStorage），拖動即時生效
  const { widths: colW, startResize, reset: resetColW } = useColWidths('quote-items', {
    brand: 110, name: 220, model: 150, unit: 56, qty: 56, price: 110, total: 112,
  })

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'
  const tdInput = 'w-full px-2 py-1.5 border border-gray-200 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="space-y-5">
      {showQuickAddClient && (
        <QuickAddClientModal
          initialName={clientSearch}
          onClose={() => setShowQuickAddClient(false)}
          onCreated={async (client) => {
            await loadClients()
            setHeader(p => ({ ...p, client_id: client.id, client_name_display: client.company_name, contact_name: p.contact_name || (client.contact_name ?? ''), client_phone: p.client_phone || (client.phone ?? ''), client_address: p.client_address || (client.address ?? '') }))
            setClientSearch('')
            setShowQuickAddClient(false)
          }}
        />
      )}

      {pickerTarget !== null && (
        <ProductPickerModal
          products={(() => {
            // 從某一列的放大鏡開啟且該列已選品牌 → 只列該品牌
            if (typeof pickerTarget === 'number') {
              const b = (items[pickerTarget]?.brand ?? '').trim().toLowerCase()
              if (b) return products.filter(p => ((p.brand ?? '') as string).trim().toLowerCase() === b)
            }
            return products
          })()}
          onClose={() => setPickerTarget(null)}
          onConfirm={handlePickerConfirm}
          onQuickAdd={handlePickerQuickAdd}
          confirmLabel="帶入報價單"
        />
      )}

      {quickAddIdx !== null && (
        <QuickAddProductModal
          initialName={productSearch[quickAddIdx] ?? ''}
          categories={categories}
          onClose={() => setQuickAddIdx(null)}
          onCreated={async (product, itemNotes) => {
            await loadProducts()
            onProductSelect(quickAddIdx, product)
            if (itemNotes) setItem(quickAddIdx, 'item_notes', itemNotes)
            setQuickAddIdx(null)
          }}
        />
      )}

      {/* 單位資訊 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-semibold text-gray-900">單位資訊</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>報價單號</label>
            <input value={header.quote_no} readOnly className={inputClass + ' bg-gray-50 text-gray-500 cursor-default'} />
          </div>
          <div className="relative">
            <label className={labelClass}>單位名稱 *</label>
            <input
              value={clientSearch || header.client_name_display}
              onChange={e => {
                const val = e.target.value
                setClientSearch(val)
                setHeader(p => ({ ...p, client_id: '', client_name_display: val }))
                setShowClientDropdown(true)
              }}
              onFocus={() => setShowClientDropdown(true)}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
              className={inputClass}
              placeholder="輸入搜尋或新增單位名稱"
              autoComplete="off"
            />
            {showClientDropdown && (
              <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
                {filteredClients.length > 0 && filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => {
                      onClientSelect(c.id)
                      setClientSearch('')
                      setShowClientDropdown(false)
                    }}
                    className="w-full px-3 py-2.5 text-sm text-left hover:bg-blue-50 flex flex-col border-b border-gray-50 last:border-0"
                  >
                    <span className="font-medium text-gray-900">{c.company_name}</span>
                    {c.contact_name && <span className="text-xs text-gray-400">{c.contact_name}</span>}
                  </button>
                ))}
                {clientSearch && !filteredClients.some(c => c.company_name === clientSearch) && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setShowClientDropdown(false)
                      setShowQuickAddClient(true)
                    }}
                    className="w-full px-3 py-2.5 text-sm text-left text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 border-t border-gray-100"
                  >
                    <span className="text-base leading-none">＋</span> 新增單位名稱「{clientSearch}」
                  </button>
                )}
                {!clientSearch && filteredClients.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-400">無單位名稱資料</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>聯絡人姓名</label>
            <input value={header.contact_name} onChange={e => setHeader(p => ({ ...p, contact_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>單位電話</label>
            <input value={header.client_phone} onChange={e => setHeader(p => ({ ...p, client_phone: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>業務員</label>
            <select value={header.salesperson_id} onChange={e => setHeader(p => ({ ...p, salesperson_id: e.target.value }))} className={inputClass}>
              <option value="">— 未指定 —</option>
              {salespeople.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>單位地址</label>
            <input value={header.client_address} onChange={e => setHeader(p => ({ ...p, client_address: e.target.value }))} className={inputClass} placeholder="從單位資料帶入，可修改" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>案名</label>
            <input value={header.project_name} onChange={e => setHeader(p => ({ ...p, project_name: e.target.value }))} className={inputClass} placeholder="例：禮堂音響設備更新" />
          </div>
        </div>
      </div>

      {/* 品項明細 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">品項明細</h2>
          <div className="flex items-center gap-4">
            <button onClick={() => setPickerTarget('append')} className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">
              <Search size={14} /> 選產品（多選）
            </button>
            <button onClick={addCategory} className="flex items-center gap-1.5 text-sm text-purple-600 hover:underline font-medium">
              <FolderPlus size={14} /> 插入分類標題
            </button>
            <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
              <Plus size={14} /> 新增品項
            </button>
            <ColWidthReset onReset={resetColW} />
          </div>
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
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2.5 text-left text-xs text-gray-500 font-medium w-6">#</th>
                <ResizableTH col="brand" widths={colW} startResize={startResize} className="px-2 py-2.5 text-left text-xs text-gray-500 font-medium">品牌</ResizableTH>
                <ResizableTH col="name" widths={colW} startResize={startResize} className="px-2 py-2.5 text-left text-xs text-gray-500 font-medium">品名</ResizableTH>
                <ResizableTH col="model" widths={colW} startResize={startResize} className="px-2 py-2.5 text-left text-xs text-gray-500 font-medium">型號</ResizableTH>
                <ResizableTH col="unit" widths={colW} startResize={startResize} className="px-2 py-2.5 text-center text-xs text-gray-500 font-medium">單位</ResizableTH>
                <ResizableTH col="qty" widths={colW} startResize={startResize} className="px-1 pr-2 py-2.5 text-center text-xs text-gray-500 font-medium">數量</ResizableTH>
                <ResizableTH col="price" widths={colW} startResize={startResize} className="px-2 py-2.5 text-right text-xs text-gray-500 font-medium">含稅單價</ResizableTH>
                <ResizableTH col="total" widths={colW} startResize={startResize} className="px-2 py-2.5 text-right text-xs text-gray-500 font-medium">含稅總計</ResizableTH>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, idx) => {
                const results = filteredProducts(idx)
                const searchStr = productSearch[idx] ?? ''

                if (item.is_category) {
                  return (
                    <tr key={idx} className={'bg-purple-50/70' + dropLine(idx)} onDragOver={rowDragOver(idx)} onDrop={rowDrop}>
                      <td className="px-3 py-2 text-center text-purple-500 whitespace-nowrap">
                        <span {...gripProps(idx)} title="拖拉整組移動（含底下品項）" className="cursor-grab active:cursor-grabbing text-purple-300 hover:text-purple-600 inline-flex align-middle mr-0.5"><GripVertical size={13} /></span>
                        <Tag size={13} className="inline-block align-middle" />
                      </td>
                      <td colSpan={6} className="px-3 py-2">
                        <input
                          value={item.product_name}
                          onChange={e => setItem(idx, 'product_name', e.target.value)}
                          placeholder="分類標題（例：音響設備、資訊設備）"
                          className={tdInput + ' font-semibold text-purple-800'}
                        />
                      </td>
                      <td className="pl-1 pr-3 py-2 text-right text-xs text-purple-400">分類</td>
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <button onClick={() => moveCategoryBlock(idx, -1)} title="整組上移（含底下所有品項）" className="p-0.5 text-purple-400 hover:text-purple-700"><ChevronsUp size={13} /></button>
                        <button onClick={() => moveCategoryBlock(idx, 1)} title="整組下移（含底下所有品項）" className="p-0.5 text-purple-400 hover:text-purple-700"><ChevronsDown size={13} /></button>
                        <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="僅移動標題列" className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ChevronUp size={13} /></button>
                        <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} title="僅移動標題列" className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ChevronDown size={13} /></button>
                        <button onClick={() => removeItem(idx)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <Fragment key={idx}>
                  <tr className={'hover:bg-blue-50/30 group' + dropLine(idx)} onDragOver={rowDragOver(idx)} onDrop={rowDrop}>
                    <td className="px-3 py-2 text-xs text-gray-400 text-center whitespace-nowrap">
                      <span {...gripProps(idx)} title="拖拉移動" className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-blue-500 inline-flex align-middle mr-0.5"><GripVertical size={12} /></span>
                      {displayNos[idx]}
                    </td>

                    {/* 品牌 */}
                    <td className="px-2 py-2">
                      {(() => {
                        const logo = knownBrandLogoUrl(item.brand)
                        return logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="" className="h-4 w-auto max-w-[72px] object-contain mb-1" />
                        ) : null
                      })()}
                      <BrandInput value={item.brand} onChange={v => setItem(idx, 'brand', v)} placeholder="品牌" className={tdInput} />
                    </td>

                    {/* 品名（點放大鏡開選產品視窗） */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          value={item.product_name}
                          onChange={e => setItem(idx, 'product_name', e.target.value)}
                          placeholder="輸入品名，或按放大鏡選產品"
                          className={tdInput + ' flex-1'}
                        />
                        <button type="button" onClick={() => setPickerTarget(idx)} title="從產品庫選取（可多選）"
                          className="p-1.5 text-gray-400 hover:text-blue-600 shrink-0">
                          <Search size={14} />
                        </button>
                      </div>
                    </td>

                    {/* 型號 */}
                    <td className="px-2 py-2">
                      <input value={item.model} onChange={e => setItem(idx, 'model', e.target.value)} className={tdInput} />
                    </td>

                    {/* 單位 */}
                    <td className="px-2 py-2">
                      <input value={item.unit} onChange={e => setItem(idx, 'unit', e.target.value)} onFocus={e => e.target.select()} className={tdInput + ' text-center'} />
                    </td>

                    {/* 數量 */}
                    <td className="pl-1 pr-1 py-2">
                      <input type="number" min="0" step="1"
                        value={item.quantity === 0 ? '' : item.quantity}
                        onChange={e => setItem(idx, 'quantity', e.target.value === '' ? 0 : (Number(e.target.value) || 0))}
                        onFocus={e => e.target.select()}
                        className={tdInput + ' text-center'} />
                    </td>

                    {/* 單價 + 歷史售價 */}
                    <td className="pl-1 pr-1 py-2 relative">
                      <div className="flex gap-1 items-center justify-end">
                        <input type="number" min="0"
                          value={item.unit_price === 0 ? '' : item.unit_price}
                          onChange={e => setItem(idx, 'unit_price', e.target.value === '' ? 0 : (Number(e.target.value) || 0))}
                          onFocus={e => e.target.select()}
                          className={tdInput + ' text-right shrink-0'} style={{ width: 80 }} />
                        {item.product_id && (
                          <button type="button" onClick={() => fetchHistory(idx, item.product_id!)} title="歷史售價" className="p-1 text-gray-400 hover:text-blue-600 shrink-0">
                            <Clock size={13} />
                          </button>
                        )}
                        {(item.product_name || item.model) && (
                          <button type="button" onClick={() => fetchMarket(idx)} title="市場行情（蝦皮/PChome/momo）" className="p-1 text-gray-400 hover:text-orange-600 shrink-0">
                            <TrendingUp size={13} />
                          </button>
                        )}
                      </div>
                      {marketPanel === idx && (
                        <div className="absolute top-full right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-80 mt-1 text-xs">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-orange-50 rounded-t-xl">
                            <span className="font-semibold text-gray-700">市場行情（即時）</span>
                            <button onClick={() => setMarketPanel(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          {marketLoading === idx ? (
                            <div className="px-3 py-4 text-center text-gray-400">查詢三平台中...</div>
                          ) : (
                            <div className="divide-y divide-gray-50">
                              <div className="grid grid-cols-4 px-3 py-1.5 text-gray-400 bg-gray-50">
                                <span>平台</span>
                                <span className="text-right">最低</span>
                                <span className="text-right">中間</span>
                                <span className="text-right">最高</span>
                              </div>
                              {(marketData[idx] ?? []).map(pf => (
                                <div key={pf.key} className="px-3 py-2">
                                  <div className="grid grid-cols-4 items-center">
                                    <a href={pf.searchUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-gray-700 font-medium hover:text-blue-600">
                                      {pf.name} <ExternalLink size={10} />
                                    </a>
                                    {pf.min != null ? (
                                      <>
                                        <button type="button" onClick={() => { setItem(idx, 'unit_price', pf.min!); setMarketPanel(null) }} className="text-right text-green-600 hover:underline font-medium">{pf.min.toLocaleString()}</button>
                                        <button type="button" onClick={() => { setItem(idx, 'unit_price', pf.mid!); setMarketPanel(null) }} className="text-right text-gray-800 hover:underline font-semibold">{pf.mid!.toLocaleString()}</button>
                                        <button type="button" onClick={() => { setItem(idx, 'unit_price', pf.max!); setMarketPanel(null) }} className="text-right text-red-500 hover:underline font-medium">{pf.max!.toLocaleString()}</button>
                                      </>
                                    ) : (
                                      <span className="col-span-3 text-right text-gray-400">{pf.note ?? '無資料'}</span>
                                    )}
                                  </div>
                                  {pf.min != null && pf.count > 0 && (
                                    <div className="text-gray-300 mt-0.5">共 {pf.count} 筆相符商品</div>
                                  )}
                                </div>
                              ))}
                              <div className="px-3 py-1.5 text-gray-300">點價格可帶入單價．點平台名開啟搜尋頁</div>
                            </div>
                          )}
                        </div>
                      )}
                      {historyPanel === idx && (
                        <div className="absolute top-full right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72 mt-1 text-xs">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                            <span className="font-semibold text-gray-700">歷史售價</span>
                            <button onClick={() => setHistoryPanel(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                          {historyLoading === idx ? (
                            <div className="px-3 py-4 text-center text-gray-400">載入中...</div>
                          ) : (historyData[idx] ?? []).length === 0 ? (
                            <div className="px-3 py-4 text-center text-gray-400">無歷史紀錄</div>
                          ) : (
                            <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                              {(historyData[idx] ?? []).map((h, hi) => (
                                <button key={hi} type="button" onClick={() => { setItem(idx, 'unit_price', h.unit_price); setHistoryPanel(null) }}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex justify-between items-center">
                                  <div>
                                    <div className="text-gray-700 font-medium">{h.client_name}</div>
                                    <div className="text-gray-400">{h.date} · {h.order_no} · ×{h.quantity}</div>
                                  </div>
                                  <div className="text-blue-600 font-semibold ml-2">NT${h.unit_price.toLocaleString()}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 總計（可直接輸入，回算單價）+ 毛利 */}
                    <td className="pl-1 pr-2 py-2 text-right">
                      <input
                        type="number" min="0"
                        value={Number(item.quantity) * Number(item.unit_price) === 0 ? '' : Math.round(Number(item.quantity) * Number(item.unit_price))}
                        onChange={e => {
                          const total = e.target.value === '' ? 0 : (Number(e.target.value) || 0)
                          const qty = Number(item.quantity)
                          setItem(idx, 'unit_price', qty > 0 ? total / qty : total)
                        }}
                        onFocus={e => e.target.select()}
                        title="可直接輸入含稅總計，系統會自動回算單價"
                        className={tdInput + ' text-right font-semibold'}
                      />
                      {(() => {
                        const c = costOf(item)
                        const price = Number(item.unit_price)
                        if (c == null || price <= 0) return null
                        const pct = ((price - c) / price) * 100
                        return (
                          <div className={`text-[11px] font-medium ${marginColor(pct)}`} title={`成本 NT$${c.toLocaleString()}／件`}>
                            毛利 {pct.toFixed(1)}%
                          </div>
                        )
                      })()}
                    </td>

                    <td className="px-2 py-2" />
                  </tr>

                  <tr className={'border-b border-gray-100' + (dropPos?.idx === idx && dropPos.after ? ' shadow-[inset_0_-2px_0_0_#3b82f6]' : '')}
                      onDragOver={e => { if (dragIdx === null) return; e.preventDefault(); setDropPos({ idx, after: true }) }} onDrop={rowDrop}>
                    <td className="px-2 pb-2 pt-0 text-center align-top">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="上移" className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ChevronUp size={14} /></button>
                        <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} title="下移" className="p-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-20"><ChevronDown size={14} /></button>
                      </div>
                    </td>
                    <td colSpan={7} className="px-3 pb-2 pt-0">
                      <div className="flex items-center gap-3">
                        <input
                          value={item.item_notes}
                          onChange={e => setItem(idx, 'item_notes', e.target.value)}
                          placeholder="品項備註（選填）"
                          className={tdInput + ' flex-1'}
                        />
                        <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0 whitespace-nowrap">
                          <input type="checkbox" checked={item.provide_catalog} onChange={e => setItem(idx, 'provide_catalog', e.target.checked)} className="accent-blue-600 w-3.5 h-3.5" />
                          型錄
                        </label>
                        <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0 whitespace-nowrap">
                          <input type="checkbox" checked={item.provide_manual} onChange={e => setItem(idx, 'provide_manual', e.target.checked)} className="accent-blue-600 w-3.5 h-3.5" />
                          說明書
                        </label>
                        {/* 刪除品項 */}
                        <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                          title="刪除此品項"
                          className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-20 shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                    <td />
                  </tr>
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={7} className="px-3 py-3 text-right text-sm font-semibold text-gray-800">含稅總金額</td>
                <td className="px-3 py-3 text-right text-base font-bold text-blue-700">NT${totalAmount.toLocaleString()}</td>
                <td colSpan={1} />
              </tr>
              {grossMarginPct != null && (
                <tr className="bg-gray-50">
                  <td colSpan={7} className="px-3 pb-3 text-right text-xs text-gray-400">
                    預估毛利（內部參考，不會出現在報價單上）
                    {marginTotals.revenue < subtotal && '，僅計入有成本資料的品項'}
                  </td>
                  <td className={`px-3 pb-3 text-right text-sm font-bold ${marginColor(grossMarginPct)}`}>
                    NT${Math.round(grossProfit).toLocaleString()}（{grossMarginPct.toFixed(1)}%）
                  </td>
                  <td colSpan={1} />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        {/* 底部快速操作列：品項多時不用捲回上面（2026-07 新增） */}
        <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 bg-gray-50/60">
          <button onClick={() => setPickerTarget('append')} className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">
            <Search size={14} /> 選產品（多選）
          </button>
          <button onClick={addCategory} className="flex items-center gap-1.5 text-sm text-purple-600 hover:underline font-medium">
            <FolderPlus size={14} /> 插入分類標題
          </button>
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
            <Plus size={14} /> 新增品項
          </button>
        </div>
      </div>

      {/* 報價條款 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-semibold text-gray-900">報價條款</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>有效期限</label>
            <input type="date" value={header.valid_until} onChange={e => setHeader(p => ({ ...p, valid_until: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>預估勝率（CEO 業績預測用）</label>
            <select value={header.win_probability} onChange={e => setHeader(p => ({ ...p, win_probability: e.target.value }))} className={inputClass}>
              <option value="">— 未評估 —</option>
              <option value="10">10%（初步接觸）</option>
              <option value="30">30%（已送出報價）</option>
              <option value="50">50%（單位有意願）</option>
              <option value="70">70%（送審中／比價中）</option>
              <option value="90">90%（幾乎確定）</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>預計結案日</label>
            <input type="date" value={header.expected_close_date} onChange={e => setHeader(p => ({ ...p, expected_close_date: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>交貨工期（天）</label>
            <input type="number" min="0" value={header.delivery_days} onChange={e => setHeader(p => ({ ...p, delivery_days: Number(e.target.value) }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>付款條件</label>
            <input value={header.payment_terms} onChange={e => setHeader(p => ({ ...p, payment_terms: e.target.value }))} className={inputClass} placeholder="例：30天月結" />
          </div>
          <div>
            <label className={labelClass}>匯款帳號</label>
            <input value={header.bank_account} onChange={e => setHeader(p => ({ ...p, bank_account: e.target.value }))} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>備註</label>
            <textarea value={header.notes} onChange={e => setHeader(p => ({ ...p, notes: e.target.value }))} rows={4} className={inputClass + ' resize-none'} placeholder="其他條款說明..." />
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      <div className="flex justify-end gap-3">
        <button onClick={() => router.back()} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">取消</button>
        <button onClick={() => handleSave('草稿')} disabled={saving} className="px-5 py-2.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50">儲存草稿</button>
        <button onClick={() => handleSave('已確認')} disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-medium">
          {saving ? '儲存中...' : '確認報價'}
        </button>
      </div>
    </div>
  )
}
