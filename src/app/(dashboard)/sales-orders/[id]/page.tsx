'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

const STATUS_OPTIONS = ['草稿', '已確認', '出貨中', '已完成', '取消']

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('sales_orders').select('*, clients(company_name)').eq('id', id).single(),
      supabase.from('sales_order_items').select('*').eq('order_id', id).order('seq_no'),
    ]).then(([oRes, iRes]) => {
      setOrder(oRes.data)
      setNotes(oRes.data?.notes ?? '')
      setStatus(oRes.data?.status ?? '草稿')
      setItems(iRes.data ?? [])
      setLoading(false)
    })
  }, [id])

  async function handleSave() {
    setSaving(true)
    await supabase.from('sales_orders').update({ notes, status }).eq('id', id)
    setSaving(false)
    alert('已儲存')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!order) return <div className="p-8 text-center text-red-500">找不到銷貨單</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold text-gray-900">{order.order_no}</h1>
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><div className="text-gray-500 text-xs mb-0.5">客戶</div><div>{order.clients?.company_name ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">案名</div><div>{order.project_name ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">聯絡人</div><div>{order.contact_name ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">電話</div><div>{order.client_phone ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">付款條件</div><div>{order.payment_terms ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">建立日期</div><div>{formatDate(order.created_at)}</div></div>
        </div>
      </div>

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
            <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>含稅總計</span><span className="text-green-700">{formatCurrency(order.total_amount)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">備註</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium disabled:opacity-60">
          {saving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </div>
  )
}
