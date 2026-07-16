'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

type Item = {
  seq_no: number
  product_name: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  item_notes: string
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [salespeople, setSalespeople] = useState<any[]>([])

  const [vendorName, setVendorName] = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendors, setVendors] = useState<any[]>([])
  const [vendorSearch, setVendorSearch] = useState('')
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [creatingVendor, setCreatingVendor] = useState(false)
  const [salespersonId, setSalespersonId] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([
    { seq_no: 1, product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_notes: '' },
  ])

  useEffect(() => {
    supabase.from('user_profiles').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => setSalespeople(data ?? []))
    supabase.from('vendors').select('id, company_name, contact_name, phone').order('company_name')
      .then(({ data }) => setVendors(data ?? []))
  }, [])

  const filteredVendors = vendorSearch
    ? vendors.filter(v =>
        (v.company_name ?? '').toLowerCase().includes(vendorSearch.toLowerCase()) ||
        (v.contact_name ?? '').toLowerCase().includes(vendorSearch.toLowerCase())
      )
    : vendors

  function onVendorPick(v: any) {
    setVendorName(v.company_name)
    setVendorContact(v.contact_name ?? '')
    setVendorPhone(v.phone ?? '')
    setVendorSearch('')
    setShowVendorDropdown(false)
  }

  async function handleQuickCreateVendor(name: string) {
    const value = name.trim()
    if (!value || creatingVendor) return
    setCreatingVendor(true)
    const { data, error } = await supabase
      .from('vendors')
      .insert({ company_name: value })
      .select('id, company_name, contact_name, phone')
      .single()
    setCreatingVendor(false)
    if (error || !data) { alert('新增失敗: ' + (error?.message ?? '')); return }
    setVendors(prev =>
      [...prev, data].sort((a, b) => (a.company_name ?? '').localeCompare(b.company_name ?? '', 'zh-Hant'))
    )
    onVendorPick(data)
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const taxAmount = 0 // 系統價格含稅，不另加稅
  const totalAmount = subtotal + taxAmount

  function updateItem(idx: number, field: keyof Item, val: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function addItem() {
    setItems(prev => [...prev, { seq_no: prev.length + 1, product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_notes: '' }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!vendorName.trim()) { alert('請輸入單位名稱'); return }
    const validItems = items.filter(i => i.product_name.trim())
    if (validItems.length === 0) { alert('請至少新增一項品項'); return }

    setSaving(true)
    try {
      const today = new Date()
      const yy = String(today.getFullYear()).slice(2)
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const { count } = await supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).like('order_no', `PO-${yy}${mm}${dd}%`)
      const seq = String((count ?? 0) + 1).padStart(3, '0')
      const order_no = `PO-${yy}${mm}${dd}-${seq}`

      const { data: newOrder, error: orderErr } = await supabase.from('purchase_orders').insert({
        order_no,
        vendor_name: vendorName,
        vendor_contact: vendorContact,
        vendor_phone: vendorPhone,
        salesperson_id: salespersonId || null,
        payment_terms: paymentTerms,
        notes,
        subtotal, tax_amount: taxAmount, total_amount: totalAmount,
        status: '草稿',
      }).select('id').single()
      if (orderErr) throw orderErr

      const { error: itemErr } = await supabase.from('purchase_order_items').insert(
        validItems.map((i, idx) => ({
          order_id: newOrder.id,
          seq_no: idx + 1,
          product_name: i.product_name,
          model: i.model,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unit_price,
          item_notes: i.item_notes,
        }))
      )
      if (itemErr) throw itemErr

      router.push(`/purchase-orders/${newOrder.id}`)
    } catch (e: any) {
      alert('建立失敗：' + e.message)
      setSaving(false)
    }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/purchase-orders" className="text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-gray-900">新增訂購單</h1>
      </div>

      {/* 客戶資訊 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">單位資訊</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <label className="text-xs text-gray-600 mb-1 block">單位名稱</label>
            <input
              value={vendorSearch || vendorName}
              onChange={e => {
                setVendorSearch(e.target.value)
                setVendorName(e.target.value)
                setShowVendorDropdown(true)
              }}
              onFocus={() => setShowVendorDropdown(true)}
              onBlur={() => setTimeout(() => setShowVendorDropdown(false), 150)}
              className={inputClass}
              placeholder="輸入搜尋或新增單位名稱"
              autoComplete="off"
            />
            {showVendorDropdown && (
              <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
                {filteredVendors.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onMouseDown={() => onVendorPick(v)}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-purple-50 flex flex-col border-b border-gray-50 last:border-0"
                  >
                    <span className="font-medium text-gray-900">{v.company_name}</span>
                    {v.contact_name && <span className="text-xs text-gray-400">{v.contact_name}</span>}
                  </button>
                ))}
                {vendorSearch.trim() && !vendors.some(v => v.company_name === vendorSearch.trim()) && (
                  <button
                    type="button"
                    onMouseDown={() => handleQuickCreateVendor(vendorSearch)}
                    className="w-full px-3 py-2 text-sm text-left text-purple-600 hover:bg-purple-50 flex items-center gap-1.5 border-t border-gray-100"
                  >
                    <Plus size={14} />
                    {creatingVendor ? '新增中…' : `新增單位名稱「${vendorSearch.trim()}」`}
                  </button>
                )}
                {filteredVendors.length === 0 && !vendorSearch.trim() && (
                  <div className="px-3 py-2 text-sm text-gray-400">無單位名稱資料</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">單位聯絡人</label>
            <input value={vendorContact} onChange={e => setVendorContact(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">單位電話</label>
            <input value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">業務員</label>
            <select value={salespersonId} onChange={e => setSalespersonId(e.target.value)} className={inputClass}>
              <option value="">— 未指定 —</option>
              {salespeople.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">付款條件</label>
            <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className={inputClass} placeholder="30天月結" />
          </div>
        </div>
      </div>

      {/* 品項明細 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">品項明細</h2>
          <button onClick={addItem} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
            <Plus size={12} /> 加一行
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-gray-500 font-medium w-8">#</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">品名</th>
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
                  <td className="px-3 py-1.5 text-gray-400">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <input value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                      placeholder="品名" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.model} onChange={e => updateItem(idx, 'model', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                      className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min={0} value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-400" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min={0} value={item.unit_price}
                      onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-28 px-2 py-1 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-purple-400" />
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
              {items.length === 0 && (
                <tr><td colSpan={8} className="text-center py-6 text-gray-400 text-xs">尚無品項，點「加一行」新增</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 p-4 flex justify-end">
          <div className="space-y-1 text-sm min-w-[200px]">
            <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>含稅總計</span><span className="text-purple-700">{formatCurrency(totalAmount)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">備註</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputClass + ' resize-none'} />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-60">
          {saving ? '建立中...' : '建立訂購單'}
        </button>
      </div>
    </div>
  )
}
