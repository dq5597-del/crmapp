'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, PackagePlus, Plus, X, Trash2 } from 'lucide-react'
import RowDeleteButton from '@/components/RowDeleteButton'
import ProductPickerModal from '@/components/ProductPickerModal'
import {
  ensurePayableForPurchase, ensureStockInForPurchase, voidPayableForPurchase,
  syncPayableForPurchase, reconcileStockForPurchase,
} from '@/lib/auto-ledger'
import { knownBrandLogoUrl } from '@/lib/brand-logos'
import { useColWidths, ResizableTH, ColWidthTools } from '@/components/ResizableTable'

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已確認': 'bg-blue-100 text-blue-700',
  '已到貨': 'bg-green-100 text-green-700',
  '取消': 'bg-red-100 text-red-700',
}
const STATUS_OPTIONS = ['草稿', '已確認', '已到貨', '取消']

type Item = {
  product_id: string | null
  brand: string
  product_name: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  item_notes: string
}
const emptyItem = (): Item => ({ product_id: null, brand: '', product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_notes: '' })

export default function PurchasesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // 編輯中的進貨單（null = 新增模式）
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNo, setEditingNo] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [apLocked, setApLocked] = useState<string | null>(null)

  // form
  const [vendorId, setVendorId] = useState('')
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDD, setShowVendorDD] = useState(false)
  const [creatingVendor, setCreatingVendor] = useState(false)
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentTerms, setPaymentTerms] = useState('')
  const [status, setStatus] = useState('已確認')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([emptyItem()])
  // 欄寬微調：每個使用者自己存，拖動即時生效
  const { widths: colW, startResize, reset: resetColW } = useColWidths('purchase-items', {
    brand: 110, name: 220, model: 150, unit: 56, qty: 60, price: 110, total: 112,
  })
  const [pickerTarget, setPickerTarget] = useState<number | 'append' | null>(null)
  const [termDefaults, setTermDefaults] = useState({ payment_terms: '', notes: '' })

  useEffect(() => {
    Promise.all([
      supabase.from('purchases').select('*, vendors(company_name)').order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, company_name, contact_name, phone').eq('is_active', true).order('company_name'),
      supabase.from('products').select('id, brand, product_name, model, unit, list_price, cost_price, stock_qty, product_categories(main_category, sub_category)').eq('is_active', true).order('product_name'),
      supabase.from('system_settings').select('*').single(),
    ]).then(([rRes, vRes, pRes, sRes]) => {
      setRows(rRes.data ?? [])
      setVendors(vRes.data ?? [])
      setProducts(pRes.data ?? [])
      const s = sRes.data as any
      if (s) setTermDefaults({ payment_terms: s.purchase_payment_terms ?? '', notes: s.purchase_notes ?? '' })
      setLoading(false)
    })
  }, [])

  async function fetchRows() {
    const { data } = await supabase.from('purchases').select('*, vendors(company_name)').order('created_at', { ascending: false })
    setRows(data ?? [])
  }

  const filtered = rows.filter(r =>
    (r.purchase_no ?? '').includes(search) ||
    (r.vendors?.company_name?.toLowerCase() ?? r.vendor_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  function resetForm() {
    setEditingId(null); setEditingNo(''); setApLocked(null)
    setVendorId(''); setVendorSearch(''); setShowVendorDD(false)
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setPaymentTerms(termDefaults.payment_terms)
    setStatus('已確認'); setNotes(termDefaults.notes); setItems([emptyItem()])
  }

  // 點單號 → 開啟同一張表單做編輯
  async function openEdit(r: any) {
    setLoadingEdit(true)
    setEditingId(r.id); setEditingNo(r.purchase_no)
    setVendorId(r.vendor_id ?? ''); setVendorSearch(''); setShowVendorDD(false)
    setPurchaseDate(r.purchase_date ?? new Date().toISOString().slice(0, 10))
    setPaymentTerms(r.payment_terms ?? '')
    setStatus(r.status ?? '已確認')
    setNotes(r.notes ?? '')
    setItems([])
    setShowForm(true)

    const [{ data: itemRows }, { data: aps }] = await Promise.all([
      supabase.from('purchase_items').select('*').eq('purchase_id', r.id).order('seq_no'),
      supabase.from('payables').select('payable_no, paid_amount, status').eq('purchase_id', r.id),
    ])
    setItems(
      (itemRows ?? []).length > 0
        ? (itemRows ?? []).map(i => ({
            product_id: i.product_id ?? null,
            brand: i.brand ?? '',
            product_name: i.product_name ?? '',
            model: i.model ?? '',
            unit: i.unit ?? '台',
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            item_notes: i.item_notes ?? '',
          }))
        : [emptyItem()]
    )
    const paid = (aps ?? []).find(p => p.status !== '作廢' && Number(p.paid_amount) > 0)
    setApLocked(paid ? paid.payable_no : null)
    setLoadingEdit(false)
  }

  const selectedVendorName = vendors.find(v => v.id === vendorId)?.company_name ?? ''
  const filteredVendors = vendorSearch
    ? vendors.filter(v => v.company_name.toLowerCase().includes(vendorSearch.toLowerCase()))
    : vendors

  async function quickAddVendor(name: string) {
    if (!name.trim() || creatingVendor) return
    setCreatingVendor(true)
    const { data, error } = await supabase.from('vendors').insert({ company_name: name.trim(), is_active: true }).select('id, company_name').single()
    setCreatingVendor(false)
    if (error || !data) { alert('新增廠商失敗：' + (error?.message ?? '')); return }
    setVendors(prev => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name, 'zh-Hant')))
    setVendorId(data.id); setVendorSearch(''); setShowVendorDD(false)
  }

  function updateItem(idx: number, field: keyof Item, val: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  function handlePickerConfirm(picked: any[]) {
    setItems(prev => {
      const next = [...prev]
      let list = picked
      if (typeof pickerTarget === 'number') {
        const t = next[pickerTarget]
        if (t && !t.product_name.trim() && picked.length > 0) {
          const p = picked[0]
          next[pickerTarget] = { ...t, product_id: p.id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.cost_price) || 0 }
          list = picked.slice(1)
        }
      }
      list.forEach(p => next.push({ ...emptyItem(), product_id: p.id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.cost_price) || 0 }))
      return next
    })
    setPickerTarget(null)
  }

  async function generateNo() {
    const d = new Date()
    const yy = String(d.getFullYear()).slice(2)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const prefix = `PUR-${yy}${mm}${dd}-`
    const { data } = await supabase.from('purchases').select('purchase_no').like('purchase_no', `${prefix}%`).order('purchase_no', { ascending: false }).limit(1)
    const seq = data?.[0]?.purchase_no ? parseInt(data[0].purchase_no.split('-').pop() ?? '0') + 1 : 1
    return `${prefix}${String(seq).padStart(3, '0')}`
  }

  function itemRowsFor(purchaseId: string, validItems: Item[]) {
    return validItems.map((i, idx) => ({
      purchase_id: purchaseId, seq_no: idx + 1,
      product_id: i.product_id, brand: i.brand || null,
      product_name: i.product_name, model: i.model || null,
      unit: i.unit, quantity: i.quantity, unit_price: i.unit_price,
      item_notes: i.item_notes || null,
    }))
  }

  // 編輯既有進貨單
  async function handleUpdate() {
    if (!editingId) return
    if (!vendorId) return alert('請選擇廠商')
    const validItems = items.filter(i => i.product_name.trim())
    if (validItems.length === 0) return alert('請至少填一筆品項')

    const newTotal = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
    if (apLocked) {
      const ok = confirm(`應付 ${apLocked} 已有付款紀錄，金額不會自動同步。\n仍要儲存進貨單的修改嗎？（應付金額請自行至應付帳款調整）`)
      if (!ok) return
    }

    setSaving(true)
    try {
      const { error: upErr } = await supabase.from('purchases').update({
        vendor_id: vendorId,
        vendor_name: selectedVendorName,
        purchase_date: purchaseDate || null,
        payment_terms: paymentTerms || null,
        subtotal: newTotal, tax_amount: 0, total_amount: newTotal,
        notes: notes || null,
        status,
      }).eq('id', editingId)
      if (upErr) throw upErr

      // 品項：先寫入新的，成功後才刪舊的（避免中途失敗造成資料遺失）
      const { data: oldItems } = await supabase
        .from('purchase_items').select('id').eq('purchase_id', editingId)
      const { error: insErr } = await supabase.from('purchase_items').insert(itemRowsFor(editingId, validItems))
      if (insErr) throw insErr
      if (oldItems && oldItems.length > 0) {
        await supabase.from('purchase_items').delete().in('id', oldItems.map(o => o.id))
      }

      // 帳務與庫存連動
      const msgs: string[] = []
      const apCreate = await ensurePayableForPurchase(supabase, editingId, status)
      if (apCreate.status === 'created') msgs.push(apCreate.message)
      if (apCreate.status === 'error') msgs.push(`⚠️ ${apCreate.message}`)

      const apSync = await syncPayableForPurchase(supabase, editingId)
      if (apSync.status === 'created') msgs.push(apSync.message)
      if (apSync.status === 'error') msgs.push(`⚠️ ${apSync.message}`)
      if (apSync.status === 'skipped' && apSync.reason) msgs.push(`⚠️ ${apSync.reason}`)

      const voidRes = await voidPayableForPurchase(supabase, editingId, status)
      if (voidRes.status === 'created') msgs.push(voidRes.message)

      const stockIn = await ensureStockInForPurchase(supabase, editingId, status)
      if (stockIn === 'created') msgs.push('已自動入庫')
      const stockFix = await reconcileStockForPurchase(supabase, editingId)
      if (stockFix.status === 'created') msgs.push(stockFix.message)
      if (stockFix.status === 'error') msgs.push(`⚠️ ${stockFix.message}`)

      alert(msgs.length > 0 ? `進貨單已更新。\n${msgs.join('\n')}` : '進貨單已更新。')
      await fetchRows()
      setShowForm(false)
      resetForm()
    } catch (e: any) {
      alert('更新失敗: ' + e.message)
    }
    setSaving(false)
  }

  async function handleCreate() {
    if (!vendorId) return alert('請選擇廠商')
    const validItems = items.filter(i => i.product_name.trim())
    if (validItems.length === 0) return alert('請至少填一筆品項')
    setSaving(true)
    try {
      const purchase_no = await generateNo()
      const subtotal = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)

      const { data: order, error } = await supabase.from('purchases').insert({
        purchase_no,
        vendor_id: vendorId,
        vendor_name: selectedVendorName,
        purchase_date: purchaseDate || null,
        payment_terms: paymentTerms || null,
        subtotal, tax_amount: 0, total_amount: subtotal,
        notes: notes || null,
        status,
      }).select().single()
      if (error) throw error

      await supabase.from('purchase_items').insert(itemRowsFor(order.id, validItems))

      const apResult = await ensurePayableForPurchase(supabase, order.id, status)
      const stockResult = await ensureStockInForPurchase(supabase, order.id, status)
      const msgs: string[] = []
      if (apResult.status === 'created') msgs.push(apResult.message)
      if (apResult.status === 'error') msgs.push(`⚠️ ${apResult.message}`)
      if (apResult.status === 'skipped' && apResult.reason?.includes('金額為 0')) msgs.push(`⚠️ ${apResult.reason}`)
      if (stockResult === 'created') msgs.push('已自動入庫')
      alert(msgs.length > 0 ? `進貨單已建立。\n${msgs.join('\n')}` : '進貨單已建立。')

      await fetchRows()
      setShowForm(false)
      resetForm()
    } catch (e: any) {
      alert('儲存失敗: ' + e.message)
    }
    setSaving(false)
  }

  // 列表直接改狀態（改到已到貨會自動入庫）
  async function handleStatusChange(r: any, next: string) {
    setBusyId(r.id)
    const { error } = await supabase.from('purchases').update({ status: next }).eq('id', r.id)
    if (error) { alert('狀態更新失敗：' + error.message); setBusyId(null); return }
    const apResult = await ensurePayableForPurchase(supabase, r.id, next)
    const voidResult = await voidPayableForPurchase(supabase, r.id, next)
    const stockResult = await ensureStockInForPurchase(supabase, r.id, next)
    const msgs: string[] = []
    if (apResult.status === 'created') msgs.push(apResult.message)
    if (apResult.status === 'error') msgs.push(`⚠️ ${apResult.message}`)
    if (apResult.status === 'skipped' && apResult.reason?.includes('金額為 0')) msgs.push(`⚠️ ${apResult.reason}`)
    if (voidResult.status === 'created') msgs.push(voidResult.message)
    if (voidResult.status === 'error') msgs.push(`⚠️ ${voidResult.message}`)
    if (stockResult === 'created') msgs.push('已自動入庫')
    if (msgs.length > 0) alert(msgs.join('\n'))
    await fetchRows()
    setBusyId(null)
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <PackagePlus size={20} className="text-teal-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">進貨單</h1>
            <p className="text-sm text-gray-500 mt-0.5">向廠商進貨：狀態改「已到貨」自動產生應付帳款並入庫</p>
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增進貨單
        </button>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋單號、廠商..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">進貨單號</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">廠商</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">進貨日期</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">含稅總計</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態（可直接改）</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">沒有進貨單</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(r)} title="點擊編輯進貨單"
                      className="font-semibold text-teal-700 hover:text-teal-900 hover:underline">
                      {r.purchase_no}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.vendors?.company_name ?? r.vendor_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.purchase_date ? formatDate(r.purchase_date) : formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <select value={r.status} disabled={busyId === r.id}
                      onChange={e => handleStatusChange(r, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-lg font-medium border-0 cursor-pointer ${STATUS_COLORS[r.status] ?? 'bg-gray-100'}`}>
                      {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RowDeleteButton
                      table="purchases" id={r.id} label="進貨單"
                      confirmMessage={`確定刪除進貨單 ${r.purchase_no}？品項一併刪除（已入庫的異動不會自動還原，請至庫存管理沖銷）。`}
                      onDeleted={id => setRows(prev => prev.filter(x => x.id !== id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增進貨單 Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? `編輯進貨單 ${editingNo}` : '新增進貨單'}
                {loadingEdit && <span className="ml-2 text-xs font-normal text-gray-400">載入中…</span>}
              </h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-5">
              {apLocked && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
                  應付 <span className="font-semibold">{apLocked}</span> 已有付款紀錄：修改金額<span className="font-semibold">不會</span>自動同步應付，請自行至應付帳款調整。
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="text-xs text-gray-500 mb-1 block">廠商 *</label>
                  <input
                    value={vendorSearch || selectedVendorName}
                    onChange={e => { setVendorSearch(e.target.value); setVendorId(''); setShowVendorDD(true) }}
                    onFocus={() => setShowVendorDD(true)}
                    onBlur={() => setTimeout(() => setShowVendorDD(false), 150)}
                    placeholder="搜尋或新增廠商" autoComplete="off" className={inputClass} />
                  {showVendorDD && (
                    <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                      {filteredVendors.map(v => (
                        <button key={v.id} type="button"
                          onMouseDown={() => { setVendorId(v.id); setVendorSearch(''); setShowVendorDD(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50">
                          {v.company_name}
                        </button>
                      ))}
                      {vendorSearch.trim() && !vendors.some(v => v.company_name === vendorSearch.trim()) && (
                        <button type="button" onMouseDown={() => quickAddVendor(vendorSearch)}
                          className="w-full text-left px-3 py-2 text-sm text-teal-700 hover:bg-teal-50 flex items-center gap-1.5 border-t border-gray-100">
                          <Plus size={14} /> {creatingVendor ? '新增中…' : `新增廠商「${vendorSearch.trim()}」`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">進貨日期</label>
                  <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">付款條件</label>
                  <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="月結30天" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">狀態</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* 品項 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">進貨品項</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPickerTarget('append')} className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-medium">
                      <Search size={12} /> 選產品（多選）
                    </button>
                    <button onClick={() => setItems(prev => [...prev, emptyItem()])} className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1">
                      <Plus size={12} /> 加一行
                    </button>
                    <ColWidthTools tableKey="purchase-items" widths={colW} onReset={resetColW} />
                  </div>
                </div>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="text-xs" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: 0 }}>
                    <thead className="bg-gray-50">
                      <tr>
                        <ResizableTH col="brand" widths={colW} startResize={startResize} className="text-left px-2 py-2 text-gray-500 font-medium">品牌</ResizableTH>
                        <ResizableTH col="name" widths={colW} startResize={startResize} className="text-left px-3 py-2 text-gray-500 font-medium">品名 *</ResizableTH>
                        <ResizableTH col="model" widths={colW} startResize={startResize} className="text-left px-3 py-2 text-gray-500 font-medium">型號</ResizableTH>
                        <ResizableTH col="unit" widths={colW} startResize={startResize} className="text-center px-2 py-2 text-gray-500 font-medium">單位</ResizableTH>
                        <ResizableTH col="qty" widths={colW} startResize={startResize} className="text-center px-2 py-2 text-gray-500 font-medium">數量</ResizableTH>
                        <ResizableTH col="price" widths={colW} startResize={startResize} className="text-right px-3 py-2 text-gray-500 font-medium">進價</ResizableTH>
                        <ResizableTH col="total" widths={colW} startResize={startResize} className="text-right px-3 py-2 text-gray-500 font-medium">金額</ResizableTH>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-2 py-1.5">
                            {(() => {
                              const logo = knownBrandLogoUrl(item.brand)
                              // eslint-disable-next-line @next/next/no-img-element
                              return logo ? <img src={logo} alt="" className="h-3.5 w-auto max-w-[60px] object-contain mb-0.5" /> : null
                            })()}
                            <input value={item.brand} onChange={e => updateItem(idx, 'brand', e.target.value)} placeholder="品牌"
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)}
                                placeholder="輸入品名，或按放大鏡選產品"
                                className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                              <button type="button" onClick={() => setPickerTarget(idx)} className="p-1 text-gray-400 hover:text-teal-600 shrink-0">
                                <Search size={13} />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={item.model} onChange={e => updateItem(idx, 'model', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs text-center" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs text-center" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs text-right" />
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-gray-800">
                            {formatCurrency(item.quantity * item.unit_price)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-2 text-sm font-bold">
                  含稅總計：<span className="text-teal-700 ml-1">{formatCurrency(subtotal)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">備註</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputClass + ' resize-none'} />
              </div>
              <p className="text-[11px] text-gray-400">
                提示：只有「從產品庫選取」的品項會自動入庫與計成本；狀態改為「已到貨」時自動產生應付帳款並入庫，到期日依付款條件計算。
              </p>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={editingId ? handleUpdate : handleCreate} disabled={saving || loadingEdit}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium disabled:opacity-60">
                {saving ? '儲存中...' : editingId ? '儲存修改' : '建立進貨單'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerTarget !== null && (
        <ProductPickerModal
          products={products}
          onClose={() => setPickerTarget(null)}
          onConfirm={handlePickerConfirm}
          confirmLabel="帶入進貨單"
        />
      )}
    </div>
  )
}
