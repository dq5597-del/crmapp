'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import Link from 'next/link'

const STATUS_OPTIONS = ['草稿', '已送出', '已確認', '已到貨', '取消']

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ vendor_name: '', vendor_contact: '', vendor_phone: '', notes: '', status: '草稿', signer_name: '', signed_date: '' })

  useEffect(() => {
    Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('order_id', id).order('seq_no'),
    ]).then(([oRes, iRes]) => {
      if (oRes.data) {
        setOrder(oRes.data)
        setForm({ vendor_name: oRes.data.vendor_name ?? '', vendor_contact: oRes.data.vendor_contact ?? '', vendor_phone: oRes.data.vendor_phone ?? '', notes: oRes.data.notes ?? '', status: oRes.data.status ?? '草稿', signer_name: oRes.data.signer_name ?? '', signed_date: oRes.data.signed_date ?? '' })
      }
      setItems(iRes.data ?? [])
      setLoading(false)
    })
  }, [id])

  async function handleSave() {
    setSaving(true)
    await supabase.from('purchase_orders').update({ ...form, signed_date: form.signed_date || null }).eq('id', id)
    setSaving(false)
    alert('已儲存')
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
        <Link href={`/returns?ref_type=purchase_order&ref_id=${id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50">
          <RotateCcw size={13} /> 建立退貨
        </Link>
      </div>

      {/* 廠商資訊 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">廠商資訊</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">廠商名稱</label>
            <input value={form.vendor_name} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">廠商聯絡人</label>
            <input value={form.vendor_contact} onChange={e => setForm(p => ({ ...p, vendor_contact: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">廠商電話</label>
            <input value={form.vendor_phone} onChange={e => setForm(p => ({ ...p, vendor_phone: e.target.value }))} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">#</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">品名</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">規格</th>
                <th className="text-center px-3 py-3 text-gray-600 font-medium">數量</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">單價</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">金額</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 text-gray-400">{i.seq_no}</td>
                  <td className="px-4 py-3 font-medium">{i.product_name}</td>
                  <td className="px-4 py-3 text-gray-500">{i.model ?? '—'}</td>
                  <td className="px-3 py-3 text-center">{i.quantity} {i.unit}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(i.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(i.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 p-4 flex justify-end">
          <div className="space-y-1 text-sm min-w-[200px]">
            <div className="flex justify-between text-gray-600"><span>小計</span><span>{formatCurrency(order.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>稅額（5%）</span><span>{formatCurrency(order.tax_amount)}</span></div>
            <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>含稅總計</span><span className="text-purple-700">{formatCurrency(order.total_amount)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">備註</label>
        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className={inputClass + ' resize-none'} />
      </div>

      {/* 廠商簽名 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">廠商簽名確認</h2>
        <div className="border border-dashed border-gray-300 rounded-xl h-24 flex items-end px-4 pb-2 mb-4">
          <span className="text-xs text-gray-400">廠商簽名</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">簽署人姓名</label>
            <input value={form.signer_name} onChange={e => setForm(p => ({ ...p, signer_name: e.target.value }))}
              placeholder="廠商簽回後，由業務登錄簽署人姓名" className={inputClass} />
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
