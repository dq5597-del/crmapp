'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { Product, Vendor } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Pencil, Trash2, Package, TrendingUp, ChevronRight, X, Tag, MessageSquareQuote, RefreshCw, Copy, Globe, ExternalLink, CheckCircle2, Upload, FileUp, ScanLine, Printer, ListChecks, ImagePlus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import ProductImportModal from '@/components/products/ProductImportModal'
import BarcodePreview from '@/components/products/BarcodePreview'
import BarcodeScannerModal from '@/components/products/BarcodeScannerModal'
import BarcodeLabelModal from '@/components/products/BarcodeLabelModal'
import { knownBrandLogoUrl } from '@/lib/brand-logos'
import { driveImageUrl } from '@/lib/drive-url'
import { useDirtyGuard } from '@/lib/useDirtyGuard'
import { CATALOG_DRIVE_ROOT, encodeWebsiteCategory, parseWebsiteCategory, websiteCategoryLeaf } from '@/lib/catalog-drive'

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
function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function HtmlCodeEditor({ value, onChange, rows = 8, placeholder, allowWordPressImages = false }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; allowWordPressImages?: boolean }) {
  const [mode, setMode] = useState<'code' | 'preview'>('code')
  const [uploadingImages, setUploadingImages] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  async function insertWordPressImages(files: File[]) {
    if (!files.length) return
    const imageFiles = files.filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(file.name))
    if (imageFiles.length !== files.length) {
      alert('只能選擇 JPG、PNG、WebP 或 GIF 圖片')
    }
    if (!imageFiles.length) return
    const selectionStart = textareaRef.current?.selectionStart ?? value.length
    const selectionEnd = textareaRef.current?.selectionEnd ?? selectionStart
    setUploadingImages(true)
    try {
      const snippets: string[] = []
      for (const file of imageFiles) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('alt_text', file.name.replace(/\.[^.]+$/, ''))
        const res = await fetch('/api/wordpress/media', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `${file.name} 上傳失敗`)
        const alt = escapeHtmlAttribute(data.alt_text || file.name.replace(/\.[^.]+$/, ''))
        const imageUrl = escapeHtmlAttribute(data.url)
        snippets.push(`<figure class="wp-block-image size-large"><img src="${imageUrl}" alt="${alt}" loading="lazy"></figure>`)
      }

      const inserted = `${snippets.join('\n')}\n`
      onChange(value.slice(0, selectionStart) + inserted + value.slice(selectionEnd))
      setMode('code')
      requestAnimationFrame(() => {
        const nextPosition = selectionStart + inserted.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(nextPosition, nextPosition)
      })
    } catch (error: any) {
      alert('介紹圖片上傳失敗：' + (error?.message ?? '未知錯誤'))
    } finally {
      setUploadingImages(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 bg-gray-50 border-b border-gray-200 px-2 py-1.5">
        <button type="button" onClick={() => setMode('code')} className={`px-2.5 py-1 rounded text-xs font-medium ${mode === 'code' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>程式碼</button>
        <button type="button" onClick={() => setMode('preview')} className={`px-2.5 py-1 rounded text-xs font-medium ${mode === 'preview' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>預覽</button>
        {allowWordPressImages && (
          <>
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImages} className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-50">
              {uploadingImages ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {uploadingImages ? '上傳至 WordPress 中…' : '插入圖片（WordPress 媒體庫）'}
            </button>
            <input ref={imageInputRef} type="file" multiple className="hidden" onChange={e => insertWordPressImages(Array.from(e.target.files ?? []))} />
          </>
        )}
      </div>
      {mode === 'code' ? (
        <textarea ref={textareaRef} value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="w-full px-3 py-2 text-xs font-mono outline-none resize-y" />
      ) : (
        <div className="p-3 text-sm min-h-[100px] [&_table]:border [&_table]:border-collapse [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_p]:mb-2 [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: value || '<span class="text-gray-300">尚無內容</span>' }} />
      )}
    </div>
  )
}

export default function ProductsPage() {
  const { permOf } = usePermissions()
  const perm = permOf('products')

  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  // 品牌篩選（2026-07 新增）：品牌清單自現有產品歸納，A-Z 簡碼快速定位
  const [brandFilter, setBrandFilter] = useState('')
  const [brandLetter, setBrandLetter] = useState('')
  const [showBrandDropdown, setShowBrandDropdown] = useState(false)
  // 分頁（2026-07）：產品數已破七百筆，一次全渲染會拖慢整頁操作
  const PER_PAGE = 10
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const editFormRef = useRef<HTMLDivElement>(null)
  // 未存檔提醒
  const guard = useDirtyGuard()
  // 彈跳視窗開啟時：鎖定背景捲動 + 按 ESC 關閉（點背景不關，避免誤觸掉資料）
  useEffect(() => {
    if (editingId === null) return
    guard.markClean() // 每次開啟視窗重置修改狀態
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') guard.guardClose(() => setEditingId(null)) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // 欄位顯示設定（產品名稱與操作固定顯示，其餘可自選）
  const COLUMN_DEFS: { key: string; label: string }[] = [
    { key: 'cat', label: '分類' }, { key: 'brand', label: '品牌' }, { key: 'model', label: '型號' },
    { key: 'price', label: '定價' }, { key: 'cost', label: '成本' }, { key: 'margin', label: '利潤率' },
    { key: 'market', label: '市場行情' }, { key: 'stock', label: '庫存' }, { key: 'web', label: '官網' }, { key: 'status', label: '狀態' },
  ]
  const [cols, setCols] = useState<Record<string, boolean>>(() => {
    const def = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, true]))
    if (typeof window !== 'undefined') {
      try { const s = JSON.parse(localStorage.getItem('product-cols-v1') || 'null'); if (s) return { ...def, ...s } } catch { /* ignore */ }
    }
    return def
  })
  const [showColMenu, setShowColMenu] = useState(false)
  function toggleCol(k: string) {
    setCols(prev => {
      const next = { ...prev, [k]: !prev[k] }
      try { localStorage.setItem('product-cols-v1', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [marketMap, setMarketMap] = useState<Record<string, MarketPriceRow[]>>({})
  const [marketRefreshing, setMarketRefreshing] = useState<string | null>(null)
  const [batchMarket, setBatchMarket] = useState<{ done: number; total: number } | null>(null)
  const [inventoryMainCategory, setInventoryMainCategory] = useState('')
  const [webMainCategory, setWebMainCategory] = useState('')
  const [webCategoryInput, setWebCategoryInput] = useState('')
    const [form, setForm] = useState({
        category_id: null as string | null,
        brand: '', product_name: '', model: '', unit: '台', barcode: '', product_code: '', safe_stock: 0,
        list_price: 0, cost_price: 0, stock_qty: 0, notes: '', is_active: true,
        width_cm: 0, depth_cm: 0, height_cm: 0,
        web_sku: '', web_category: '', web_categories: [] as string[], web_description: '',
        web_main_image_url: '', web_sale_price: 0, web_allow_backorder: false,
        web_bsmi_no: '', web_ncc_no: '', web_publish: false,
        web_product_id: '', web_product_url: '',
        web_promo_price: 0, web_promo_price_from: '', web_promo_price_to: '',
        web_tab: 'none' as string,
        web_spec_html: '' as string,
    })
    const [formMode, setFormMode] = useState<'simple' | 'full'>('simple')
    const [showScanner, setShowScanner] = useState(false)
    const [showLabelPrint, setShowLabelPrint] = useState(false)
    const [showCodeLabel, setShowCodeLabel] = useState(false)
    const [codeLoading, setCodeLoading] = useState(false)

    /** 依目前選定分類向 DB 取下一個料號（GH-大類碼-流水） */
    async function genProductCode() {
        setCodeLoading(true)
        const { data, error } = await supabase.rpc('next_product_code', { p_category_id: form.category_id })
        setCodeLoading(false)
        if (error) { alert('產生料號失敗：' + error.message + '\n\n請先執行 sql/product_code.sql'); return }
        if (data) setForm(p => ({ ...p, product_code: data as string }))
    }
    const [promoEnabled, setPromoEnabled] = useState(false)
    const [activeTab, setActiveTab] = useState<'intro' | 'spec' | 'downloads' | 'shop' | 'review'>('intro')
    const [webExpanded, setWebExpanded] = useState(false)
    const [defaultWebExpanded, setDefaultWebExpanded] = useState(false)
    const [webImages, setWebImages] = useState<{ id?: string; image_url: string }[]>([])
    const [webFeatures, setWebFeatures] = useState<{ id?: string; feature_text: string }[]>([])
    const [webDownloads, setWebDownloads] = useState<{ id?: string; file_name: string; file_url: string }[]>([])
    const [downloadUploading, setDownloadUploading] = useState<number | null>(null)
    const [webVendors, setWebVendors] = useState<{ id?: string; vendor_id: string; cost: number | null; is_primary: boolean }[]>([])
    const [vendorList, setVendorList] = useState<Vendor[]>([])

    useEffect(() => { fetchAll() }, [])

    useEffect(() => {
        supabase.from('system_settings').select('product_web_fields_expanded').maybeSingle().then(({ data }) => {
            const v = !!(data as any)?.product_web_fields_expanded
            setDefaultWebExpanded(v)
            setWebExpanded(v)
        })
    }, [])

    useEffect(() => {
        supabase.from('vendors').select('*').eq('is_active', true).order('company_name').then(({ data }) => {
            setVendorList((data ?? []) as Vendor[])
        })
    }, [])

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

    async function loadWebSubData(productId: string) {
        const [imgRes, dlRes, featRes, vendRes] = await Promise.all([
            supabase.from('product_images').select('id,image_url').eq('product_id', productId).order('sort_order'),
            supabase.from('product_downloads').select('id,file_name,file_url').eq('product_id', productId).order('sort_order'),
            supabase.from('product_features').select('id,feature_text').eq('product_id', productId).order('sort_order'),
            supabase.from('product_vendors').select('id,vendor_id,cost,is_primary').eq('product_id', productId).order('sort_order'),
        ])
        setWebImages(imgRes.data ?? [])
        setWebDownloads(dlRes.data ?? [])
        setWebFeatures(featRes.data ?? [])
        setWebVendors(vendRes.data ?? [])
    }

    function startEdit(p?: Product) {
        if (p) {
            const pAny = p as any
            const inventoryCategory = categories.find(category => category.id === p.category_id)
            setInventoryMainCategory(inventoryCategory?.main_category ?? '')
            setForm({
                category_id: p.category_id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit, barcode: pAny.barcode ?? '', product_code: pAny.product_code ?? '', safe_stock: pAny.safe_stock ?? 0,
                list_price: p.list_price, cost_price: p.cost_price, stock_qty: p.stock_qty, notes: p.notes ?? '', is_active: p.is_active,
                width_cm: pAny.width_cm ?? 0, depth_cm: pAny.depth_cm ?? 0, height_cm: pAny.height_cm ?? 0,
                web_sku: pAny.web_sku ?? '', web_category: pAny.web_category ?? '',
                web_categories: Array.isArray(pAny.web_categories) && pAny.web_categories.length > 0
                    ? pAny.web_categories.filter((value: unknown): value is string => typeof value === 'string' && !!value.trim())
                    : (pAny.web_category?.trim() ? [pAny.web_category.trim()] : []),
                web_description: pAny.web_description ?? '',
                web_main_image_url: pAny.web_main_image_url ?? '', web_sale_price: pAny.web_sale_price ?? 0,
                web_allow_backorder: pAny.web_allow_backorder ?? false, web_bsmi_no: pAny.web_bsmi_no ?? '',
                web_ncc_no: pAny.web_ncc_no ?? '', web_publish: pAny.web_publish ?? false,
                web_product_id: pAny.web_product_id ?? '', web_product_url: pAny.web_product_url ?? '',
                web_promo_price: pAny.web_promo_price ?? 0,
                web_promo_price_from: pAny.web_promo_price_from ? String(pAny.web_promo_price_from).slice(0, 16) : '',
                web_promo_price_to: pAny.web_promo_price_to ? String(pAny.web_promo_price_to).slice(0, 16) : '',
                web_tab: pAny.web_tab ?? 'none',
                web_spec_html: pAny.web_spec_html ?? '',
            })
            setPromoEnabled(!!pAny.web_promo_price_from)
            setEditingId(p.id)
            loadWebSubData(p.id)
        } else {
            setInventoryMainCategory('')
            setForm({
                category_id: null, brand: '', product_name: '', model: '', unit: '台', barcode: '', product_code: '', safe_stock: 0,
                list_price: 0, cost_price: 0, stock_qty: 0, notes: '', is_active: true,
        width_cm: 0, depth_cm: 0, height_cm: 0,
                web_sku: '', web_category: '', web_categories: [], web_description: '',
                web_main_image_url: '', web_sale_price: 0, web_allow_backorder: false,
                web_bsmi_no: '', web_ncc_no: '', web_publish: false,
                web_product_id: '', web_product_url: '',
                web_promo_price: 0, web_promo_price_from: '', web_promo_price_to: '',
                web_tab: 'none',
                web_spec_html: '',
            })
            setPromoEnabled(false)
            setEditingId('new')
            setWebImages([])
            setWebDownloads([])
            setWebFeatures([])
            setWebVendors([])
        }
        setWebMainCategory('')
        setWebCategoryInput('')
        setWebExpanded(defaultWebExpanded)
        setFormMode('simple')
        setActiveTab('intro')
    }

    async function syncWebSubData(productId: string) {
        await Promise.all([
            supabase.from('product_images').delete().eq('product_id', productId),
            supabase.from('product_downloads').delete().eq('product_id', productId),
            supabase.from('product_features').delete().eq('product_id', productId),
            supabase.from('product_vendors').delete().eq('product_id', productId),
        ])
        const imgRows = webImages.filter(r => r.image_url.trim()).map((r, i) => ({ product_id: productId, image_url: r.image_url.trim(), sort_order: i }))
        const dlRows = webDownloads.filter(r => r.file_name.trim() && r.file_url.trim()).map((r, i) => ({ product_id: productId, file_name: r.file_name.trim(), file_url: r.file_url.trim(), sort_order: i }))
        const featRows = webFeatures.filter(r => r.feature_text.trim()).slice(0, 10).map((r, i) => ({ product_id: productId, feature_text: r.feature_text.trim().slice(0, 5), sort_order: i }))
        const vendRows = webVendors.filter(r => r.vendor_id).map((r, i) => ({ product_id: productId, vendor_id: r.vendor_id, cost: r.cost, is_primary: r.is_primary, sort_order: i }))
        await Promise.all([
            imgRows.length > 0 ? supabase.from('product_images').insert(imgRows) : Promise.resolve(),
            dlRows.length > 0 ? supabase.from('product_downloads').insert(dlRows) : Promise.resolve(),
            featRows.length > 0 ? supabase.from('product_features').insert(featRows) : Promise.resolve(),
            vendRows.length > 0 ? supabase.from('product_vendors').insert(vendRows) : Promise.resolve(),
        ])
    }


    async function handleSave() {
        if (!form.product_name.trim()) return
        // 型號不可重複（不分大小寫；排除自己）
        const modelVal = (form.model ?? '').trim().toUpperCase()
        if (modelVal) {
            const dup = products.find(pr => ((pr.model ?? '') as string).trim().toUpperCase() === modelVal && pr.id !== editingId)
            if (dup) {
                alert(`型號「${form.model}」已被產品「${dup.product_name}」使用，型號不可重複，請改用其他型號。`)
                return
            }
        }
        const payload = {
            ...form,
            // web_category 保留第一個分類，讓尚未更新的舊流程仍能讀取；新流程使用 web_categories。
            web_category: form.web_categories[0] ? websiteCategoryLeaf(form.web_categories[0]) : null,
            // 空字串會撞到料號的唯一索引（'' 不算 null），一律轉 null
            product_code: form.product_code.trim() || null,
            web_promo_price: promoEnabled ? form.web_promo_price : null,
            web_promo_price_from: promoEnabled && form.web_promo_price_from ? form.web_promo_price_from : null,
            web_promo_price_to: promoEnabled && form.web_promo_price_to ? form.web_promo_price_to : null,
        }
        if (editingId === 'new') {
            const { data, error } = await supabase.from('products').insert(payload).select('id').single()
            if (error) {
                console.error('新增產品失敗：', error)
                alert(`儲存失敗，產品分類/其他欄位未更新：\n${error.message}`)
                return
            }
            if (data?.id) await syncWebSubData(data.id)
        } else {
            const { error } = await supabase.from('products').update(payload).eq('id', editingId)
            if (error) {
                console.error('更新產品失敗：', error)
                alert(`儲存失敗，產品分類/其他欄位未更新：\n${error.message}`)
                return
            }
            await syncWebSubData(editingId as string)
        }
        let catalogWarning = ''
        try {
            await organizeCatalogDownloads()
        } catch (error: any) {
            catalogWarning = error?.message ?? 'Google Drive 型錄分類失敗'
        }
        setEditingId(null)
        fetchAll()
        if (catalogWarning) alert(`產品已儲存，但型錄資料夾整理失敗：\n${catalogWarning}`)
    }


  async function handleDelete(id: string) {
    if (!confirm('確定刪除此產品？')) return
    await supabase.from('products').delete().eq('id', id)
    fetchAll()
  }

  // ── 產品圖片一律上傳到 WordPress 媒體庫 ──
  const [imgUploading, setImgUploading] = useState<string | null>(null)
  // ── 點小圖放大預覽（燈箱）──
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  async function uploadImage(file: File, key: string): Promise<string | null> {
    if (!(file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(file.name))) {
      alert('只能選擇 JPG、PNG、WebP 或 GIF 圖片')
      return null
    }
    setImgUploading(key)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('alt_text', file.name.replace(/\.[^.]+$/, ''))
      const res = await fetch('/api/wordpress/media', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '上傳失敗')
      return data.url ?? null
    } catch (e: any) {
      alert('圖片上傳失敗：' + e.message)
      return null
    } finally {
      setImgUploading(null)
    }
  }

  async function uploadProductDownload(file: File, index: number) {
    if (file.size > 4 * 1024 * 1024) {
      alert('單一檔案不可超過 4MB；較大的檔案請先上傳到 Google Drive，將權限設為「知道連結的人」，再貼上共用連結。')
      return
    }
    setDownloadUploading(index)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', CATALOG_DRIVE_ROOT)
      fd.append('folder_paths', JSON.stringify(getCatalogFolderPaths()))
      fd.append('public', '1')
      const res = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '上傳失敗')
      if (!data.public_url) throw new Error('Google Drive 沒有回傳公開下載連結')
      setWebDownloads(current => current.map((row, rowIndex) => rowIndex === index
        ? { ...row, file_name: row.file_name.trim() || data.file_name || file.name, file_url: data.public_url }
        : row))
    } catch (error: any) {
      alert('產品資料上傳失敗：' + (error?.message ?? '未知錯誤'))
    } finally {
      setDownloadUploading(null)
    }
  }

  async function organizeCatalogDownloads() {
    const downloads = webDownloads.filter(row => row.file_name.trim() && row.file_url.trim())
    if (downloads.length === 0) return

    const res = await fetch('/api/drive/catalog-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloads, folder_paths: getCatalogFolderPaths() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Google Drive 型錄分類失敗')
  }

  // ── 官網（av-shop.com）同步 ──
  const [pushing, setPushing] = useState<string | null>(null)
  const [pushSel, setPushSel] = useState<string[]>([])
  const [pushResult, setPushResult] = useState<any>(null)

  async function pushToWeb(ids: string[]) {
    if (!ids.length) return
    setPushing(ids.length === 1 ? ids[0] : 'batch')
    try {
      const res = await fetch('/api/woocommerce/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: ids, publish: false }),   // 一律先存草稿
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? '推送失敗'); return }
      setPushResult(data)
      setPushSel([])
      await fetchAll()
    } catch (e: any) {
      alert('推送失敗：' + (e.message ?? ''))
    } finally {
      setPushing(null)
    }
  }

  /** 複製產品：整列複製，型號加後綴避免撞唯一鍵，庫存歸零，複製後直接開啟編輯 */
  async function handleCopyProduct(src: any) {
    const clone: any = { ...src }
    delete clone.id
    delete clone.created_at
    delete clone.updated_at
    clone.product_name = `${clone.product_name ?? ''}（複製）`
    if (clone.model) clone.model = `${clone.model}-COPY`
    clone.stock_qty = 0
    // 料號與原廠條碼是一物一碼，不可複製 —— 留空由使用者重新產生
    clone.product_code = null
    clone.barcode = null
    const { data, error } = await supabase.from('products').insert(clone).select('*').single()
    if (error) {
      alert(/duplicate|unique/i.test(error.message)
        ? '型號重複，請先修改來源型號或稍後手動調整。'
        : '複製失敗：' + error.message)
      return
    }
    await fetchAll()
    if (data) startEdit(data as any)   // 直接進編輯，改型號與名稱
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

  // 品牌清單：自產品歸納、去重（大小寫視為同一品牌）、A-Z 排序
  const allBrands = (() => {
    const seen = new Map<string, string>()
    for (const p of products) {
      const b = (p.brand ?? '').trim()
      if (b && !seen.has(b.toLowerCase())) seen.set(b.toLowerCase(), b)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  })()
  const brandLetters = [...new Set(allBrands.map(b => {
    const c = b[0].toUpperCase()
    return /[A-Z]/.test(c) ? c : '#'
  }))].sort()
  const shownBrands = brandLetter
    ? allBrands.filter(b => {
        const c = b[0].toUpperCase()
        return brandLetter === '#' ? !/[A-Z]/.test(c) : c === brandLetter
      })
    : allBrands

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (p.model?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      ((p as any).product_code?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      ((p as any).barcode?.toLowerCase() ?? '').includes(search.toLowerCase())
    if (!matchSearch) return false
    if (brandFilter && (p.brand ?? '').trim().toLowerCase() !== brandFilter.toLowerCase()) return false
    if (!catFilter) return true
    const cat = categories.find(c => c.id === p.category_id)
    return cat?.main_category === catFilter
  })

  // 分頁切片；篩選條件一變就回到第 1 頁，避免停在不存在的頁碼
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)
  useEffect(() => { setPage(1) }, [search, catFilter, brandFilter, brandLetter])

  const categoryGrouped = categories.reduce<Record<string, ProductCategory[]>>((acc, c) => {
    if (!acc[c.main_category]) acc[c.main_category] = []
    acc[c.main_category].push(c)
    return acc
  }, {})

  function getCatalogFolderPaths(): string[][] {
    const paths: string[][] = []
    const brandFolder = form.brand.trim() || '未設定品牌'
    for (const selectedCategory of form.web_categories) {
      const { mainCategory: selectedMainCategory, subCategory: selectedSubCategory } = parseWebsiteCategory(selectedCategory)
      const matches = categories.filter(category =>
        category.sub_category.trim().toLocaleLowerCase() === selectedSubCategory.trim().toLocaleLowerCase()
        && (!selectedMainCategory || category.main_category.trim().toLocaleLowerCase() === selectedMainCategory.toLocaleLowerCase())
      )
      if (matches.length === 0) {
        paths.push([CATALOG_DRIVE_ROOT, selectedMainCategory || '其他分類', selectedSubCategory.trim(), brandFolder])
        continue
      }
      for (const category of matches) {
        paths.push([CATALOG_DRIVE_ROOT, category.main_category.trim(), category.sub_category.trim(), brandFolder])
      }
    }

    if (paths.length === 0) return [[CATALOG_DRIVE_ROOT, '未分類', '未分類', brandFolder]]
    return Array.from(new Map(paths.map(path => [JSON.stringify(path), path])).values())
  }

  function addWebCategory() {
    const subCategory = webCategoryInput.trim()
    const mainCategory = webMainCategory.trim()
    if (!mainCategory || !subCategory) return
    const value = encodeWebsiteCategory(mainCategory, subCategory)
    setForm(current => current.web_categories.some(category => category.toLocaleLowerCase() === value.toLocaleLowerCase())
      ? current
      : { ...current, web_categories: [...current.web_categories, value] })
    setWebCategoryInput('')
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      {showBatchModal && <BatchPriceModal onClose={() => setShowBatchModal(false)} onDone={() => { setShowBatchModal(false); fetchAll() }} />}
      {showCatModal && <CategoryManagerModal onClose={() => setShowCatModal(false)} onDone={() => fetchAll()} />}
      {historyProduct && <InquiryHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />}
      {showImportModal && <ProductImportModal products={products} onClose={() => setShowImportModal(false)} onDone={() => fetchAll()} />}

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">產品資料</h1>
            <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 筆</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <button onClick={() => setShowColMenu(v => !v)} className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium">
              <ListChecks size={15} /> 欄位
            </button>
            {showColMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowColMenu(false)} />
                <div className="absolute right-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-44">
                  <div className="px-2 py-1 text-[11px] text-gray-400">顯示欄位</div>
                  {COLUMN_DEFS.map(c => (
                    <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={!!cols[c.key]} onChange={() => toggleCol(c.key)} className="accent-blue-600 w-4 h-4" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
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
          {perm.can_edit && (
            <button onClick={() => pushToWeb(filtered.filter((x: any) => x.web_publish).map((x: any) => x.id))}
              disabled={pushing != null}
              title="把所有勾選「上架」的產品推到官網（存為草稿）"
              className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              <Globe size={16} className={pushing === "batch" ? "animate-spin" : ""} />
              {pushing === "batch" ? "推送中…" : "批次推送官網"}
            </button>
          )}
          {perm.can_create && (
            <button onClick={() => setShowImportModal(true)}
              title="從 Excel / CSV 批次匯入產品"
              className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2.5 rounded-xl text-sm font-medium">
              <FileUp size={16} /> 匯入產品
            </button>
          )}
          {perm.can_create && <button onClick={() => startEdit()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增產品
          </button>}
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
        {/* 品牌篩選列：A-Z 簡碼定位 + 品牌膠囊（2026-07 新增） */}
        {allBrands.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex gap-1 flex-wrap items-center">
              <span className="text-[11px] text-gray-400 mr-1">品牌</span>
              <button onClick={() => { setBrandLetter(''); setBrandFilter('') }}
                className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${!brandLetter && !brandFilter ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>全部</button>
              {brandLetters.map(L => (
                <button key={L} onClick={() => setBrandLetter(brandLetter === L ? '' : L)}
                  className={`w-6 py-0.5 rounded text-[11px] border font-mono transition-colors ${brandLetter === L ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>{L}</button>
              ))}
            </div>
            {(brandLetter || brandFilter) && (
              <div className="flex gap-1.5 flex-wrap">
                {shownBrands.map(b => (
                  <button key={b} onClick={() => setBrandFilter(brandFilter === b ? '' : b)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${brandFilter === b ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-600 hover:border-emerald-400'}`}>
                    {b}
                  </button>
                ))}
                {shownBrands.length === 0 && <span className="text-xs text-gray-300">此字母沒有品牌</span>}
              </div>
            )}
          </div>
        )}
      </div>

                {/* 編輯 / 新增表單 — 彈跳視窗（2026-07 改版：原地彈出，不再捲到頁面頂端） */}
                {editingId !== null && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-6">
                    <div ref={editFormRef} {...guard.formProps} className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3.5 border-b border-gray-100 shrink-0">
                            <div className="font-semibold text-blue-900">{editingId === 'new' ? '新增產品' : '編輯產品'}</div>
                            <div className="flex items-center gap-2">
                                <div className="flex bg-gray-50 rounded-lg p-0.5 border border-gray-200">
                                    <button type="button" onClick={() => setFormMode('simple')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${formMode === 'simple' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>進銷存模式</button>
                                    <button type="button" onClick={() => setFormMode('full')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${formMode === 'full' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>官網產品模式</button>
                                </div>
                                <button type="button" onClick={() => guard.guardClose(() => setEditingId(null))} title="關閉" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X size={18} /></button>
                            </div>
                        </div>
                        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1 min-h-0">

                        {formMode === 'simple' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <div className="col-span-2 sm:col-span-3">
                                    <label className="text-xs text-gray-600 mb-1 block">進銷存分類</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                                        <select
                                            value={inventoryMainCategory}
                                            onChange={e => {
                                                setInventoryMainCategory(e.target.value)
                                                setForm(p => ({ ...p, category_id: null }))
                                            }}
                                            className={inputClass}
                                        >
                                            <option value="">先選大類</option>
                                            {Object.keys(categoryGrouped).map(main => <option key={main} value={main}>{main}</option>)}
                                        </select>
                                        <select
                                            value={form.category_id ?? ''}
                                            onChange={e => setForm(p => ({ ...p, category_id: e.target.value || null }))}
                                            disabled={!inventoryMainCategory}
                                            className={inputClass + ' disabled:bg-gray-50 disabled:text-gray-400'}
                                        >
                                            <option value="">{inventoryMainCategory ? '再選小類' : '請先選大類'}</option>
                                            {(categoryGrouped[inventoryMainCategory] ?? []).map(c => <option key={c.id} value={c.id}>{c.sub_category}</option>)}
                                        </select>
                                        <button type="button" onClick={() => setShowCatModal(true)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                                            + 新增分類
                                        </button>
                                    </div>
                                </div>

                                <div className="relative">
                                    <label className="text-xs text-gray-600 mb-1 block">品牌</label>
                                    <input value={form.brand}
                                        onChange={e => { setForm(p => ({ ...p, brand: e.target.value.toUpperCase() })); setShowBrandDropdown(true) }}
                                        onFocus={() => setShowBrandDropdown(true)}
                                        onBlur={() => setTimeout(() => {
                                            setShowBrandDropdown(false)
                                            // 大小寫視為同一品牌：與現有品牌只差大小寫時自動改用現有寫法
                                            setForm(p => {
                                                const canonical = allBrands.find(b => b.toLowerCase() === (p.brand ?? '').trim().toLowerCase())
                                                return canonical && canonical !== p.brand ? { ...p, brand: canonical } : p
                                            })
                                        }, 150)}
                                        className={inputClass} placeholder="輸入 A-Z 開頭快速搜尋，例：Y" autoComplete="off" />
                                    {showBrandDropdown && (() => {
                                        const q = (form.brand ?? '').trim().toLowerCase()
                                        const hits = allBrands.filter(b => !q || b.toLowerCase().startsWith(q)).slice(0, 12)
                                        const exact = allBrands.some(b => b.toLowerCase() === q)
                                        if (hits.length === 0 && (!q || exact)) return null
                                        return (
                                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto">
                                                {hits.map(b => (
                                                    <button key={b} type="button" onMouseDown={() => { setForm(p => ({ ...p, brand: b })); setShowBrandDropdown(false) }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">{b}</button>
                                                ))}
                                                {q && !exact && (
                                                    <button type="button" onMouseDown={() => setShowBrandDropdown(false)}
                                                        className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-gray-100">
                                                        ＋ 新增品牌「{form.brand}」
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-xs text-gray-600 mb-1 block">產品名稱 *</label>
                                    <input value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} className={inputClass} placeholder="專業混音器" />
                                    {(form.brand || form.model || form.product_name) && (
                                        <div className="text-xs text-gray-500 mt-1">網路產品名稱：{form.brand && <span className="text-blue-600 font-medium">【{form.brand}】</span>}{form.model && <span className="text-gray-700">{form.model} </span>}<span className="text-gray-800">{form.product_name}</span></div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">規格型號</label>
                                    <input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value.toUpperCase() }))} className={inputClass} placeholder="MGP32X" />
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
                                    <label className="text-xs text-gray-600 mb-1 block">安全庫存量（低於警示）</label>
                                    <input type="number" min={0} value={form.safe_stock} onChange={e => setForm(p => ({ ...p, safe_stock: Number(e.target.value) }))} className={inputClass} />
                                </div>
                                <div className="col-span-2 sm:col-span-3">
                                    <label className="text-xs text-gray-600 mb-1 block">公司料號</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={form.product_code}
                                            onChange={e => setForm(p => ({ ...p, product_code: e.target.value.trim().toUpperCase() }))}
                                            className={inputClass + ' flex-1 font-mono'}
                                            placeholder="選好分類後按「自動產生」，或手動輸入"
                                        />
                                        <button type="button" onClick={genProductCode} disabled={codeLoading}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-40 whitespace-nowrap">
                                            <RefreshCw size={15} className={codeLoading ? 'animate-spin' : ''} /> 自動產生
                                        </button>
                                        <button type="button" onClick={() => setShowCodeLabel(true)} disabled={!form.product_code.trim()}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap">
                                            <Printer size={15} /> 列印料號標籤
                                        </button>
                                    </div>
                                    <div className="text-[11px] text-gray-400 mt-1">
                                        格式 GH-大類碼-流水號（例：GH-ENV-0001）。盤點掃這組碼；一經建立不建議更動。
                                    </div>
                                    {showCodeLabel && (
                                        <BarcodeLabelModal
                                            value={form.product_code}
                                            name={(form.brand ? `【${form.brand}】` : '') + form.product_name}
                                            model={form.model}
                                            onClose={() => setShowCodeLabel(false)}
                                        />
                                    )}
                                </div>
                                <div className="col-span-2 sm:col-span-3">
                                    <label className="text-xs text-gray-600 mb-1 block">原廠條碼（EAN-13 / UPC，選填，可掃描）</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={form.barcode}
                                            onChange={e => setForm(p => ({ ...p, barcode: e.target.value.trim() }))}
                                            className={inputClass + ' flex-1'}
                                            placeholder="輸入或掃描一般國際條碼，例：4712345678901"
                                            inputMode="numeric"
                                        />
                                        <button type="button" onClick={() => setShowScanner(true)}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 whitespace-nowrap">
                                            <ScanLine size={15} /> 掃描
                                        </button>
                                        <button type="button" onClick={() => setShowLabelPrint(true)} disabled={!form.barcode.trim()}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap">
                                            <Printer size={15} /> 列印條碼
                                        </button>
                                    </div>
                                    {form.barcode.trim() && (
                                        <div className="mt-2">
                                            <BarcodePreview value={form.barcode} />
                                            <div className="text-[11px] text-gray-400 mt-1">13 碼→EAN-13、8 碼→EAN-8，其餘自動用 Code128。按「列印條碼」可設定張數批次列印。</div>
                                        </div>
                                    )}
                                    {showLabelPrint && (
                                        <BarcodeLabelModal
                                            value={form.barcode}
                                            name={(form.brand ? `【${form.brand}】` : '') + form.product_name}
                                            model={form.model}
                                            onClose={() => setShowLabelPrint(false)}
                                        />
                                    )}
                                </div>
                                {showScanner && (
                                    <BarcodeScannerModal
                                        onDetected={text => { setForm(p => ({ ...p, barcode: text.trim() })); setShowScanner(false) }}
                                        onClose={() => setShowScanner(false)}
                                    />
                                )}
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">定價（售價）</label>
                                    <input type="number" value={form.list_price} onChange={e => setForm(p => ({ ...p, list_price: Number(e.target.value) }))} className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">進貨價（成本）</label>
                                    {perm.can_cost ? (
                                      <input type="number" value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: Number(e.target.value) }))} className={inputClass} />
                                    ) : (
                                      <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-400">＊＊＊＊（無權限查看）</div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">利潤率</label>
                                    <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">
                                        {form.list_price > 0 ? `${Math.round((1 - form.cost_price / form.list_price) * 100)}%` : '—'}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">寬 W (cm)</label>
                                    <input type="number" value={form.width_cm} onChange={e => setForm(p => ({ ...p, width_cm: Number(e.target.value) }))} className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">深 D (cm)</label>
                                    <input type="number" value={form.depth_cm} onChange={e => setForm(p => ({ ...p, depth_cm: Number(e.target.value) }))} className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-600 mb-1 block">高 H (cm)</label>
                                    <input type="number" value={form.height_cm} onChange={e => setForm(p => ({ ...p, height_cm: Number(e.target.value) }))} className={inputClass} />
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
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl px-4 py-3 border border-gray-100 text-xs">
                                    <span className="text-gray-400">進銷存資料</span>
                                    <span className="text-gray-600">型號 <b className="font-medium text-gray-800">{form.model || '—'}</b></span>
                                    <span className="text-gray-600">單位 <b className="font-medium text-gray-800">{form.unit}</b></span>
                                    <span className="text-gray-600">庫存 <b className="font-medium text-gray-800">{form.stock_qty}</b></span>
                                    {form.web_product_url ? (
                                        <a href={form.web_product_url} target="_blank" rel="noreferrer"
                                           className="flex items-center gap-1 text-emerald-700 hover:underline"
                                           title={`官網商品 ID：${form.web_product_id || '—'}`}>
                                            <ExternalLink size={12} /> 官網商品頁 <span className="text-gray-400 max-w-[260px] truncate hidden sm:inline">{form.web_product_url.replace(/^https?:\/\//, '')}</span>
                                        </a>
                                    ) : (
                                        <span className="text-gray-300">尚未推送官網</span>
                                    )}
                                    <label className="ml-auto flex items-center gap-1.5 text-gray-600">
                                        <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="accent-blue-600 w-3.5 h-3.5" />
                                        上架
                                    </label>
                                    <button type="button" onClick={() => setFormMode('simple')} className="text-blue-600 hover:underline">編輯進銷存欄位</button>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                                    <div className="text-xs text-gray-400 mb-3">{getCategoryLabel(form.category_id) ?? '未分類'}</div>
                                    <div className="grid grid-cols-1 md:grid-cols-[190px_1fr] gap-5 mb-4">
                                        <div>
                                            <div className="aspect-square bg-gray-50 rounded-xl flex items-center justify-center mb-2 overflow-hidden">
                                                {form.web_main_image_url ? <img src={driveImageUrl(form.web_main_image_url)} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setPreviewUrl(driveImageUrl(form.web_main_image_url, 1600))} /> : <Package size={28} className="text-gray-300" />}
                                            </div>
                                            {previewUrl && (
                                                <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setPreviewUrl(null)}>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={previewUrl} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" />
                                                    <button type="button" className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setPreviewUrl(null)}><X size={28} /></button>
                                                </div>
                                            )}
                                            <div className="space-y-1.5 mb-3">
                                                {webImages.map((img, i) => (
                                                    <div key={img.id ?? `new-${i}`} className="flex gap-1 items-center">
                                                        {img.image_url.trim() && (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={driveImageUrl(img.image_url, 100)} alt="" className="w-7 h-7 rounded object-cover bg-gray-50 border border-gray-100 shrink-0 cursor-zoom-in" onClick={() => setPreviewUrl(driveImageUrl(img.image_url, 1600))} onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
                                                        )}
                                                        <input value={img.image_url} readOnly aria-label="WordPress 媒體網址" className={inputClass + ' text-xs py-1.5 bg-gray-50'} />
                                                        <button type="button" onClick={() => setWebImages(a => a.filter((_, ri) => ri !== i))} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                                                    </div>
                                                ))}
                                                <div className="flex items-center gap-3">
                                                  <label className="text-xs text-emerald-700 hover:underline cursor-pointer flex items-center gap-1">
                                                    <Upload size={12} />
                                                    {imgUploading === 'gallery' ? '上傳至 WordPress 中…' : '上傳至 WordPress 媒體庫'}
                                                    <input type="file" multiple className="hidden" disabled={imgUploading != null}
                                                      onChange={async e => {
                                                        const files = [...(e.target.files ?? [])]
                                                        for (const f of files) {
                                                          const url = await uploadImage(f, 'gallery')
                                                          if (url) setWebImages(a => [...a, { image_url: url }])
                                                        }
                                                        e.target.value = ''
                                                      }} />
                                                  </label>
                                                </div>
                                            </div>

                                            <div className="border border-blue-200 rounded-lg p-2 bg-blue-50/50">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-medium text-blue-700">產品特色（限5字）</span>
                                                    <span className="text-[10px] text-gray-400">{webFeatures.length}/10</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {webFeatures.map((f, i) => (
                                                        <div key={f.id ?? `new-${i}`} className="flex items-center gap-0.5 bg-white border border-gray-200 rounded px-1.5 py-1">
                                                            <input value={f.feature_text} maxLength={5} onChange={e => setWebFeatures(a => a.map((r, ri) => ri === i ? { ...r, feature_text: e.target.value.slice(0, 5) } : r))} className="w-full text-[11px] text-center outline-none" />
                                                            <button type="button" onClick={() => setWebFeatures(a => a.filter((_, ri) => ri !== i))} className="text-gray-300 hover:text-red-500 shrink-0"><X size={10} /></button>
                                                        </div>
                                                    ))}
                                                    {webFeatures.length < 10 && (
                                                        <button type="button" onClick={() => setWebFeatures(a => [...a, { feature_text: '' }])} className="border border-dashed border-gray-300 rounded px-1.5 py-1 text-[11px] text-gray-400 hover:text-blue-500 hover:border-blue-300">+ 新增</button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {getCategoryLabel(form.category_id) && <span className="text-[11px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full">{getCategoryLabel(form.category_id)}</span>}
                                                {form.brand && <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">品牌：{form.brand}</span>}
                                            </div>
                                            <label className="text-xs text-gray-600 mb-1 block">網路產品名稱</label>
                                            <div className={inputClass + ' text-base font-medium mb-3 bg-gray-50 flex flex-wrap items-center gap-1'}>
                                                {form.brand && <span className="text-blue-600 font-semibold">【{form.brand}】</span>}
                                                {form.model && <span className="text-gray-700">{form.model}</span>}
                                                {form.product_name
                                                    ? <span className="text-gray-900">{form.product_name}</span>
                                                    : <span className="text-gray-400 font-normal text-sm">請於「進銷存模式」填寫品牌／型號／產品名稱</span>}
                                            </div>

                                            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/40 mb-3">
                                                <label className="text-xs font-medium text-blue-700 mb-1.5 block">官網分類（可多選）</label>
                                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                                                    <select
                                                        value={webMainCategory}
                                                        onChange={e => {
                                                            setWebMainCategory(e.target.value)
                                                            setWebCategoryInput('')
                                                        }}
                                                        className={inputClass}
                                                        aria-label="官網分類大類"
                                                    >
                                                        <option value="">先選擇大類</option>
                                                        {mainCats.map(main => <option key={main} value={main}>{main}</option>)}
                                                    </select>
                                                    <select
                                                        value={webCategoryInput}
                                                        onChange={e => setWebCategoryInput(e.target.value)}
                                                        className={inputClass}
                                                        aria-label="官網分類小類"
                                                        disabled={!webMainCategory}
                                                    >
                                                        <option value="">{webMainCategory ? '再選擇小類' : '請先選擇大類'}</option>
                                                        {(categoryGrouped[webMainCategory] ?? []).map(category => (
                                                            <option key={category.id} value={category.sub_category}>{category.sub_category}</option>
                                                        ))}
                                                    </select>
                                                    <button type="button" onClick={addWebCategory} disabled={!webCategoryInput} className="px-3 py-2 border border-blue-200 bg-white rounded-lg text-xs text-blue-700 hover:bg-blue-50 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">加入</button>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 mt-2 min-h-6">
                                                    {form.web_categories.length === 0 && <span className="text-[11px] text-gray-400">尚未選擇官網分類，可加入多個分類</span>}
                                                    {form.web_categories.map(category => (
                                                        <span key={category} className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-100 px-2.5 py-1 text-xs text-blue-700">
                                                            {category}
                                                            <button
                                                                type="button"
                                                                aria-label={`移除官網分類 ${category}`}
                                                                onClick={() => setForm(current => ({ ...current, web_categories: current.web_categories.filter(value => value !== category) }))}
                                                                className="text-blue-400 hover:text-blue-700"
                                                            ><X size={12} /></button>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-3 mb-1">
                                                <div>
                                                    <label className="text-[11px] text-gray-400 mb-1 block">網路價</label>
                                                    <input type="number" value={form.web_sale_price} onChange={e => setForm(p => ({ ...p, web_sale_price: Number(e.target.value) }))} className={inputClass + ' font-medium text-blue-600'} />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] text-gray-400 mb-1 block">建議售價</label>
                                                    <input type="number" value={form.list_price} readOnly className={inputClass + ' bg-gray-100 text-gray-400 line-through cursor-default'} />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] text-gray-400 mb-1 block">成本</label>
                                                    <input type="number" value={form.cost_price} readOnly className={inputClass + ' bg-gray-100 text-red-500 cursor-default'} />
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-gray-400 mb-3">建議售價／成本帶自進銷存欄位，成本不會顯示於官網</div>

                                            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50 mb-3">
                                                <label className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-2">
                                                    <input type="checkbox" checked={promoEnabled} onChange={e => setPromoEnabled(e.target.checked)} className="accent-blue-600 w-3.5 h-3.5" />
                                                    限時促銷
                                                </label>
                                                {promoEnabled && (
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 mb-1 block">促銷價</label>
                                                            <input type="number" value={form.web_promo_price} onChange={e => setForm(p => ({ ...p, web_promo_price: Number(e.target.value) }))} className={inputClass + ' text-xs font-medium text-red-600'} />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 mb-1 block">開始</label>
                                                            <input type="datetime-local" value={form.web_promo_price_from} onChange={e => setForm(p => ({ ...p, web_promo_price_from: e.target.value }))} className={inputClass + ' text-xs'} />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 mb-1 block">結束</label>
                                                            <input type="datetime-local" value={form.web_promo_price_to} onChange={e => setForm(p => ({ ...p, web_promo_price_to: e.target.value }))} className={inputClass + ' text-xs'} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border border-teal-200 rounded-lg p-3 bg-teal-50/50 mb-3">
                                                <div className="text-xs font-medium text-teal-700 mb-2">官網首頁區塊</div>
                                                <div className="flex items-center gap-4 text-xs text-gray-700">
                                                    {([['none', '無'], ['new', '最新商品'], ['hot', '熱銷商品']] as const).map(([v, l]) => (
                                                        <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                                            <input type="radio" name="web_tab" checked={form.web_tab === v} onChange={() => setForm(p => ({ ...p, web_tab: v }))} className="accent-teal-600 w-3.5 h-3.5" />
                                                            {l}
                                                        </label>
                                                    ))}
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1.5">「最新商品」上架滿 30 天官網自動轉「熱銷商品」；促銷區塊由限時促銷自動判斷，不需選擇</div>
                                            </div>

                                            <div className="border-t border-gray-100 pt-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs text-gray-500">可進貨廠商</span>
                                                    <span className="text-[11px] text-gray-400">{webVendors.length} 家</span>
                                                </div>
                                                <div className="space-y-1.5 mb-2">
                                                    {webVendors.map((v, i) => (
                                                        <div key={v.id ?? `new-${i}`} className="flex items-center gap-2 text-xs">
                                                            <button type="button" onClick={() => setWebVendors(a => a.map((r, ri) => ri === i ? { ...r, is_primary: !r.is_primary } : { ...r, is_primary: false }))}
                                                                className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap ${v.is_primary ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                                                {v.is_primary ? '主要' : '備用'}
                                                            </button>
                                                            <select value={v.vendor_id} onChange={e => setWebVendors(a => a.map((r, ri) => ri === i ? { ...r, vendor_id: e.target.value } : r))} className={inputClass + ' flex-1 text-xs py-1'}>
                                                                <option value="">選擇廠商</option>
                                                                {vendorList.map(vd => <option key={vd.id} value={vd.id}>{vd.company_name}</option>)}
                                                            </select>
                                                            <input type="number" placeholder="成本" value={v.cost ?? ''} onChange={e => setWebVendors(a => a.map((r, ri) => ri === i ? { ...r, cost: e.target.value ? Number(e.target.value) : null } : r))} className={inputClass + ' w-20 text-xs py-1'} />
                                                            <button type="button" onClick={() => setWebVendors(a => a.filter((_, ri) => ri !== i))} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setWebVendors(a => [...a, { vendor_id: '', cost: null, is_primary: a.length === 0 }])} className="text-xs text-blue-600 hover:underline">+ 新增供應商</button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-1 border-b border-gray-100 -mx-4 px-4 overflow-x-auto">
                                        {([['intro', '商品介紹'], ['spec', '詳細規格'], ['downloads', '產品資料下載'], ['shop', '購物說明'], ['review', '產品評價']] as const).map(([key, label]) => (
                                            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`px-4 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors ${activeTab === key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{label}</button>
                                        ))}
                                    </div>

                                    <div className="pt-4">
                                        {activeTab === 'intro' && (
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">完整商品介紹</label>
                                                <HtmlCodeEditor value={form.web_description} onChange={v => setForm(p => ({ ...p, web_description: v }))} rows={8} placeholder="可直接貼上 HTML，例如 <p>...</p>" allowWordPressImages />
                                                <div className="mt-1.5 text-[11px] text-gray-400">上傳圖片會自動等比例調整為 600 × 600 px，轉成 WebP，並存入 WordPress 媒體庫（單張 4MB 內）。</div>
                                            </div>
                                        )}
                                        {activeTab === 'spec' && (
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">產品規格（可直接貼上規格表 HTML）</label>
                                                <HtmlCodeEditor value={form.web_spec_html ?? ''} onChange={v => setForm(p => ({ ...p, web_spec_html: v }))} rows={10} placeholder={'<table class="shop_attributes">\n<tbody>\n<tr><th>品牌</th><td>...</td></tr>\n</tbody>\n</table>'} />
                                            </div>
                                        )}
                                        {activeTab === 'downloads' && (
                                            <div>
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <div>
                                                        <div className="text-xs font-medium text-gray-700">產品資料下載</div>
                                                        <div className="text-[11px] text-gray-400 mt-0.5">檔案會存入 Google Drive，並同步顯示在官網單一商品頁。</div>
                                                    </div>
                                                    <span className="text-[11px] text-gray-400 whitespace-nowrap">{webDownloads.length} 個檔案</span>
                                                </div>
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-3">
                                                    <div className="text-[11px] font-medium text-amber-800 mb-1">Google Drive 型錄分類位置</div>
                                                    <div className="space-y-0.5">
                                                        {getCatalogFolderPaths().map(path => (
                                                            <div key={path.join('\u0000')} className="text-[11px] text-amber-700">{path.join(' / ')}</div>
                                                        ))}
                                                    </div>
                                                    <div className="text-[10px] text-amber-600 mt-1">路徑依序為大類／小類／品牌。同一份型錄只占一份空間；其他分類會建立捷徑。貼上 Google Drive 連結後，儲存產品也會自動整理。</div>
                                                </div>
                                                <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-3 mb-2">支援 PDF、ZIP、Word、Excel、PowerPoint 等格式；單檔 4MB 內可直接上傳。</div>
                                                <div className="space-y-2 mb-3">
                                                    {webDownloads.map((dl, i) => (
                                                        <div key={dl.id ?? `new-${i}`} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto] gap-2 items-center">
                                                            <input value={dl.file_name} onChange={e => setWebDownloads(a => a.map((r, ri) => ri === i ? { ...r, file_name: e.target.value } : r))} placeholder="檔名（如：使用手冊）" className={inputClass + ' text-xs py-1.5'} />
                                                            <input value={dl.file_url} onChange={e => setWebDownloads(a => a.map((r, ri) => ri === i ? { ...r, file_url: e.target.value } : r))} placeholder="Google Drive 下載連結" className={inputClass + ' text-xs py-1.5'} />
                                                            <label className="inline-flex items-center justify-center gap-1 px-2.5 py-2 border border-blue-200 rounded-lg text-xs text-blue-700 hover:bg-blue-50 cursor-pointer whitespace-nowrap">
                                                                {downloadUploading === i ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
                                                                {downloadUploading === i ? '上傳中' : '上傳 Drive'}
                                                                <input
                                                                    type="file"
                                                                    className="hidden"
                                                                    disabled={downloadUploading != null}
                                                                    onChange={async e => {
                                                                        const file = e.target.files?.[0]
                                                                        if (file) await uploadProductDownload(file, i)
                                                                        e.target.value = ''
                                                                    }}
                                                                />
                                                            </label>
                                                            <button type="button" aria-label={`移除下載檔案 ${dl.file_name || i + 1}`} onClick={() => setWebDownloads(a => a.filter((_, ri) => ri !== i))} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setWebDownloads(a => [...a, { file_name: '', file_url: '' }])} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Plus size={12} /> 新增下載檔案</button>
                                            </div>
                                        )}
                                        {activeTab === 'shop' && (
                                            <div className="text-xs text-gray-500 leading-relaxed">
                                                【付款方式】信用卡刷卡、ATM 轉帳、ibon 超商繳費<br />
                                                【運送方式】宅配到府，商品享原廠一年保固
                                                <div className="text-[11px] text-gray-300 mt-2 italic">全站固定文案，非逐商品欄位</div>
                                            </div>
                                        )}
                                        {activeTab === 'review' && (
                                            <div className="text-xs text-gray-400 italic">網站訪客留言與星等，需另外對接資料源，目前僅為頁籤佔位</div>
                                        )}
                                    </div>
                                </div>

                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setWebExpanded(v => !v)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
                                    >
                                        <span>進階網站設定（SKU／主圖／認證字號）</span>
                                        <ChevronRight size={16} className={`text-gray-400 transition-transform ${webExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                    {webExpanded && (
                                        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-xs text-gray-600 mb-1 block">SKU</label>
                                                <input value={form.web_sku} onChange={e => setForm(p => ({ ...p, web_sku: e.target.value }))} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600 mb-1 block">主圖</label>
                                                <div className="flex gap-1">
                                                  <input value={form.web_main_image_url} readOnly aria-label="WordPress 主圖網址" className={inputClass + ' bg-gray-50'} placeholder="尚未上傳主圖" />
                                                  <label className="shrink-0 flex items-center gap-1 px-2.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer">
                                                    <Upload size={13} />
                                                    {imgUploading === 'main' ? '上傳至 WordPress 中…' : '上傳 WordPress'}
                                                    <input type="file" className="hidden" disabled={imgUploading != null}
                                                      onChange={async e => {
                                                        const f = e.target.files?.[0]; if (!f) return
                                                        const url = await uploadImage(f, 'main')
                                                        if (url) setForm(p => ({ ...p, web_main_image_url: url }))
                                                        e.target.value = ''
                                                      }} />
                                                  </label>
                                                </div>
                                                <div className="mt-1.5 text-[11px] text-gray-400">上傳圖片會自動等比例調整為 600 × 600 px，轉成 WebP，並存入 WordPress 媒體庫。</div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600 mb-1 block">BSMI 許可字號</label>
                                                <input value={form.web_bsmi_no} onChange={e => setForm(p => ({ ...p, web_bsmi_no: e.target.value }))} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600 mb-1 block">NCC 許可字號</label>
                                                <input value={form.web_ncc_no} onChange={e => setForm(p => ({ ...p, web_ncc_no: e.target.value }))} className={inputClass} />
                                            </div>
                                            <div className="flex items-center gap-2 pt-5">
                                                <input type="checkbox" id="web_allow_backorder" checked={form.web_allow_backorder} onChange={e => setForm(p => ({ ...p, web_allow_backorder: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
                                                <label htmlFor="web_allow_backorder" className="text-sm text-gray-700">允許無庫存下單</label>
                                            </div>
                                            <div className="flex items-center gap-2 pt-5">
                                                <input type="checkbox" id="web_publish" checked={form.web_publish} onChange={e => setForm(p => ({ ...p, web_publish: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
                                                <label htmlFor="web_publish" className="text-sm text-gray-700">顯示於網站</label>
                                            </div>
                                            {(form.web_product_id || form.web_product_url) && (
                                                <div className="col-span-2 sm:col-span-3 text-xs text-gray-400">
                                                    網站商品 ID：{form.web_product_id || '—'} 連結：{form.web_product_url || '—'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        </div>
                        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
                            <button onClick={() => guard.guardClose(() => setEditingId(null))} className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white">取消</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
                        </div>
                    </div>
                    </div>
                )}

      {/* 產品列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {cols.cat && <th className="text-left px-3 py-3 text-gray-600 font-medium">分類</th>}
                {cols.brand && <th className="text-left px-4 py-3 text-gray-600 font-medium">品牌</th>}
                <th className="text-left px-4 py-3 text-gray-600 font-medium">產品名稱</th>
                {cols.model && <th className="text-left px-4 py-3 text-gray-600 font-medium">型號</th>}
                {cols.price && <th className="text-right px-4 py-3 text-gray-600 font-medium">定價</th>}
                {cols.cost && <th className="text-right px-4 py-3 text-gray-600 font-medium">成本</th>}
                {cols.margin && <th className="text-right px-4 py-3 text-gray-600 font-medium">利潤率</th>}
                {cols.market && <th className="text-right px-3 py-3 text-gray-600 font-medium">市場行情</th>}
                {cols.stock && <th className="text-center px-3 py-3 text-gray-600 font-medium">庫存</th>}
                {cols.web && <th className="text-center px-3 py-3 text-gray-600 font-medium">官網</th>}
                {cols.status && <th className="text-center px-3 py-3 text-gray-600 font-medium">狀態</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">沒有產品，請先新增</td></tr>
              ) : (
                paged.map(p => {
                  const catLabel = getCategoryLabel(p.category_id)
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                      {cols.cat && <td className="px-3 py-3">
                        {catLabel
                          ? <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full whitespace-nowrap">{catLabel}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>}
                      {cols.brand && <td className="px-4 py-3 text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          {(() => {
                            const logo = knownBrandLogoUrl(p.brand)
                            // eslint-disable-next-line @next/next/no-img-element
                            return logo ? <img src={logo} alt="" className="h-4 w-auto max-w-[64px] object-contain" /> : null
                          })()}
                          {p.brand ?? '—'}
                        </span>
                      </td>}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.product_name}
                        {(p as any).product_code && (
                          <div className="text-[11px] font-mono text-gray-400 mt-0.5">{(p as any).product_code}</div>
                        )}
                      </td>
                      {cols.model && <td className="px-4 py-3 text-gray-500">{p.model ?? '—'}</td>}
                      {cols.price && <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(p.list_price)}</td>}
                      {cols.cost && <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(p.cost_price)}</td>}
                      {cols.margin && <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-semibold ${p.list_price > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {p.list_price > 0 ? `${Math.round((1 - p.cost_price / p.list_price) * 100)}%` : '—'}
                        </span>
                      </td>}
                      {cols.market && <td className="px-3 py-3 text-right whitespace-nowrap">
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
                      </td>}
                      {cols.stock && <td className="px-3 py-3 text-center">
                        <span className={
                          Number(p.stock_qty) <= 0 ? 'text-red-600 font-semibold'
                            : Number((p as any).safe_stock) > 0 && Number(p.stock_qty) < Number((p as any).safe_stock) ? 'text-orange-600 font-semibold'
                            : 'text-gray-700'
                        } title={Number((p as any).safe_stock) > 0 ? `安全庫存 ${(p as any).safe_stock}` : ''}>
                          {p.stock_qty}
                          {Number((p as any).safe_stock) > 0 && Number(p.stock_qty) < Number((p as any).safe_stock) && ' ⚠'}
                        </span>
                      </td>}
                      {cols.web && <td className="px-3 py-3 text-center">
                        {p.web_product_id ? (
                          <a href={p.web_product_url ?? "#"} target="_blank" rel="noreferrer"
                            title={`官網狀態：${p.web_sync_status ?? "—"}｜最後同步：${p.web_synced_at ? new Date(p.web_synced_at).toLocaleString("zh-TW") : "—"}`}
                            className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                            <CheckCircle2 size={12} /> {p.web_sync_status === "publish" ? "已發布" : "草稿"}
                            <ExternalLink size={10} />
                          </a>
                        ) : <span className="text-xs text-gray-300">未上架</span>}
                      </td>}
                      {cols.status && <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.is_active ? '上架' : '下架'}
                        </span>
                      </td>}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setHistoryProduct(p)} title="詢價紀錄" className="p-1.5 text-gray-400 hover:text-violet-600 rounded-lg"><MessageSquareQuote size={14} /></button>
                          {perm.can_edit && (
                            <button onClick={() => pushToWeb([p.id])} disabled={pushing != null}
                              title={p.web_product_id ? "更新官網商品" : "上架到官網（存為草稿）"}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg disabled:opacity-40">
                              <Globe size={14} className={pushing === p.id ? "animate-spin" : ""} />
                            </button>
                          )}
                          {perm.can_edit && <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={14} /></button>}
                          {perm.can_create && <button onClick={() => handleCopyProduct(p)} title="複製此產品（型號自動加 -COPY，庫存歸零）" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Copy size={14} /></button>}
                          {perm.can_delete && <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分頁列：一頁 10 筆 */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-gray-100">
            <div className="text-xs text-gray-500">
              顯示第 {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} 筆，共 {filtered.length} 筆
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)} disabled={safePage === 1}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
              >««</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
              >上一頁</button>

              {(() => {
                // 目前頁前後各兩頁，最多顯示 5 個頁碼
                const start = Math.max(1, Math.min(safePage - 2, totalPages - 4))
                const end = Math.min(totalPages, start + 4)
                const nums = []
                for (let i = start; i <= end; i++) nums.push(i)
                return nums.map(n => (
                  <button
                    key={n} onClick={() => setPage(n)}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      n === safePage
                        ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >{n}</button>
                ))
              })()}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
              >下一頁</button>
              <button
                onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
              >»»</button>
            </div>
          </div>
        )}
      </div>

      {/* 官網推送結果 */}
      {pushResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <Globe size={18} className="text-emerald-600" /> 官網推送結果
              </h3>
              <button onClick={() => setPushResult(null)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3">
                成功 <b className="text-green-700">{pushResult.ok}</b> 筆
                {pushResult.failed > 0 && <>、失敗 <b className="text-red-600">{pushResult.failed}</b> 筆</>}
                　（商品在官網為<b>草稿</b>，請到 wp-admin 檢查後發布）
              </p>
              <div className="space-y-1.5 text-sm">
                {pushResult.results?.map((r: any) => (
                  <div key={r.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg ${r.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className={r.ok ? 'text-green-700' : 'text-red-600'}>{r.ok ? '✓' : '✕'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900">{r.name}</div>
                      {r.ok ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                          {r.action}（商品 ID {r.wc_id}）→ 開啟官網商品頁
                        </a>
                      ) : (
                        <div className="text-xs text-red-600">{r.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end px-5 py-4 border-t">
              <button onClick={() => setPushResult(null)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
