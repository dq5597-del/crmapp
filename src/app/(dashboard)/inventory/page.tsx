'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Product, InventoryTransaction, InventoryTransactionType } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, Plus, Package, ArrowDown, ArrowUp, RotateCcw, Undo2, Pencil, ScanLine, X, Trash2 } from 'lucide-react'
import BarcodeScannerModal from '@/components/products/BarcodeScannerModal'

const TRANS_TYPES: InventoryTransactionType[] = ['入庫', '出庫', '盤盈', '盤虧', '退貨入庫', '供應商退貨出庫', '報廢']

const TYPE_STYLES: Record<string, { color: string; icon: typeof ArrowDown; sign: string }> = {
  '入庫':        { color: 'text-green-700 bg-green-50',  icon: ArrowDown,    sign: '+' },
  '出庫':        { color: 'text-red-700 bg-red-50',     icon: ArrowUp,      sign: '-' },
  '盤盈':        { color: 'text-blue-700 bg-blue-50',   icon: ArrowDown,    sign: '+' },
  '盤虧':        { color: 'text-orange-700 bg-orange-50', icon: ArrowUp,    sign: '-' },
  '退貨入庫':     { color: 'text-purple-700 bg-purple-50', icon: ArrowDown, sign: '+' },
  '供應商退貨出庫': { color: 'text-amber-700 bg-amber-50', icon: ArrowUp,    sign: '-' },
  '報廢':        { color: 'text-gray-700 bg-gray-100',  icon: ArrowUp,      sign: '-' },
}

export default function InventoryPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'stock' | 'transactions'>('stock')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    product_id: '',
    type: '入庫' as InventoryTransactionType,
    quantity: 1,
    unit_cost: 0,
    vendor_id: '',
    reference_no: '',
    notes: '',
  })

  // ── 掃碼盤點 ──
  type CountRow = { product_id: string; name: string; model: string; book: number; actual: number }
  const [countOpen, setCountOpen] = useState(false)
  const [countRows, setCountRows] = useState<CountRow[]>([])
  const [scanCode, setScanCode] = useState('')
  const [countCamera, setCountCamera] = useState(false)
  const [countApplying, setCountApplying] = useState(false)
  const [countMsg, setCountMsg] = useState('')

  function addCountByCode(codeRaw: string) {
    const code = codeRaw.trim()
    if (!code) return
    const p = products.find(x =>
      ((x as any).barcode ?? '') === code ||
      (x.model ?? '').toUpperCase() === code.toUpperCase()
    )
    if (!p) { setCountMsg(`找不到條碼／型號「${code}」的產品`); return }
    setCountMsg('')
    setCountRows(prev => {
      if (prev.some(r => r.product_id === p.id)) return prev  // 已在清單
      return [...prev, { product_id: p.id, name: p.product_name, model: p.model ?? '', book: Number(p.stock_qty) || 0, actual: Number(p.stock_qty) || 0 }]
    })
    setScanCode('')
  }

  function addCountByProduct(pid: string) {
    const p = products.find(x => x.id === pid)
    if (!p) return
    setCountRows(prev => prev.some(r => r.product_id === p.id) ? prev
      : [...prev, { product_id: p.id, name: p.product_name, model: p.model ?? '', book: Number(p.stock_qty) || 0, actual: Number(p.stock_qty) || 0 }])
  }

  async function applyCount() {
    const diffs = countRows.filter(r => r.actual !== r.book)
    if (diffs.length === 0) { alert('沒有差異需要調整'); return }
    if (!confirm(`共 ${diffs.length} 項有差異，確認建立盤盈／盤虧異動？`)) return
    setCountApplying(true)
    const dateTag = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('inventory_transactions').insert(
      diffs.map(r => ({
        product_id: r.product_id,
        type: r.actual > r.book ? '盤盈' : '盤虧',
        quantity: r.actual - r.book,
        reference_no: `盤點-${dateTag}`,
        notes: `盤點調整：帳面 ${r.book} → 實際 ${r.actual}`,
      }))
    )
    setCountApplying(false)
    if (error) { alert('盤點套用失敗：' + error.message); return }
    alert(`盤點完成，已調整 ${diffs.length} 項庫存。`)
    setCountOpen(false)
    setCountRows([])
    await Promise.all([fetchProducts(), fetchTransactions()])
  }

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('product_name'),
      supabase.from('inventory_transactions').select('*, products(product_name, model, unit), vendors(company_name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('vendors').select('id, company_name').eq('is_active', true).order('company_name'),
    ]).then(([pRes, tRes, vRes]) => {
      setProducts(pRes.data ?? [])
      setTransactions(tRes.data ?? [])
      setVendors(vRes.data ?? [])
      setLoading(false)
    })
  }, [])

  async function fetchTransactions() {
    const { data } = await supabase
      .from('inventory_transactions')
      .select('*, products(product_name, model, unit), vendors(company_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setTransactions(data ?? [])
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('product_name')
    setProducts(data ?? [])
  }

  /** 沖銷：庫存由 trigger 依異動自動計算，所以「刪除」不會還原庫存。
   *  正確作法是開一筆反向異動（審計軌跡完整、庫存自動修正）。 */
  const REVERSE_TYPE: Record<string, string> = {
    '入庫': '出庫', '出庫': '入庫',
    '盤盈': '盤虧', '盤虧': '盤盈',
    '退貨入庫': '出庫', '報廢': '入庫',
  }

  async function handleReverse(t: any) {
    const rtype = REVERSE_TYPE[t.type] ?? (Number(t.quantity) > 0 ? '出庫' : '入庫')
    if (!confirm(`沖銷這筆「${t.type} ${t.quantity}」？\n系統會建立一筆反向異動（${rtype}），庫存自動修正，原紀錄保留。`)) return
    const { error } = await supabase.from('inventory_transactions').insert({
      product_id: t.product_id,
      type: rtype,
      quantity: -Number(t.quantity),
      unit_cost: t.unit_cost ?? null,
      vendor_id: t.vendor_id ?? null,
      reference_no: t.reference_no ?? null,
      notes: `沖銷：${new Date(t.created_at).toLocaleDateString('zh-TW')} 的「${t.type}」${t.notes ? '（原備註：' + t.notes + '）' : ''}`,
    })
    if (error) { alert('沖銷失敗：' + error.message); return }
    await Promise.all([fetchProducts(), fetchTransactions()])
  }

  async function handleEditNote(t: any) {
    const note = prompt('修改備註／單據號（不影響庫存數量）', t.notes ?? '')
    if (note === null) return
    const { error } = await supabase.from('inventory_transactions').update({ notes: note }).eq('id', t.id)
    if (error) { alert('修改失敗：' + error.message); return }
    await fetchTransactions()
  }

  async function handleSaveTransaction() {
    if (!form.product_id) { alert('請選擇產品'); return }
    if (form.quantity <= 0) { alert('數量必須大於 0'); return }

    setSaving(true)
    // quantity：出庫/盤虧/供應商退貨出庫/報廢為負數
    const isNegative = ['出庫', '盤虧', '供應商退貨出庫', '報廢'].includes(form.type)
    const qty = isNegative ? -Math.abs(form.quantity) : Math.abs(form.quantity)

    await supabase.from('inventory_transactions').insert({
      product_id: form.product_id,
      type: form.type,
      quantity: qty,
      unit_cost: form.unit_cost || null,
      vendor_id: form.vendor_id || null,
      reference_no: form.reference_no || null,
      notes: form.notes || null,
    })

    setShowForm(false)
    setForm({ product_id: '', type: '入庫', quantity: 1, unit_cost: 0, vendor_id: '', reference_no: '', notes: '' })
    await Promise.all([fetchProducts(), fetchTransactions()])
    setSaving(false)
  }

  const filteredProducts = products.filter(p =>
    p.product_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (p.model?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  const filteredTrans = transactions.filter(t =>
    (t.products?.product_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (t.reference_no?.includes(search) ?? false)
  )

  const totalProducts = products.length
  const lowStockCount = products.filter(p => p.stock_qty <= 2 && p.stock_qty > 0).length
  const zeroStockCount = products.filter(p => p.stock_qty <= 0).length

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">庫存管理</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCountOpen(true); setCountRows([]); setCountMsg('') }} className="flex items-center gap-2 border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 px-4 py-2.5 rounded-xl text-sm font-medium">
            <ScanLine size={16} /> 掃碼盤點
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus size={16} /> 庫存異動
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-blue-50 rounded-2xl p-4">
          <div className="text-2xl font-bold text-blue-700">{totalProducts}</div>
          <div className="text-sm text-gray-600 mt-0.5">產品項目</div>
        </div>
        <div className="bg-yellow-50 rounded-2xl p-4">
          <div className="text-2xl font-bold text-yellow-700">{lowStockCount}</div>
          <div className="text-sm text-gray-600 mt-0.5">庫存偏低（≤2）</div>
        </div>
        <div className="bg-red-50 rounded-2xl p-4">
          <div className="text-2xl font-bold text-red-700">{zeroStockCount}</div>
          <div className="text-sm text-gray-600 mt-0.5">零庫存</div>
        </div>
      </div>

      {/* 庫存異動表單 */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5 space-y-4">
          <div className="font-semibold text-blue-900">新增庫存異動</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">產品 *</label>
              <select value={form.product_id} onChange={e => setForm(p => ({ ...p, product_id: e.target.value }))} className={inputClass}>
                <option value="">請選擇產品</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.product_name} {p.model ? `(${p.model})` : ''} — 現有庫存：{p.stock_qty} {p.unit}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">異動類型</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as InventoryTransactionType }))} className={inputClass}>
                {TRANS_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">數量 *</label>
              <input type="number" min="0" step="0.01" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">單位成本（選填）</label>
              <input type="number" min="0" value={form.unit_cost} onChange={e => setForm(p => ({ ...p, unit_cost: Number(e.target.value) }))} className={inputClass} />
            </div>
            {(form.type === '入庫' || form.type === '退貨入庫' || form.type === '供應商退貨出庫') && (
              <div>
                <label className="text-xs text-gray-600 mb-1 block">廠商（選填）</label>
                <select value={form.vendor_id} onChange={e => setForm(p => ({ ...p, vendor_id: e.target.value }))} className={inputClass}>
                  <option value="">不選廠商</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 mb-1 block">關聯單號（選填）</label>
              <input value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))} className={inputClass} placeholder="PO-260101-001" />
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs text-gray-600 mb-1 block">備註</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
            </div>
          </div>

          {/* 預覽 */}
          {form.product_id && (
            <div className="bg-white rounded-xl px-4 py-3 text-sm">
              {(() => {
                const p = products.find(p => p.id === form.product_id)
                if (!p) return null
                const isNeg = ['出庫', '盤虧', '供應商退貨出庫', '報廢'].includes(form.type)
                const after = p.stock_qty + (isNeg ? -form.quantity : form.quantity)
                return (
                  <span className="text-gray-600">
                    {p.product_name} 庫存：<strong>{p.stock_qty}</strong> → <strong className={after < 0 ? 'text-red-600' : 'text-green-700'}>{after}</strong> {p.unit}
                    {after < 0 && <span className="text-red-500 ml-2">⚠️ 庫存不足！</span>}
                  </span>
                )
              })()}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSaveTransaction} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? '儲存中...' : '確認異動'}
            </button>
          </div>
        </div>
      )}

      {/* 搜尋 + Tab */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋產品名稱、型號..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setActiveTab('stock')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'stock' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}>庫存總覽</button>
          <button onClick={() => setActiveTab('transactions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'transactions' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}>異動紀錄</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : activeTab === 'stock' ? (
        /* 庫存總覽 */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">品牌</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">產品名稱</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">型號</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">庫存</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">單位</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">定價</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">庫存價值</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">無符合產品</td></tr>
                ) : (
                  filteredProducts.map(p => {
                    const stockValue = p.stock_qty * (p.cost_price || p.list_price)
                    const isLow = p.stock_qty > 0 && p.stock_qty <= 2
                    const isZero = p.stock_qty <= 0
                    return (
                      <tr key={p.id} className={`border-b border-gray-50 ${isZero ? 'bg-red-50' : isLow ? 'bg-yellow-50' : ''} hover:bg-blue-50 transition-colors`}>
                        <td className="px-4 py-3 text-gray-500">{p.brand ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.product_name}</td>
                        <td className="px-4 py-3 text-gray-500">{p.model ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold text-base ${isZero ? 'text-red-600' : isLow ? 'text-yellow-700' : 'text-gray-900'}`}>
                            {p.stock_qty}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{p.unit}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(p.list_price)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(stockValue)}</td>
                        <td className="px-4 py-3 text-center">
                          {isZero ? (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">零庫存</span>
                          ) : isLow ? (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">偏低</span>
                          ) : (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">正常</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={6} className="px-4 py-3 font-semibold text-gray-700 text-sm">庫存總值</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {formatCurrency(filteredProducts.reduce((sum, p) => sum + p.stock_qty * (p.cost_price || p.list_price), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* 異動紀錄 */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">產品</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">類型</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">數量</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">前</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">後</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">廠商/備註</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrans.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">無異動紀錄</td></tr>
                ) : (
                  filteredTrans.map(t => {
                    const style = TYPE_STYLES[t.type]
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{t.products?.product_name}</div>
                          {t.products?.model && <div className="text-xs text-gray-400">{t.products.model}</div>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-lg font-medium ${style.color}`}>{t.type}</span>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${t.quantity > 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {t.quantity > 0 ? '+' : ''}{t.quantity} {t.products?.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{t.quantity_before}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{t.quantity_after}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {t.vendors?.company_name && <div>{t.vendors.company_name}</div>}
                          {t.reference_no && <div className="text-blue-600">{t.reference_no}</div>}
                          {t.notes && <div>{t.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleEditNote(t)} title="修改備註（不影響庫存）"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Pencil size={14} /></button>
                            <button onClick={() => handleReverse(t)} title="沖銷（建立反向異動，庫存自動修正）"
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"><Undo2 size={14} /></button>
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
      )}

      {/* 掃碼盤點 Modal */}
      {countOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
              <h3 className="font-semibold text-gray-900">掃碼盤點</h3>
              <button onClick={() => setCountOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-3 shrink-0">
              <div className="flex gap-2">
                <input
                  value={scanCode}
                  onChange={e => setScanCode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCountByCode(scanCode) }}
                  placeholder="掃描槍掃條碼，或輸入條碼／型號後按 Enter"
                  autoFocus
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button onClick={() => setCountCamera(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-teal-200 bg-teal-50 text-teal-700 rounded-lg text-sm font-medium hover:bg-teal-100 whitespace-nowrap">
                  <ScanLine size={15} /> 相機掃描
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <select onChange={e => { if (e.target.value) { addCountByProduct(e.target.value); e.target.value = '' } }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" defaultValue="">
                  <option value="">— 或直接挑選產品加入盤點 —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.product_name}{p.model ? `（${p.model}）` : ''}　帳面 {p.stock_qty}</option>)}
                </select>
              </div>
              {countMsg && <p className="text-xs text-red-600">{countMsg}</p>}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100">
              {countRows.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">尚未加入盤點品項——掃條碼或挑選產品</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs text-gray-500">產品</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500 w-20">帳面</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500 w-28">實際</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500 w-20">差異</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {countRows.map((r, i) => {
                      const diff = r.actual - r.book
                      return (
                        <tr key={r.product_id} className="border-b border-gray-50">
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900 text-[13px]">{r.name}</div>
                            {r.model && <div className="text-[11px] text-gray-400">{r.model}</div>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{r.book}</td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} value={r.actual}
                              onFocus={e => e.target.select()}
                              onChange={e => setCountRows(prev => prev.map((x, j) => j !== i ? x : { ...x, actual: Number(e.target.value) || 0 }))}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500" />
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${diff > 0 ? 'text-blue-600' : diff < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => setCountRows(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 shrink-0">
              <span className="text-xs text-gray-500">
                共 {countRows.length} 項，{countRows.filter(r => r.actual !== r.book).length} 項有差異
              </span>
              <div className="flex gap-2">
                <button onClick={() => setCountOpen(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
                <button onClick={applyCount} disabled={countApplying || countRows.length === 0}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
                  {countApplying ? '套用中…' : '套用盤點（自動盤盈虧）'}
                </button>
              </div>
            </div>
          </div>

          {countCamera && (
            <BarcodeScannerModal
              onDetected={text => { addCountByCode(text); setCountCamera(false) }}
              onClose={() => setCountCamera(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
