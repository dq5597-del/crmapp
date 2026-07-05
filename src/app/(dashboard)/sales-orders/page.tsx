'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, ShoppingCart, Plus, X, Trash2 } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已確認': 'bg-blue-100 text-blue-700',
  '出貨中': 'bg-orange-100 text-orange-700',
  '已完成': 'bg-green-100 text-green-700',
  '取消': 'bg-red-100 text-red-700',
}

const STATUS_OPTIONS = ['草稿', '已確認', '出貨中', '已完成', '取消']

type Item = {
  product_name: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  item_notes: string
}

const emptyItem = (): Item => ({
  product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_notes: '',
})

export default function SalesOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // form fields
  const [clientId, setClientId] = useState('')
  const [projectName, setProjectName] = useState('')
  const [contactName, setContactName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [status, setStatus] = useState('草稿')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([emptyItem()])

  useEffect(() => {
    Promise.all([
      supabase.from('sales_orders').select('*, clients(company_name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company_name').order('company_name'),
    ]).then(([ordersRes, clientsRes]) => {
      setOrders(ordersRes.data ?? [])
      setClients(clientsRes.data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = orders.filter(o =>
    (o.order_no ?? '').includes(search) ||
    (o.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (o.project_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  function resetForm() {
    setClientId(''); setProjectName(''); setContactName(''); setClientPhone('')
    setDeliveryDate(''); setDeliveryAddress(''); setPaymentTerms(''); setBankAccount('')
    setStatus('草稿'); setNotes(''); setItems([emptyItem()])
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
    if (!clientId) return alert('請選擇客戶')
    const validItems = items.filter(i => i.product_name.trim())
    if (validItems.length === 0) return alert('請至少填一筆品項')
    setSaving(true)
    try {
      const order_no = await generateOrderNo()
      const subtotal = validItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const tax_amount = Math.round(subtotal * 0.05 * 100) / 100
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
          product_name: i.product_name, model: i.model,
          unit: i.unit, quantity: i.quantity, unit_price: i.unit_price,
          item_notes: i.item_notes,
        }))
      )

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
  const tax = Math.round(subtotal * 0.05 * 100) / 100
  const total = subtotal + tax

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <ShoppingCart size={20} className="text-green-600" />
          <h1 className="text-xl font-bold text-gray-900">銷貨單</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> 新增銷貨單
        </button>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋單號、客戶..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">銷貨單號</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">客戶</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">案名</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">含稅總計</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">建立日期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">沒有銷貨單</td></tr>
              ) : filtered.map(o => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-green-50 transition-colors">
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
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">客戶 *</label>
                  <select value={clientId} onChange={e => setClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">選擇客戶</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
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
                  <label className="text-xs text-gray-500 mb-1 block">交貨地址</label>
                  <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">銀行帳號</label>
                  <input value={bankAccount} onChange={e => setBankAccount(e.target.value)}
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
                  <button onClick={addItem} className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
                    <Plus size={12} /> 加一行
                  </button>
                </div>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">品名 *</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">型號</th>
                        <th className="text-center px-2 py-2 text-gray-500 font-medium w-14">單位</th>
                        <th className="text-center px-2 py-2 text-gray-500 font-medium w-16">數量</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">單價</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium w-28">金額</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-2 py-1.5">
                            <input value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                              placeholder="品名" />
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
                          <td className="px-3 py-1.5 text-right font-semibold text-gray-800">
                            {formatCurrency(item.quantity * item.unit_price)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-2">
                  <div className="text-right space-y-0.5 text-xs min-w-[200px]">
                    <div className="flex justify-between text-gray-500"><span>小計</span><span>{formatCurrency(subtotal)}</span></div>
                    <div className="flex justify-between text-gray-500"><span>稅額（5%）</span><span>{formatCurrency(tax)}</span></div>
                    <div className="flex justify-between font-bold text-gray-900 border-t pt-0.5">
                      <span>含稅總計</span><span className="text-green-700">{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 備註 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">備註</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
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
    </div>
  )
}
