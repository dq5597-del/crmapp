'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Plus, Trash2, RotateCcw } from 'lucide-react'

const STATUS_OPTIONS = ['草稿', '已確認', '出貨中', '已完成', '取消']

type Item = {
  id?: string
  seq_no: number
  product_name: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  item_notes: string
}

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [order, setOrder] = useState<any>(null)
  const [clients, setClients] = useState<any[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // editable fields
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

  useEffect(() => {
    Promise.all([
      supabase.from('sales_orders').select('*, clients(company_name)').eq('id', id).single(),
      supabase.from('sales_order_items').select('*').eq('order_id', id).order('seq_no'),
      supabase.from('clients').select('id, company_name').order('company_name'),
    ]).then(([oRes, iRes, cRes]) => {
      const o = oRes.data
      setOrder(o)
      setClientId(o?.client_id ?? '')
      setProjectName(o?.project_name ?? '')
      setContactName(o?.contact_name ?? '')
      setClientPhone(o?.client_phone ?? '')
      setDeliveryDate(o?.delivery_date ?? '')
      setDeliveryAddress(o?.delivery_address ?? '')
      setPaymentTerms(o?.payment_terms ?? '')
      setBankAccount(o?.bank_account ?? '')
      setStatus(o?.status ?? '草稿')
      setNotes(o?.notes ?? '')
      setItems(
        (iRes.data ?? []).map((i: any) => ({
          id: i.id,
          seq_no: i.seq_no,
          product_name: i.product_name ?? '',
          model: i.model ?? '',
          unit: i.unit ?? '台',
          quantity: i.quantity ?? 1,
          unit_price: i.unit_price ?? 0,
          item_notes: i.item_notes ?? '',
        }))
      )
      setClients(cRes.data ?? [])
      setLoading(false)
    })
  }, [id])

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const taxAmount = Math.round(subtotal * 0.05 * 100) / 100
  const totalAmount = subtotal + taxAmount

  function updateItem(idx: number, field: keyof Item, val: any) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  function addItem() {
    setItems(prev => [
      ...prev,
      { seq_no: prev.length + 1, product_name: '', model: '', unit: '台', quantity: 1, unit_price: 0, item_notes: '' },
    ])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Update order header + recalculated totals
      const { error: orderErr } = await supabase.from('sales_orders').update({
        client_id: clientId || null,
        project_name: projectName,
        contact_name: contactName,
        client_phone: clientPhone,
        delivery_date: deliveryDate || null,
        delivery_address: deliveryAddress,
        payment_terms: paymentTerms,
        bank_account: bankAccount,
        status,
        notes,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      }).eq('id', id)
      if (orderErr) throw orderErr

      // Replace all items (delete then re-insert)
      await supabase.from('sales_order_items').delete().eq('order_id', id)
      const validItems = items.filter(i => i.product_name.trim())
      if (validItems.length > 0) {
        const { error: itemErr } = await supabase.from('sales_order_items').insert(
          validItems.map((i, idx) => ({
            order_id: id,
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
      }

      // Refresh order to get updated data
      const { data: refreshed } = await supabase
        .from('sales_orders').select('*, clients(company_name)').eq('id', id).single()
      setOrder(refreshed)
      alert('已儲存')
    } catch (e: any) {
      alert('儲存失敗: ' + e.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!order) return <div className="p-8 text-center text-red-500">找不到銷貨單</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-900">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{order.order_no}</h1>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500">
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="flex-1" />
        <Link href={`/returns?ref_type=sales_order&ref_id=${id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50">
          <RotateCcw size={13} /> 建立退貨
        </Link>
      </div>

      {/* 基本資料 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">基本資料</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">客戶</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">選擇客戶</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">案名</label>
            <input value={projectName} onChange={e => setProjectName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
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
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">交貨地址</label>
            <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">銀行帳號</label>
            <input value={bankAccount} onChange={e => setBankAccount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
      </div>

      {/* 品項明細 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">品項明細</h2>
          <button onClick={addItem} className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
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
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-gray-400 text-xs">
                    尚無品項，點「加一行」新增
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 p-4 flex justify-end">
          <div className="space-y-1 text-sm min-w-[200px]">
            <div className="flex justify-between text-gray-600">
              <span>小計</span><span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>稅額（5%）</span><span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
              <span>含稅總計</span><span className="text-green-700">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 備註 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">備註</label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          placeholder="輸入備註..."
        />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </div>
  )
}
