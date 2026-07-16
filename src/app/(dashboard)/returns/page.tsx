'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, RotateCcw, Printer, Trash2 } from 'lucide-react'

const TYPE_OPTIONS = ['全部', '客戶退貨', '供應商退貨']
const STATUS_OPTIONS = ['全部', '待審核', '已入庫', '已結算', '作廢']
const REASON_OPTIONS = ['瑕疵', '規格不符', '多叫貨', '客訴', '到期報廢', '其他']
const SETTLEMENT_OPTIONS = ['沖抵帳款', '退款', '換貨']

const STATUS_COLORS: Record<string, string> = {
  '待審核': 'bg-gray-100 text-gray-600',
  '已入庫': 'bg-blue-100 text-blue-700',
  '已結算': 'bg-green-100 text-green-700',
  '作廢':   'bg-red-100 text-red-400',
}

const TYPE_COLORS: Record<string, string> = {
  '客戶退貨':   'bg-purple-100 text-purple-700',
  '供應商退貨': 'bg-amber-100 text-amber-700',
}

const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"

type ItemRow = {
  product_id: string
  product_name: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  item_condition: string
  reason: string
}

function ReturnsPageInner() {
  const supabase = createClient()

  async function handleDeleteReturn(id: string, no: string) {
    if (!confirm(`確定刪除退貨單「${no}」？品項會一併刪除，此操作無法復原。`)) return
    await supabase.from('return_items').delete().eq('return_id', id)
    const { error } = await supabase.from('returns').delete().eq('id', id)
    if (error) { alert('刪除失敗：' + error.message); return }
    location.reload()
  }
  const searchParams = useSearchParams()

  const [returns, setReturns] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('全部')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    return_type: '客戶退貨',
    ref_doc_id: '',
    client_id: '',
    vendor_id: '',
    return_date: new Date().toISOString().slice(0, 10),
    return_reason: '瑕疵',
    item_condition: '良品',
    settlement_method: '沖抵帳款',
    notes: '',
  })
  const [items, setItems] = useState<ItemRow[]>([])

  const fetchReturns = useCallback(async () => {
    const { data } = await supabase
      .from('returns')
      .select('*, clients(company_name), vendors(company_name), return_items(id)')
      .order('created_at', { ascending: false })
    setReturns(data ?? [])
  }, [supabase])

  useEffect(() => {
    Promise.all([
      supabase.from('returns').select('*, clients(company_name), vendors(company_name), return_items(id)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company_name').order('company_name'),
      supabase.from('vendors').select('id, company_name').eq('is_active', true).order('company_name'),
      supabase.from('sales_orders').select('id, order_no, client_id, total_amount'),
      supabase.from('purchase_orders').select('id, order_no, vendor_id, vendor_name, total_amount'),
      supabase.from('products').select('id, product_name, model, unit, list_price').eq('is_active', true).order('product_name'),
    ]).then(([rRes, cRes, vRes, soRes, poRes, pRes]) => {
      setReturns(rRes.data ?? [])
      setClients(cRes.data ?? [])
      setVendors(vRes.data ?? [])
      setSalesOrders(soRes.data ?? [])
      setPurchaseOrders(poRes.data ?? [])
      setProducts(pRes.data ?? [])
      setLoading(false)
    })
  }, [supabase])

  // 從銷貨單/訂購單帶入「建立退貨」query string 預先開啟表單
  useEffect(() => {
    const refType = searchParams.get('ref_type')
    const refId = searchParams.get('ref_id')
    if (refType && refId && (salesOrders.length > 0 || purchaseOrders.length > 0)) {
      if (refType === 'sales_order') {
        setForm(p => ({ ...p, return_type: '客戶退貨', ref_doc_id: refId }))
        onRefDocSelect('客戶退貨', refId)
      } else if (refType === 'purchase_order') {
        setForm(p => ({ ...p, return_type: '供應商退貨', ref_doc_id: refId }))
        onRefDocSelect('供應商退貨', refId)
      }
      setShowForm(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, salesOrders, purchaseOrders])

  async function onRefDocSelect(returnType: string, refId: string) {
    if (!refId) {
      setForm(p => ({ ...p, ref_doc_id: '', client_id: '', vendor_id: '' }))
      setItems([])
      return
    }
    if (returnType === '客戶退貨') {
      const so = salesOrders.find(o => o.id === refId)
      setForm(p => ({ ...p, ref_doc_id: refId, client_id: so?.client_id ?? '' }))
      const { data } = await supabase.from('sales_order_items').select('*').eq('order_id', refId).order('seq_no')
      setItems((data ?? []).map((i: any) => ({
        product_id: i.product_id ?? '', product_name: i.product_name, model: i.model ?? '',
        unit: i.unit ?? '台', quantity: i.quantity, unit_price: i.unit_price,
        item_condition: '良品', reason: '',
      })))
    } else {
      const po = purchaseOrders.find(o => o.id === refId)
      setForm(p => ({ ...p, ref_doc_id: refId, vendor_id: po?.vendor_id ?? '' }))
      const { data } = await supabase.from('purchase_order_items').select('*').eq('order_id', refId).order('seq_no')
      setItems((data ?? []).map((i: any) => ({
        product_id: i.product_id ?? '', product_name: i.product_name, model: i.model ?? '',
        unit: i.unit ?? '台', quantity: i.quantity, unit_price: i.unit_price,
        item_condition: '良品', reason: '',
      })))
    }
  }

  function addManualItem() {
    setItems(prev => [...prev, { product_id: '', product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_condition: '良品', reason: '' }])
  }

  function updateItem(idx: number, field: keyof ItemRow, val: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function onManualProductSelect(idx: number, productId: string) {
    const p = products.find(p => p.id === productId)
    if (!p) return
    setItems(prev => prev.map((it, i) => i === idx ? {
      ...it, product_id: p.id, product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: p.list_price ?? 0,
    } : it))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function resetForm() {
    setForm({
      return_type: '客戶退貨', ref_doc_id: '', client_id: '', vendor_id: '',
      return_date: new Date().toISOString().slice(0, 10), return_reason: '瑕疵',
      item_condition: '良品', settlement_method: '沖抵帳款', notes: '',
    })
    setItems([])
  }

  async function handleSave() {
    const validItems = items.filter(i => i.product_name.trim() && i.quantity > 0)
    if (validItems.length === 0) { alert('請至少填寫一筆退貨品項'); return }
    if (form.return_type === '客戶退貨' && !form.client_id) { alert('請選擇單位名稱'); return }
    if (form.return_type === '供應商退貨' && !form.vendor_id) { alert('請選擇廠商'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/returns/generate-no?type=${encodeURIComponent(form.return_type)}`)
      const { return_no } = await res.json()

      const subtotal = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const taxAmount = Math.floor(subtotal * 0.05)
      const totalAmount = subtotal + taxAmount

      const refDocNo = form.return_type === '客戶退貨'
        ? salesOrders.find(o => o.id === form.ref_doc_id)?.order_no ?? null
        : purchaseOrders.find(o => o.id === form.ref_doc_id)?.order_no ?? null

      const { data: inserted, error } = await supabase.from('returns').insert({
        return_no,
        return_type: form.return_type,
        ref_doc_type: form.ref_doc_id ? (form.return_type === '客戶退貨' ? 'sales_order' : 'purchase_order') : null,
        ref_doc_id: form.ref_doc_id || null,
        ref_doc_no: refDocNo,
        client_id: form.return_type === '客戶退貨' ? (form.client_id || null) : null,
        vendor_id: form.return_type === '供應商退貨' ? (form.vendor_id || null) : null,
        return_date: form.return_date,
        return_reason: form.return_reason,
        item_condition: form.item_condition,
        settlement_method: form.settlement_method,
        status: '待審核',
        subtotal, tax_amount: taxAmount, total_amount: totalAmount,
        notes: form.notes || null,
      }).select('id').single()

      if (error) throw error

      await supabase.from('return_items').insert(
        validItems.map((i, idx) => ({
          return_id: inserted.id,
          seq_no: idx + 1,
          product_id: i.product_id || null,
          product_name: i.product_name,
          model: i.model || null,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unit_price,
          item_condition: i.item_condition,
          reason: i.reason || null,
        }))
      )

      setShowForm(false)
      resetForm()
      await fetchReturns()
    } catch (e: any) {
      alert('建立失敗: ' + e.message)
    }
    setSaving(false)
  }

  const filtered = returns.filter(r => {
    const matchSearch =
      (r.return_no?.includes(search) ?? false) ||
      (r.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (r.vendors?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (r.ref_doc_no?.includes(search) ?? false)
    const matchType = typeFilter === '全部' || r.return_type === typeFilter
    const matchStatus = statusFilter === '全部' || r.status === statusFilter
    return matchSearch && matchType && matchStatus
  })

  const now = new Date()
  const isThisMonth = (d: string) => {
    const dt = new Date(d)
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
  }
  const clientReturnAmount = returns
    .filter(r => r.return_type === '客戶退貨' && r.status !== '作廢' && isThisMonth(r.return_date))
    .reduce((s, r) => s + Number(r.total_amount), 0)
  const vendorReturnAmount = returns
    .filter(r => r.return_type === '供應商退貨' && r.status !== '作廢' && isThisMonth(r.return_date))
    .reduce((s, r) => s + Number(r.total_amount), 0)
  const pendingCount = returns.filter(r => r.status === '待審核' || r.status === '已入庫').length

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const previewTax = Math.floor(subtotal * 0.05)
  const previewTotal = subtotal + previewTax

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <RotateCcw size={20} className="text-purple-600" />
          <h1 className="text-xl font-bold text-gray-900">退貨管理</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增退貨
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-purple-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">本月客戶退貨金額</div>
          <div className="text-xl font-bold text-purple-700">{formatCurrency(clientReturnAmount)}</div>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">本月供應商退貨金額</div>
          <div className="text-xl font-bold text-amber-700">{formatCurrency(vendorReturnAmount)}</div>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">待處理退貨筆數</div>
          <div className="text-xl font-bold text-gray-700">{pendingCount} 筆</div>
        </div>
      </div>

      {/* 新增退貨表單 */}
      {showForm && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-5 space-y-4">
          <div className="font-semibold text-purple-900">新增退貨單</div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">退貨類型 *</label>
              <select value={form.return_type} onChange={e => { setForm(p => ({ ...p, return_type: e.target.value, ref_doc_id: '', client_id: '', vendor_id: '' })); setItems([]) }} className={inputClass}>
                <option>客戶退貨</option>
                <option>供應商退貨</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">關聯單據（選填，選擇後自動帶入品項）</label>
              <select value={form.ref_doc_id} onChange={e => onRefDocSelect(form.return_type, e.target.value)} className={inputClass}>
                <option value="">不選單據（手動輸入）</option>
                {form.return_type === '客戶退貨'
                  ? salesOrders.map(o => <option key={o.id} value={o.id}>{o.order_no} — {formatCurrency(o.total_amount)}</option>)
                  : purchaseOrders.map(o => <option key={o.id} value={o.id}>{o.order_no} — {o.vendor_name} — {formatCurrency(o.total_amount)}</option>)}
              </select>
            </div>

            {form.return_type === '客戶退貨' ? (
              <div>
                <label className="text-xs text-gray-600 mb-1 block">單位名稱 *</label>
                <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={inputClass}>
                  <option value="">請選擇</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-600 mb-1 block">廠商 *</label>
                <select value={form.vendor_id} onChange={e => setForm(p => ({ ...p, vendor_id: e.target.value }))} className={inputClass}>
                  <option value="">請選擇</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 mb-1 block">退貨日期</label>
              <input type="date" value={form.return_date} onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">退貨原因</label>
              <select value={form.return_reason} onChange={e => setForm(p => ({ ...p, return_reason: e.target.value }))} className={inputClass}>
                {REASON_OPTIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">品項狀況</label>
              <select value={form.item_condition} onChange={e => setForm(p => ({ ...p, item_condition: e.target.value }))} className={inputClass}>
                <option>良品</option>
                <option>瑕疵品</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">財務處理方式</label>
              <select value={form.settlement_method} onChange={e => setForm(p => ({ ...p, settlement_method: e.target.value }))} className={inputClass}>
                {SETTLEMENT_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs text-gray-600 mb-1 block">備註</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
            </div>
          </div>

          {/* 品項明細 */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="text-sm font-semibold text-gray-700">退貨品項</div>
              <button onClick={addManualItem} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                <Plus size={12} /> 加一行
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">品名</th>
                    <th className="text-center px-2 py-2 text-gray-500 font-medium w-16">數量</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium w-24">單價</th>
                    <th className="text-right px-3 py-2 text-gray-500 font-medium w-24">小計</th>
                    <th className="text-center px-2 py-2 text-gray-500 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-400">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        {item.product_id === '' && !form.ref_doc_id ? (
                          <select
                            value=""
                            onChange={e => onManualProductSelect(idx, e.target.value)}
                            className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs"
                          >
                            <option value="">選擇產品...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.product_name} {p.model ? `(${p.model})` : ''}</option>)}
                          </select>
                        ) : (
                          <div>
                            <div className="font-medium text-gray-800">{item.product_name || '（未選擇）'}</div>
                            {item.model && <div className="text-gray-400">{item.model}</div>}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} step="0.01" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right" />
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-gray-800">
                        {formatCurrency(item.quantity * item.unit_price)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-xs">刪除</button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-6 text-gray-400 text-xs">選擇關聯單據自動帶入品項，或點「加一行」手動新增</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {items.length > 0 && (
              <div className="border-t border-gray-100 p-3 flex justify-end">
                <div className="space-y-1 text-xs min-w-[180px]">
                  <div className="flex justify-between text-gray-600"><span>小計</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>稅額（5%）</span><span>{formatCurrency(previewTax)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>含稅總計</span><span className="text-purple-700">{formatCurrency(previewTotal)}</span></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? '建立中...' : '建立退貨單'}
            </button>
          </div>
        </div>
      )}

      {/* 篩選 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋單號、單位名稱、廠商、關聯單據..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {TYPE_OPTIONS.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-2 rounded-xl text-xs font-medium transition ${typeFilter === t ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'}`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-medium transition ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">退貨單號</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">類型</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">單位／廠商</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">關聯單據</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">退貨日期</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">品項數</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">金額</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">沒有退貨紀錄</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-purple-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.return_no}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${TYPE_COLORS[r.return_type]}`}>{r.return_type}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.clients?.company_name ?? r.vendors?.company_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.ref_doc_no ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.return_date)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.return_items?.length ?? 0}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(r.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Link href={`/returns/${r.id}`} className="text-xs text-purple-600 hover:underline px-1">查看</Link>
                        <button onClick={() => window.open(`/returns/${r.id}/print`, '_blank')} title="列印／分享 PDF" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={15} /></button>
                        <button onClick={() => handleDeleteReturn(r.id, r.return_no)} title="刪除" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">載入中...</div>}>
      <ReturnsPageInner />
    </Suspense>
  )
}
