'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Product, InventoryTransaction, InventoryTransactionType } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, Plus, Package, ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'

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
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} /> 庫存異動
        </button>
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
                </tr>
              </thead>
              <tbody>
                {filteredTrans.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">無異動紀錄</td></tr>
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
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
