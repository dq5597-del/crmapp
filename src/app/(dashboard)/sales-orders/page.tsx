'use client'

import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, ShoppingCart, Plus, X, Trash2 } from 'lucide-react'
import CopyDocButton from '@/components/CopyDocButton'
import RowDeleteButton from '@/components/RowDeleteButton'
import { ensureReceivableForSalesOrder, ensureStockOutForSalesOrder } from '@/lib/auto-ledger'
import { knownBrandLogoUrl } from '@/lib/brand-logos'
import ProductPickerModal from '@/components/ProductPickerModal'

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已確認': 'bg-blue-100 text-blue-700',
  '出貨中': 'bg-orange-100 text-orange-700',
  '已完成': 'bg-green-100 text-green-700',
  '取消': 'bg-red-100 text-red-700',
}

const STATUS_OPTIONS = ['草稿', '已確認', '出貨中', '已完成', '取消']

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

const emptyItem = (): Item => ({
  product_id: null, brand: '', product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_notes: '',
})

export default function SalesOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [productSearch, setProductSearch] = useState<Record<number, string>>({})
  const [productDropdown, setProductDropdown] = useState<number | null>(null)
  const [quickAddIdx, setQuickAddIdx] = useState<number | null>(null)  // -1 = 新增後直接加一列
  const [pickerTarget, setPickerTarget] = useState<number | 'append' | null>(null)
  const [quickForm, setQuickForm] = useState({ brand: '', product_name: '', model: '', unit: '台', list_price: 0 })
  const [quickSaving, setQuickSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  // form fields
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [contactName, setContactName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [status, setStatus] = useState('已確認')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([emptyItem()])

  const [termDefaults, setTermDefaults] = useState({ payment_terms: '', bank_account: '', notes: '' })

  useEffect(() => {
    Promise.all([
      supabase.from('sales_orders').select('*, clients(company_name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company_name').order('company_name'),
      supabase.from('products').select('id, brand, product_name, model, unit, list_price, stock_qty, product_categories(main_category, sub_category)').eq('is_active', true).order('product_name'),
      supabase.from('system_settings').select('*').single(),
    ]).then(([ordersRes, clientsRes, productsRes, settingsRes]) => {
      setOrders(ordersRes.data ?? [])
      setClients(clientsRes.data ?? [])
      setProducts(productsRes.data ?? [])
      const s = settingsRes.data as any
      if (s) setTermDefaults({
        payment_terms: s.sales_payment_terms ?? '',
        bank_account: s.sales_bank_account ?? s.bank_account ?? '',
        notes: s.sales_notes ?? '',
      })
      setLoading(false)
    })
  }, [])

  const filteredProducts = (idx: number) => {
    const q = (productSearch[idx] ?? '').toLowerCase()
    if (!q) return products.slice(0, 20)
    return products.filter(p =>
      p.product_name.toLowerCase().includes(q) ||
      (p.model?.toLowerCase() ?? '').includes(q) ||
      (p.brand?.toLowerCase() ?? '').includes(q)
    ).slice(0, 20)
  }

  function onProductPick(idx: number, p: any) {
    setItems(prev => prev.map((it, i) => i !== idx ? it : {
      ...it, product_id: p.id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.list_price) || 0,
    }))
    setProductDropdown(null)
    setProductSearch(prev => ({ ...prev, [idx]: '' }))
  }

  async function handleQuickAddProduct() {
    if (!quickForm.product_name.trim() || quickSaving || quickAddIdx === null) return
    setQuickSaving(true)
    const { data, error } = await supabase.from('products').insert({
      brand: quickForm.brand.trim().toUpperCase() || null,
      product_name: quickForm.product_name.trim(),
      model: quickForm.model.trim().toUpperCase() || null,
      unit: quickForm.unit || '台',
      list_price: Number(quickForm.list_price) || 0,
      cost_price: 0, stock_qty: 0, is_active: true,
    }).select('*').single()
    setQuickSaving(false)
    if (error || !data) { alert('新增產品失敗：' + (error?.message ?? '')); return }
    setProducts(prev => [...prev, data].sort((a, b) => a.product_name.localeCompare(b.product_name, 'zh-Hant')))
    if (quickAddIdx === -1) {
      setItems(prev => [...prev, { ...emptyItem(), product_id: data.id, brand: data.brand ?? '', product_name: data.product_name, model: data.model ?? '', unit: data.unit ?? '台', unit_price: Number(data.list_price) || 0 }])
    } else {
      onProductPick(quickAddIdx, data)
    }
    setQuickAddIdx(null)
  }

  function handlePickerConfirm(picked: any[]) {
    setItems(prev => {
      const next = [...prev]
      let list = picked
      if (typeof pickerTarget === 'number') {
        const t = next[pickerTarget]
        if (t && !t.product_name.trim() && picked.length > 0) {
          const p = picked[0]
          next[pickerTarget] = { ...t, product_id: p.id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.list_price) || 0 }
          list = picked.slice(1)
        }
      }
      list.forEach(p => next.push({ ...emptyItem(), product_id: p.id, brand: p.brand ?? '', product_name: p.product_name, model: p.model ?? '', unit: p.unit ?? '台', unit_price: Number(p.list_price) || 0 }))
      return next
    })
    setPickerTarget(null)
  }

  function handlePickerQuickAdd(text: string) {
    setQuickForm({ brand: '', product_name: text, model: '', unit: '台', list_price: 0 })
    setQuickAddIdx(typeof pickerTarget === 'number' ? pickerTarget : -1)
    setPickerTarget(null)
  }

  const filtered = orders.filter(o =>
    (o.order_no ?? '').includes(search) ||
    (o.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (o.project_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  const allSelected = filtered.length > 0 && filtered.every(o => selected.includes(o.id))
  function toggleAll() { setSelected(allSelected ? [] : filtered.map(o => o.id)) }
  function toggleOne(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  async function handleDeleteSelected() {
    const ids = filtered.filter(o => selected.includes(o.id)).map(o => o.id)
    if (ids.length === 0) return
    if (!confirm(`確定刪除選取的 ${ids.length} 張銷貨單？品項將一併刪除，此動作無法復原。`)) return
    setDeleting(true)
    const { error } = await supabase.from('sales_orders').delete().in('id', ids)
    if (error) {
      alert(error.code === '23503'
        ? '其中有銷貨單已被其他單據關聯，無法刪除。請先解除相關關聯後再試。'
        : '刪除失敗：' + error.message)
    } else {
      setOrders(prev => prev.filter(o => !ids.includes(o.id)))
      setSelected([])
    }
    setDeleting(false)
  }

  function resetForm() {
    setClientId(''); setClientSearch(''); setShowClientDropdown(false)
    setProjectName(''); setContactName(''); setClientPhone('')
    setDeliveryDate(''); setDeliveryAddress('')
    setPaymentTerms(termDefaults.payment_terms)
    setBankAccount(termDefaults.bank_account)
    setStatus('已確認'); setNotes(termDefaults.notes); setItems([emptyItem()])
  }

  async function generateOrderNo() {
    const d = new Date()
    const yy = String(d.getFullYear()).slice(2)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const prefix = `SO-${yy}${mm}${dd}-`
    const { data } = await supabase
      .from('sales_orders').select('order_no')
      .like('order_no', `${prefix}%`)
      .order('order_no', { ascending: false })
      .limit(1)
    const seq = data?.[0]?.order_no
      ? parseInt(data[0].order_no.split('-').pop() ?? '0') + 1
      : 1
    return `${prefix}${String(seq).padStart(3, '0')}`
  }

  async function handleCreate() {
    if (!clientId) return alert('請選擇單位名稱')
    const validItems = items.filter(i => i.product_name.trim())
    if (validItems.length === 0) return alert('請至少填一筆品項')
    setSaving(true)
    try {
      const order_no = await generateOrderNo()
      const subtotal = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const tax_amount = 0 // 系統價格含稅，不另加稅
      const total_amount = subtotal + tax_amount

      const { data: order, error } = await supabase
        .from('sales_orders')
        .insert({
          order_no, client_id: clientId, project_name: projectName,
          contact_name: contactName, client_phone: clientPhone,
          delivery_date: deliveryDate || null, delivery_address: deliveryAddress,
          payment_terms: paymentTerms, bank_account: bankAccount,
          subtotal, tax_amount, total_amount, notes, status,
        })
        .select().single()
      if (error) throw error

      await supabase.from('sales_order_items').insert(
        validItems.map((i, idx) => ({
          order_id: order.id, seq_no: idx + 1,
          product_id: i.product_id,
          brand: i.brand || null,
          product_name: i.product_name, model: i.model,
          unit: i.unit, quantity: i.quantity, unit_price: i.unit_price,
          item_notes: i.item_notes,
        }))
      )

      // 銷貨成立 → 自動產生應收帳款；出貨中/已完成 → 自動扣庫存
      const arResult = await ensureReceivableForSalesOrder(supabase, order.id, status)
      const stockResult = await ensureStockOutForSalesOrder(supabase, order.id, status)
      const msgs: string[] = []
      if (arResult === 'created') msgs.push('已自動產生應收帳款')
      if (stockResult === 'created') msgs.push('已自動扣減庫存')
      if (msgs.length > 0) alert(`銷貨單已建立，${msgs.join('、')}。`)

      const { data: refreshed } = await supabase
        .from('sales_orders').select('*, clients(company_name)')
        .order('created_at', { ascending: false })
      setOrders(refreshed ?? [])
      setShowForm(false)
      resetForm()
    } catch (e: any) {
      alert('儲存失敗: ' + e.message)
    }
    setSaving(false)
  }

  function updateItem(idx: number, field: keyof Item, val: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }
  function addItem() { setItems(prev => [...prev, emptyItem()]) }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const tax = 0 // 系統價格含稅，不另加稅
  const total = subtotal + tax

  const selectedClientName = clients.find(c => c.id === clientId)?.company_name ?? ''
  const filteredClients = clientSearch
    ? clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients

  function onClientPick(c: any) {
    setClientId(c.id)
    setClientSearch('')
    setShowClientDropdown(false)
  }

  async function handleQuickCreateClient(name: string) {
    const value = name.trim()
    if (!value || creatingClient) return
    setCreatingClient(true)
    const { data, error } = await supabase
      .from('clients')
      .insert({ company_name: value })
      .select('id, company_name')
      .single()
    setCreatingClient(false)
    if (error || !data) { alert('新增失敗: ' + (error?.message ?? '')); return }
    setClients(prev =>
      [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name, 'zh-Hant'))
    )
    onClientPick(data)
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <ShoppingCart size={20} className="text-green-600" />
          <h1 className="text-xl font-bold text-gray-900">銷貨單</h1>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Trash2 size={16} /> {deleting ? '刪除中…' : `刪除選取（${selected.length}）`}
            </button>
          )}
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> 新增銷貨單
          </button>
        </div>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋單號、單位名稱..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3 w-10 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-green-600 w-4 h-4 align-middle" title="全選" />
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">銷貨單號</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">單位名稱</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">案名</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">含稅總計</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">建立日期</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">沒有銷貨單</td></tr>
              ) : filtered.map(o => (
                <tr key={o.id} className={`border-b border-gray-50 transition-colors ${selected.includes(o.id) ? 'bg-green-50/70' : 'hover:bg-green-50'}`}>
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} className="accent-green-600 w-4 h-4 align-middle" />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/sales-orders/${o.id}`} className="font-semibold text-green-700 hover:underline">
                      {o.order_no}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{o.clients?.company_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{o.project_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(o.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <CopyDocButton type="sales-orders" id={o.id} title="複製此銷貨單（單號重新產生、狀態回草稿）" />
                    <RowDeleteButton
                      table="sales_orders"
                      id={o.id}
                      label="銷貨單"
                      confirmMessage={`確定刪除銷貨單 ${o.order_no}？品項將一併刪除，此動作無法復原。`}
                      onDeleted={id => setOrders(prev => prev.filter(x => x.id !== id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 新增銷貨單 Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">新增銷貨單</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* 基本資料 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="text-xs text-gray-500 mb-1 block">單位名稱 *</label>
                  <input
                    value={clientSearch || selectedClientName}
                    onChange={e => {
                      setClientSearch(e.target.value)
                      setClientId('')
                      setShowClientDropdown(true)
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                    placeholder="輸入搜尋或新增單位名稱"
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {showClientDropdown && (
                    <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                      {filteredClients.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => onClientPick(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 transition-colors"
                        >
                          {c.company_name}
                        </button>
                      ))}
                      {clientSearch.trim() && !clients.some(c => c.company_name === clientSearch.trim()) && (
                        <button
                          type="button"
                          onMouseDown={() => handleQuickCreateClient(clientSearch)}
                          className="w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 flex items-center gap-1.5 border-t border-gray-100"
                        >
                          <Plus size={14} />
                          {creatingClient ? '新增中…' : `新增單位名稱「${clientSearch.trim()}」`}
                        </button>
                      )}
                      {filteredClients.length === 0 && !clientSearch.trim() && (
                        <div className="px-3 py-2 text-sm text-gray-400">無單位名稱資料</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">案名</label>
                  <input value={projectName} onChange={e => setProjectName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="專案名稱" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">聯絡人</label>
                  <input value={contactName} onChange={e => setContactName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">電話</label>
                  <input value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">交貨地址</label>
                  <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">狀態</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* 品項明細 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">品項明細</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPickerTarget('append')} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-medium">
                      <Search size={12} /> 選產品（多選）
                    </button>
                    <button onClick={addItem} className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
                      <Plus size={12} /> 加一行
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-2 py-2 text-gray-500 font-medium w-20">品牌</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">品名 *</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium w-24">型號</th>
                        <th className="text-center px-2 py-2 text-gray-500 font-medium w-14">單位</th>
                        <th className="text-center px-2 py-2 text-gray-500 font-medium w-16">數量</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium w-24">含稅單價</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium w-24">含稅總計</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <Fragment key={idx}>
                        <tr className="border-t border-gray-100">
                          <td className="px-2 py-1.5">
                            {(() => {
                              const logo = knownBrandLogoUrl(item.brand)
                              // eslint-disable-next-line @next/next/no-img-element
                              return logo ? <img src={logo} alt="" className="h-3.5 w-auto max-w-[60px] object-contain mb-0.5" /> : null
                            })()}
                            <input value={item.brand} onChange={e => updateItem(idx, 'brand', e.target.value)} placeholder="品牌"
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                value={item.product_name}
                                onChange={e => updateItem(idx, 'product_name', e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                placeholder="輸入品名，或按放大鏡選產品" autoComplete="off" />
                              <button type="button" onClick={() => setPickerTarget(idx)} title="從產品庫選取（可多選）"
                                className="p-1 text-gray-400 hover:text-green-600 shrink-0">
                                <Search size={13} />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={item.model} onChange={e => updateItem(idx, 'model', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                              className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-28 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" min={0}
                              value={item.quantity * item.unit_price === 0 ? '' : Math.round(item.quantity * item.unit_price)}
                              onChange={e => {
                                const total = e.target.value === '' ? 0 : (Number(e.target.value) || 0)
                                updateItem(idx, 'unit_price', item.quantity > 0 ? total / item.quantity : total)
                              }}
                              onFocus={e => e.target.select()}
                              title="可直接輸入含稅總計，系統會自動回算單價"
                              className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right font-semibold focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td />
                          <td colSpan={6} className="px-2 pb-1.5">
                            <input value={item.item_notes} onChange={e => updateItem(idx, 'item_notes', e.target.value)}
                              placeholder="品項備註（選填）"
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                          </td>
                          <td />
                        </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-2">
                  <div className="text-right space-y-0.5 text-xs min-w-[200px]">
                    <div className="flex justify-between font-bold text-gray-900 border-t pt-0.5">
                      <span>含稅總計</span><span className="text-green-700">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 銷貨條款 */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">銷貨條款</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">交貨日期</label>
                    <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">付款條件</label>
                    <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="月結30天" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">匯款帳號</label>
                    <input value={bankAccount} onChange={e => setBankAccount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">備註</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                      placeholder="其他條款說明..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                取消
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {saving ? '儲存中...' : '建立銷貨單'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 選產品 Modal */}
      {pickerTarget !== null && (
        <ProductPickerModal
          products={products}
          onClose={() => setPickerTarget(null)}
          onConfirm={handlePickerConfirm}
          onQuickAdd={handlePickerQuickAdd}
          confirmLabel="帶入銷貨單"
        />
      )}

      {/* 快速新增產品 Modal */}
      {quickAddIdx !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">快速新增產品</h3>
              <button onClick={() => setQuickAddIdx(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">品牌</label>
                  <input value={quickForm.brand} onChange={e => setQuickForm(p => ({ ...p, brand: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="YAMAHA" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">單位</label>
                  <input value={quickForm.unit} onChange={e => setQuickForm(p => ({ ...p, unit: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">產品名稱 *</label>
                <input value={quickForm.product_name} onChange={e => setQuickForm(p => ({ ...p, product_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">規格型號</label>
                  <input value={quickForm.model} onChange={e => setQuickForm(p => ({ ...p, model: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="選填" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">定價（售價）</label>
                  <input type="number" value={quickForm.list_price} onChange={e => setQuickForm(p => ({ ...p, list_price: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center">
              <p className="text-xs text-gray-400">儲存後自動帶入品項</p>
              <div className="flex gap-2">
                <button onClick={() => setQuickAddIdx(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
                <button onClick={handleQuickAddProduct} disabled={quickSaving || !quickForm.product_name.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {quickSaving ? '新增中…' : '新增並帶入'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
