'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Product, Vendor } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Pencil, Trash2, Package, TrendingUp, ChevronRight, X, Tag, MessageSquareQuote, RefreshCw } from 'lucide-react'
import Link from 'next/link'

type MarketPriceRow = {
  product_id: string
  platform: 'shopee' | 'pchome' | 'momo'
  min_price: number | null
  mid_price: number | null
  max_price: number | null
  result_count: number
  search_url: string | null
  ok: boolean
  fetched_at: string
}

const PLATFORM_LABELS: Record<string, string> = { shopee: '蝦皮', pchome: 'PChome', momo: 'momo' }

// ============================================================
// 詢價紀錄 Modal（產品 → 歷次廠商詢價回覆）
// ============================================================
function InquiryHistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('inquiry_items')
        .select('id, vendor_price, lead_time_days, cost_synced, created_at, inquiry:inquiries(id, inquiry_no, vendor_name, inquiry_date, status)')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setRows((data ?? []).filter((r: any) => r.inquiry && r.inquiry.status !== '草稿'))
      setLoading(false)
    })()
  }, [product.id])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquareQuote size={16} className="text-blue-600" />
            詢價紀錄 — {product.product_name}{product.model ? ` (${product.model})` : ''}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-500 mb-3">目前成本：{formatCurrency(product.cost_price)}</div>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">載入中...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">此產品尚無詢價紀錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50">
                <th className="text-left py-2 px-3">日期</th>
                <th className="text-left py-2 px-3">詢價單號</th>
                <th className="text-left py-2 px-3">廠商</th>
                <th className="text-right py-2 px-3">回覆單價</th>
                <th className="text-right py-2 px-3">交期(天)</th>
                <th className="text-left py-2 px-3">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-gray-50">
                  <td className="py-2.5 px-3 text-gray-500">{r.inquiry.inquiry_date ?? '—'}</td>
                  <td className="py-2.5 px-3">
                    <Link href={`/inquiries/${r.inquiry.id}`} className="text-blue-600 hover:underline">{r.inquiry.inquiry_no}</Link>
                  </td>
                  <td className="py-2.5 px-3 text-gray-700">{r.inquiry.vendor_name ?? '—'}</td>
                  <td className="py-2.5 px-3 text-right">
                    {r.vendor_price != null ? (
                      <span className={r.vendor_price <= product.cost_price ? 'text-green-700 font-medium' : 'text-gray-900'}>
                        {formatCurrency(r.vendor_price)}
                        {r.cost_synced && <span className="ml-1 text-xs text-green-500">已回寫</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-500">{r.lead_time_days ?? '—'}</td>
                  <td className="py-2.5 px-3 text-xs text-gray-500">{r.inquiry.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface ProductCategory {
  id: string
  main_category: string
  mid_category: string | null
  sub_category: string
  sort_order: number
}

// ============================================================
// 分類管理 Modal
// ============================================================
function CategoryManagerModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const supabase = createClient()
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [newMain, setNewMain] = useState('')
  const [newSub, setNewSub] = useState('')
  const [saving, setSaving] = useState(false)

  async function fetchCats() {
    const { data } = await supabase.from('product_categories').select('*').order('main_category').order('sub_category')
    setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCats() }, [])

  const existingMains = [...new Set(categories.map(c => c.main_category))]

  async function handleAdd() {
    if (!newMain.trim() || !newSub.trim()) return
    setSaving(true)
    await supabase.from('product_categories').insert({ main_category: newMain.trim(), sub_category: newSub.trim() })
    setNewMain('')
    setNewSub('')
    await fetchCats()
    setSaving(false)
    onDone()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此分類？已指定此分類的產品將改為「未分類」。')) return
    await supabase.from('products').update({ category_id: null }).eq('category_id', id)
    await supabase.from('product_categories').delete().eq('id', id)
    fetchCats()
    onDone()
  }

  const grouped = categories.reduce<Record<string, ProductCategory[]>>((acc, c) => {
    if (!acc[c.main_category]) acc[c.main_category] = []
    acc[c.main_category].push(c)
    return acc
  }, {})

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">管理產品分類</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 新增分類 */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-blue-900">新增分類</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">主分類</label>
                <input
                  list="main-cat-list"
                  value={newMain}
                  onChange={e => setNewMain(e.target.value)}
                  placeholder="如：音響、影像、燈光"
                  className={inputClass}
                />
                <datalist id="main-cat-list">
                  {existingMains.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">子分類</label>
                <input
                  value={newSub}
                  onChange={e => setNewSub(e.target.value)}
                  placeholder="如：混音器、擴大機"
                  className={inputClass}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                />
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !newMain.trim() || !newSub.trim()}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus size={14} /> {saving ? '新增中...' : '新增分類'}
            </button>
          </div>

          {/* 現有分類 */}
          {loading ? (
            <div className="text-center text-gray-400 py-4 text-sm">載入中...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center text-gray-400 py-6 text-sm">尚無分類，請先新增</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([main, cats]) => (
                <div key={main}>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 px-1">{main}</div>
                  <div className="space-y-1">
                    {cats.map(c => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100">
                        <span className="text-sm text-gray-700">{c.sub_category}</span>
                        <button onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-red-500 p-1 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">關閉</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 批次調價 Modal
// ============================================================
function BatchPriceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const supabase = createClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [pct, setPct] = useState('')
  const [preview, setPreview] = useState<{ id: string; name: string; model: string | null; oldPrice: number; newPrice: number }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('vendors').select('id,company_name,brand_names').eq('is_active', true).order('company_name').then(({ data }) => setVendors(data ?? []))
    supabase.from('products').select('*').eq('is_active', true).order('brand').order('product_name').then(({ data }) => setAllProducts(data ?? []))
  }, [])

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)
  const vendorBrands: string[] = (selectedVendor as any)?.brand_names ?? []
  const matchedProducts = allProducts.filter(p => p.brand && vendorBrands.some(b => b.toLowerCase() === (p.brand ?? '').toLowerCase()))
  const brandsAvailable = [...new Set(matchedProducts.map(p => p.brand).filter(Boolean))] as string[]
  const allBrands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))] as string[]
  const displayBrands = brandsAvailable.length > 0 ? brandsAvailable : allBrands
  const productsForBrand = allProducts.filter(p => selectedBrand ? (p.brand ?? '').toLowerCase() === selectedBrand.toLowerCase() : false)

  function buildPreview() {
    const n = parseFloat(pct)
    if (isNaN(n)) return
    setPreview(productsForBrand.map(p => ({ id: p.id, name: p.product_name, model: p.model, oldPrice: p.list_price, newPrice: Math.round(p.list_price * (1 + n / 100)) })))
    setStep(3)
  }

  async function confirmUpdate() {
    setSaving(true)
    for (const item of preview) {
      await supabase.from('products').update({ list_price: item.newPrice }).eq('id', item.id)
    }
    setSaving(false)
    onDone()
  }

  const pctNum = parseFloat(pct)
  const isPositive = pctNum > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2"><TrendingUp size={18} className="text-blue-600" /><h2 className="font-semibold text-gray-900">批次調價</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 text-xs">
          {(['選擇廠商/品牌', '設定調整幅度', '確認預覽'] as const).map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{step > i + 1 ? '✓' : i + 1}</span>
              <span className={step === i + 1 ? 'text-blue-700 font-medium' : 'text-gray-400'}>{label}</span>
              {i < 2 && <ChevronRight size={12} className="text-gray-300" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">選擇廠商</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedVendorId} onChange={e => { setSelectedVendorId(e.target.value); setSelectedBrand('') }}>
                  <option value="">— 選擇廠商 —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
                </select>
              </div>
              {selectedVendorId && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">選擇品牌{vendorBrands.length > 0 ? <span className="text-gray-400 ml-1">（此廠商代理品牌）</span> : <span className="text-amber-600 ml-1">（此廠商未設定代理品牌，顯示全部）</span>}</label>
                  <div className="flex flex-wrap gap-2">
                    {displayBrands.map(b => (
                      <button key={b} onClick={() => setSelectedBrand(b)} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedBrand === b ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-700 hover:border-blue-300'}`}>{b}</button>
                    ))}
                  </div>
                  {selectedBrand && <p className="text-xs text-gray-500 mt-2">品牌「{selectedBrand}」共 {productsForBrand.length} 筆產品</p>}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">已選：{selectedVendor?.company_name} → 品牌「{selectedBrand}」（{productsForBrand.length} 筆產品）</div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">調整幅度（%）</label>
                <div className="flex items-center gap-3">
                  <input type="number" step="0.1" className="w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="例：5 或 -10" value={pct} onChange={e => setPct(e.target.value)} />
                  {!isNaN(pctNum) && pct !== '' && <span className={`text-sm font-medium ${isPositive ? 'text-red-600' : 'text-green-600'}`}>{isPositive ? `漲價 ${pct}%` : `降價 ${Math.abs(pctNum)}%`}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-1">新售價 = 原售價 × (1 + N/100)，取整數</p>
              </div>
              {!isNaN(pctNum) && pct !== '' && productsForBrand.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 border-b border-gray-200">預覽（前 5 筆）</div>
                  <table className="w-full text-sm"><thead><tr className="border-b border-gray-100"><th className="px-4 py-2 text-left text-xs text-gray-500">品名</th><th className="px-4 py-2 text-right text-xs text-gray-500">現在</th><th className="px-4 py-2 text-right text-xs text-gray-500">更新後</th></tr></thead>
                    <tbody>{productsForBrand.slice(0, 5).map(p => { const np = Math.round(p.list_price * (1 + pctNum / 100)); return (<tr key={p.id} className="border-b border-gray-50 last:border-none"><td className="px-4 py-2 text-gray-800">{p.product_name}</td><td className="px-4 py-2 text-right text-gray-500">{p.list_price.toLocaleString()}</td><td className={`px-4 py-2 text-right font-medium ${np > p.list_price ? 'text-red-600' : np < p.list_price ? 'text-green-600' : 'text-gray-700'}`}>{np.toLocaleString()}</td></tr>) })}</tbody>
                  </table>
                  {productsForBrand.length > 5 && <div className="text-xs text-gray-400 text-center py-2">還有 {productsForBrand.length - 5} 筆...</div>}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">確認後將更新 {preview.length} 筆產品售價，無法復原，請確認正確。</div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b border-gray-200"><th className="px-4 py-2 text-left text-xs text-gray-500">品名</th><th className="px-4 py-2 text-left text-xs text-gray-500">型號</th><th className="px-4 py-2 text-right text-xs text-gray-500">原售價</th><th className="px-4 py-2 text-right text-xs text-gray-500">新售價</th><th className="px-4 py-2 text-right text-xs text-gray-500">差異</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">{preview.map(item => (<tr key={item.id}><td className="px-4 py-2 text-gray-800">{item.name}</td><td className="px-4 py-2 text-gray-500">{item.model ?? '—'}</td><td className="px-4 py-2 text-right text-gray-500">{item.oldPrice.toLocaleString()}</td><td className="px-4 py-2 text-right font-semibold text-gray-900">{item.newPrice.toLocaleString()}</td><td className={`px-4 py-2 text-right text-xs font-medium ${item.newPrice > item.oldPrice ? 'text-red-600' : item.newPrice < item.oldPrice ? 'text-green-600' : 'text-gray-400'}`}>{item.newPrice === item.oldPrice ? '—' : (item.newPrice > item.oldPrice ? '+' : '') + (item.newPrice - item.oldPrice).toLocaleString()}</td></tr>))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button onClick={() => { if (step > 1) setStep(s => (s - 1) as 1 | 2 | 3); else onClose() }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">{step === 1 ? '取消' : '上一步'}</button>
          <button disabled={(step === 1 && (!selectedVendorId || !selectedBrand || productsForBrand.length === 0)) || (step === 2 && (isNaN(pctNum) || pct === '')) || saving} onClick={() => { if (step === 1) setStep(2); else if (step === 2) buildPreview(); else confirmUpdate() }} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            {step === 3 ? (saving ? '更新中...' : '確認更新') : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Products Page
// ============================================================
export default function ProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [marketMap, setMarketMap] = useState<Record<string, MarketPriceRow[]>>({})
  const [marketRefreshing, setMarketRefreshing] = useState<string | null>(null)
  const [batchMarket, setBatchMarket] = useState<{ done: number; total: number } | null>(null)
  const [form, setForm] = useState({
    category_id: null as string | null,
    brand: '', product_name: '', model: '', unit: '台',
    list_price: 0, cost_price: 0, stock_qty: 0, notes: '', is_active: true,
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [pRes, cRes, mRes] = await Promise.all([
      supabase.from('products').select('*').order('brand').order('product_name'),
      supabase.from('product_categories').select('*').order('main_category').order('sub_category'),
      supabase.from('market_prices').select('*'),
    ])
    setProducts(pRes.data ?? [])
    setCategories(cRes.data ?? [])
    const mm: Record<string, MarketPriceRow[]> = {}
    for (const r of (mRes.data ?? []) as MarketPriceRow[]) {
      if (!mm[r.product_id]) mm[r.product_id] = []
      mm[r.product_id].push(r)
    }
    setMarketMap(mm)
    setLoading(false)
  }

  function getCategoryLabel(catId: string | null) {
    if (!catId) return null
    const c = categories.find(c => c.id === catId)
    return c ? `${c.main_category} > ${c.sub_category}` : null
  }

  function startEdit(p?: Product) {
    if (p) {
      setForm({ category_id: p.category_id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit, list_price: p.list_price, cost_price: p.cost_price, stock_qty: p.stock_qty, notes: p.notes ?? '', is_active: p.is_active })
      setEditingId(p.id)
    } else {
      setForm({ category_id: null, brand: '', product_name: '', model: '', unit: '台', list_price: 0, cost_price: 0, stock_qty: 0, notes: '', is_active: true })
      setEditingId('new')
    }
  }

  async function handleSave() {
    if (!form.product_name.trim()) return
    if (editingId === 'new') {
      await supabase.from('products').insert(form)
    } else {
      await supabase.from('products').update(form).eq('id', editingId)
    }
    setEditingId(null)
    fetchAll()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此產品？')) return
    await supabase.from('products').delete().eq('id', id)
    fetchAll()
  }

  // 查詢單一產品三平台行情並寫入快取
  async function refreshMarket(p: Product): Promise<void> {
    const q = [p.brand, p.model || p.product_name].filter(Boolean).join(' ').trim()
    if (!q) return
    setMarketRefreshing(p.id)
    try {
      const res = await fetch(`/api/market-prices?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      const rows: MarketPriceRow[] = (data.platforms ?? []).map((pf: any) => ({
        product_id: p.id,
        platform: pf.key,
        min_price: pf.min,
        mid_price: pf.mid,
        max_price: pf.max,
        result_count: pf.count ?? 0,
        search_url: pf.searchUrl ?? null,
        ok: !!pf.ok && pf.min != null,
        fetched_at: new Date().toISOString(),
      }))
      if (rows.length > 0) {
        await supabase.from('market_prices').upsert(rows, { onConflict: 'product_id,platform' })
        setMarketMap(m => ({ ...m, [p.id]: rows }))
      }
    } catch { /* 查詢失敗保留舊快取 */ }
    setMarketRefreshing(null)
  }

  // 批次查行情（目前篩選結果，逐一查詢避免被平台封鎖）
  async function batchRefreshMarket() {
    const targets = filtered.filter(p => p.is_active)
    if (targets.length === 0) return
    if (!confirm(`將依目前篩選逐一查詢 ${targets.length} 項產品的三平台行情，約需 ${Math.ceil(targets.length * 2 / 60)} 分鐘，確定？`)) return
    setBatchMarket({ done: 0, total: targets.length })
    for (let i = 0; i < targets.length; i++) {
      await refreshMarket(targets[i])
      setBatchMarket({ done: i + 1, total: targets.length })
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 1500))
    }
    setTimeout(() => setBatchMarket(null), 3000)
  }

  const mainCats = [...new Set(categories.map(c => c.main_category))]

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (p.model?.toLowerCase() ?? '').includes(search.toLowerCase())
    if (!matchSearch) return false
    if (!catFilter) return true
    const cat = categories.find(c => c.id === p.category_id)
    return cat?.main_category === catFilter
  })

  const categoryGrouped = categories.reduce<Record<string, ProductCategory[]>>((acc, c) => {
    if (!acc[c.main_category]) acc[c.main_category] = []
    acc[c.main_category].push(c)
    return acc
  }, {})

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {showBatchModal && <BatchPriceModal onClose={() => setShowBatchModal(false)} onDone={() => { setShowBatchModal(false); fetchAll() }} />}
      {showCatModal && <CategoryManagerModal onClose={() => setShowCatModal(false)} onDone={() => fetchAll()} />}
      {historyProduct && <InquiryHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />}

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">產品管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 筆</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCatModal(true)} className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium">
            <Tag size={15} /> 管理分類
          </button>
          <button onClick={() => setShowBatchModal(true)} className="flex items-center gap-2 border border-blue-200 text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-xl text-sm font-medium">
            <TrendingUp size={15} /> 批次調價
          </button>
          <button onClick={batchRefreshMarket} disabled={batchMarket != null} className="flex items-center gap-2 border border-orange-200 text-orange-600 hover:bg-orange-50 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
            <RefreshCw size={15} className={batchMarket ? 'animate-spin' : ''} />
            {batchMarket ? `查詢中 ${batchMarket.done}/${batchMarket.total}` : '批次查行情'}
          </button>
          <button onClick={() => startEdit()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增產品
          </button>
        </div>
      </div>

      {/* 搜尋 + 分類篩選 */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋產品名稱、品牌、型號..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {mainCats.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setCatFilter('')} className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${!catFilter ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>全部</button>
            {mainCats.map(m => (
              <button key={m} onClick={() => setCatFilter(catFilter === m ? '' : m)} className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${catFilter === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>{m}</button>
            ))}
          </div>
        )}
      </div>

      {/* 編輯 / 新增表單 */}
      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5 space-y-4">
          <div className="font-semibold text-blue-900">{editingId === 'new' ? '新增產品' : '編輯產品'}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2 sm:col-span-3">
              <label className="text-xs text-gray-600 mb-1 block">產品分類</label>
              <div className="flex gap-2">
                <select value={form.category_id ?? ''} onChange={e => setForm(p => ({ ...p, category_id: e.target.value || null }))} className={inputClass + ' flex-1'}>
                  <option value="">— 未分類 —</option>
                  {Object.entries(categoryGrouped).map(([main, cats]) => (
                    <optgroup key={main} label={main}>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.sub_category}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button type="button" onClick={() => setShowCatModal(true)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                  + 新增分類
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block">品牌</label>
              <input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} className={inputClass} placeholder="Yamaha" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">產品名稱 *</label>
              <input value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} className={inputClass} placeholder="專業混音器" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">規格型號</label>
              <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} className={inputClass} placeholder="MGP32X" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">單位</label>
              <input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">庫存（唯讀）</label>
              <input type="number" value={form.stock_qty} readOnly className={inputClass + ' bg-gray-100 cursor-default'} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">定價（售價）</label>
              <input type="number" value={form.list_price} onChange={e => setForm(p => ({ ...p, list_price: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">進貨價（成本）</label>
              <input type="number" value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">利潤率</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">
                {form.list_price > 0 ? `${Math.round((1 - form.cost_price / form.list_price) * 100)}%` : '—'}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-xs text-gray-600 mb-1 block">備註</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
              <label htmlFor="is_active" className="text-sm text-gray-700">上架（可在報價單選用）</label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
          </div>
        </div>
      )}

      {/* 產品列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-3 py-3 text-gray-600 font-medium">分類</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">品牌</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">產品名稱</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">型號</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">定價</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">成本</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">利潤率</th>
                <th className="text-right px-3 py-3 text-gray-600 font-medium">市場行情</th>
                <th className="text-center px-3 py-3 text-gray-600 font-medium">庫存</th>
                <th className="text-center px-3 py-3 text-gray-600 font-medium">狀態</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">沒有產品，請先新增</td></tr>
              ) : (
                filtered.map(p => {
                  const catLabel = getCategoryLabel(p.category_id)
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-3">
                        {catLabel
                          ? <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full whitespace-nowrap">{catLabel}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.brand ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.product_name}</td>
                      <td className="px-4 py-3 text-gray-500">{p.model ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(p.list_price)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(p.cost_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-semibold ${p.list_price > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {p.list_price > 0 ? `${Math.round((1 - p.cost_price / p.list_price) * 100)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="flex items-start justify-end gap-1">
                          <div className="text-[11px] leading-4 text-right">
                            {(marketMap[p.id]?.length ?? 0) > 0 ? (
                              <>
                                {(['shopee', 'pchome', 'momo'] as const).map(k => {
                                  const r = marketMap[p.id]?.find(x => x.platform === k)
                                  if (!r) return null
                                  return (
                                    <div key={k}>
                                      <a href={r.search_url ?? '#'} target="_blank" rel="noreferrer"
                                        className={r.ok && r.mid_price != null ? 'text-gray-600 hover:text-blue-600' : 'text-gray-300'}
                                        title={r.ok && r.min_price != null ? `${PLATFORM_LABELS[k]}：${Number(r.min_price).toLocaleString()} ~ ${Number(r.max_price).toLocaleString()}（${r.result_count} 筆）` : `${PLATFORM_LABELS[k]}：無資料，點擊手動查看`}>
                                        {PLATFORM_LABELS[k]} {r.ok && r.mid_price != null ? Number(r.mid_price).toLocaleString() : '—'}
                                      </a>
                                    </div>
                                  )
                                })}
                                <div className="text-gray-300">{marketMap[p.id][0].fetched_at.slice(5, 10).replace('-', '/')} 查</div>
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                          <button onClick={() => refreshMarket(p)} disabled={marketRefreshing === p.id || batchMarket != null} title="更新三平台行情"
                            className="p-1 text-gray-300 hover:text-orange-600 disabled:opacity-50 shrink-0">
                            <RefreshCw size={12} className={marketRefreshing === p.id ? 'animate-spin' : ''} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{p.stock_qty}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.is_active ? '上架' : '下架'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setHistoryProduct(p)} title="詢價紀錄" className="p-1.5 text-gray-400 hover:text-violet-600 rounded-lg"><MessageSquareQuote size={14} /></button>
                          <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
