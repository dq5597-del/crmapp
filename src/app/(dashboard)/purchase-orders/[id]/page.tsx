'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, RotateCcw, FileDown, Plus, Trash2, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { ensureReceivableForSalesOrder } from '@/lib/auto-ledger'

const STATUS_OPTIONS = ['草稿', '已送出', '已確認', '已到貨', '取消']

type Item = {
  id?: string
  seq_no: number
  product_id?: string | null
  product_name: string
  model: string
  unit: string
  quantity: number
  unit_price: number
  item_notes: string
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [form, setForm] = useState({ vendor_name: '', vendor_contact: '', vendor_phone: '', notes: '', status: '草稿', signer_name: '', signed_date: '', salesperson_id: '' })
  const [salespeople, setSalespeople] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('order_id', id).order('seq_no'),
      supabase.from('user_profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]).then(([oRes, iRes, spRes]) => {
      if (oRes.data) {
        setOrder(oRes.data)
        setForm({ vendor_name: oRes.data.vendor_name ?? '', vendor_contact: oRes.data.vendor_contact ?? '', vendor_phone: oRes.data.vendor_phone ?? '', notes: oRes.data.notes ?? '', status: oRes.data.status ?? '草稿', signer_name: oRes.data.signer_name ?? '', signed_date: oRes.data.signed_date ?? '', salesperson_id: oRes.data.salesperson_id ?? '' })
      }
      setItems(
        (iRes.data ?? []).map((i: any) => ({
          id: i.id,
          seq_no: i.seq_no,
          product_id: i.product_id ?? null,
          product_name: i.product_name ?? '',
          model: i.model ?? '',
          unit: i.unit ?? '台',
          quantity: i.quantity ?? 1,
          unit_price: i.unit_price ?? 0,
          item_notes: i.item_notes ?? '',
        }))
      )
      setSalespeople(spRes.data ?? [])
      setLoading(false)
    })
    fetchMyRole()
  }, [id])

  async function fetchMyRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    setIsAdmin((profile as any)?.role === 'admin')
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

  // 訂購單 → 轉銷貨單（客戶確認下訂後）
  const [converting, setConverting] = useState(false)
  async function handleToSalesOrder() {
    if (!confirm('將此訂購單轉為銷貨單？（品項會複製過去，銷貨單狀態為已確認並自動產生應收）')) return
    setConverting(true)
    try {
      const d = new Date()
      const yy = String(d.getFullYear()).slice(2)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const prefix = `SO-${yy}${mm}${dd}-`
      const { data: last } = await supabase.from('sales_orders').select('order_no').like('order_no', `${prefix}%`).order('order_no', { ascending: false }).limit(1)
      const seq = last?.[0]?.order_no ? parseInt(last[0].order_no.split('-').pop() ?? '0') + 1 : 1
      const order_no = `${prefix}${String(seq).padStart(3, '0')}`

      // 用單位名稱對應客戶檔
      const { data: c } = await supabase.from('clients').select('id').eq('company_name', form.vendor_name).limit(1)

      const { data: so, error } = await supabase.from('sales_orders').insert({
        order_no,
        client_id: c?.[0]?.id ?? null,
        contact_name: form.vendor_contact || null,
        client_phone: form.vendor_phone || null,
        payment_terms: (order as any)?.payment_terms ?? null,
        subtotal, tax_amount: taxAmount, total_amount: totalAmount,
        status: '已確認',
        notes: `由訂購單 ${order?.order_no} 轉入`,
        salesperson_id: form.salesperson_id || null,
      }).select('id').single()
      if (error || !so) throw error ?? new Error('轉換失敗')

      const validItems = items.filter(i => i.product_name.trim())
      if (validItems.length > 0) {
        await supabase.from('sales_order_items').insert(
          validItems.map((i, idx) => ({
            order_id: so.id, seq_no: idx + 1,
            product_id: i.product_id ?? null,
            product_name: i.product_name, model: i.model,
            unit: i.unit, quantity: i.quantity, unit_price: i.unit_price,
            item_notes: i.item_notes,
          }))
        )
      }
      await ensureReceivableForSalesOrder(supabase, so.id, '已確認')
      alert('已轉為銷貨單並自動產生應收帳款。')
      router.push(`/sales-orders/${so.id}`)
    } catch (e: any) {
      alert('轉銷貨單失敗：' + (e?.message ?? ''))
    } finally {
      setConverting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { error: orderErr } = await supabase.from('purchase_orders').update({
        ...form,
        signed_date: form.signed_date || null,
        salesperson_id: form.salesperson_id || null,
        subtotal, tax_amount: taxAmount, total_amount: totalAmount,
      }).eq('id', id)
      if (orderErr) throw orderErr

      await supabase.from('purchase_order_items').delete().eq('order_id', id)
      const validItems = items.filter(i => i.product_name.trim())
      if (validItems.length > 0) {
        const { error: itemErr } = await supabase.from('purchase_order_items').insert(
          validItems.map((i, idx) => ({
            order_id: id,
            seq_no: idx + 1,
            product_id: i.product_id ?? null,
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

      // 訂購單為客戶端單據，不產生應付／入庫（進貨請用「進貨單」）

      const { data: refreshed } = await supabase.from('purchase_orders').select('*').eq('id', id).single()
      setOrder(refreshed)
      alert('已儲存')
    } catch (e: any) {
      alert('儲存失敗：' + e.message)
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`確定刪除訂購單「${order.order_no}」？此操作無法復原。`)) return
    setDeleting(true)
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    setDeleting(false)
    if (error) { alert('刪除失敗：' + error.message); return }
    router.push('/purchase-orders')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!order) return <div className="p-8 text-center text-red-500">找不到訂購單</div>

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">{order.order_no}</h1>
        <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={handleToSalesOrder} disabled={converting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50">
          <ShoppingCart size={13} /> {converting ? '轉換中…' : '轉銷貨單'}
        </button>
        <button
          onClick={() => window.open(`/purchase-orders/${id}/print`, '_blank')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
          <FileDown size={13} /> 列印 / PDF
        </button>
        <Link href={`/returns?ref_type=purchase_order&ref_id=${id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50">
          <RotateCcw size={13} /> 建立退貨
        </Link>
        {isAdmin && (
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={13} /> {deleting ? '刪除中...' : '刪除訂購單'}
          </button>
        )}
      </div>

      {/* 客戶資訊 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">單位資訊</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">單位名稱</label>
            <input value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">單位聯絡人</label>
            <input value={form.vendor_contact} onChange={e => setForm(p => ({ ...p, vendor_contact: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">單位電話</label>
            <input value={form.vendor_phone} onChange={e => setForm(p => ({ ...p, vendor_phone: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">業務員</label>
            <select value={form.salesperson_id} onChange={e => setForm(p => ({ ...p, salesperson_id: e.target.value }))} className={inputClass}>
              <option value="">— 未指定 —</option>
              {salespeople.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
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
        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className={inputClass + ' resize-none'} />
      </div>

      {/* 客戶簽名 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">單位簽名確認</h2>
        <div className="border border-dashed border-gray-300 rounded-xl h-24 flex items-end px-4 pb-2 mb-4">
          <span className="text-xs text-gray-400">單位簽名</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">簽署人姓名</label>
            <input value={form.signer_name} onChange={e => setForm(p => ({ ...p, signer_name: e.target.value }))}
              placeholder="單位簽回後，由業務登錄簽署人姓名" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">簽署日期</label>
            <input type="date" value={form.signed_date} onChange={e => setForm(p => ({ ...p, signed_date: e.target.value }))} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-60">
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </div>
  )
}
