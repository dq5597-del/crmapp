'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Quote, QuoteItem } from '@/types'
import { QUOTE_STATUS_COLORS, formatDate, formatCurrency } from '@/lib/utils'
import QuoteForm from '@/components/quotes/QuoteForm'
import {
  ArrowLeft, Edit2, Send, Copy, ShoppingCart, Truck, FileDown, CheckCircle, XCircle
} from 'lucide-react'

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [items, setItems] = useState<QuoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [qRes, iRes] = await Promise.all([
      supabase.from('quotes').select('*, clients(company_name, phone)').eq('id', id).single(),
      supabase.from('quote_items').select('*, products(catalog_url, manual_url)').eq('quote_id', id).order('seq_no'),
    ])
    setQuote(qRes.data)
    setItems(iRes.data ?? [])
    setLoading(false)
  }

  // 分享報價單（寄到老闆信箱）
  async function handleShare() {
    if (!quote) return
    setActionLoading('share')
    const hasCatalog = items.some(i => i.provide_catalog || i.provide_manual)
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_no: quote.quote_no,
        client_name: (quote as any).clients?.company_name ?? '—',
        total_amount: quote.total_amount,
        pdf_url: quote.pdf_url,
        has_catalog: hasCatalog,
      }),
    })
    alert('✅ 已寄送到您的信箱，請確認後轉寄給客戶')
    setActionLoading('')
  }

  // 複製為新報價單
  async function handleCopy() {
    if (!quote) return
    setActionLoading('copy')
    const res = await fetch('/api/quotes/generate-no')
    const { quote_no } = await res.json()

    const { data: newQuote } = await supabase.from('quotes').insert({
      quote_no,
      client_id: quote.client_id,
      project_name: quote.project_name,
      contact_name: quote.contact_name,
      client_phone: quote.client_phone,
      valid_until: quote.valid_until,
      delivery_days: quote.delivery_days,
      payment_terms: quote.payment_terms,
      bank_account: quote.bank_account,
      notes: quote.notes,
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      status: '草稿',
      source_quote_id: quote.id,
    }).select('id').single()

    if (newQuote) {
      const newItems = items.map(i => ({
        quote_id: newQuote.id,
        seq_no: i.seq_no,
        product_id: i.product_id,
        product_name: i.product_name,
        model: i.model,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unit_price,
        provide_catalog: i.provide_catalog,
        provide_manual: i.provide_manual,
        item_notes: i.item_notes,
      }))
      await supabase.from('quote_items').insert(newItems)
      router.push(`/quotes/${newQuote.id}`)
    }
    setActionLoading('')
  }

  // 轉銷貨單
  async function handleToSalesOrder() {
    if (!quote || quote.status !== '已確認') {
      alert('只有「已確認」的報價單才能轉換為銷貨單')
      return
    }
    setActionLoading('sales')
    const res = await fetch('/api/quotes/generate-no')  // reuse for order no idea
    const prefix = 'SO'
    const today = new Date()
    const yy = String(today.getFullYear()).slice(2)
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')

    const { count } = await supabase.from('sales_orders').select('id', { count: 'exact', head: true }).like('order_no', `${prefix}-${yy}${mm}${dd}%`)
    const seq = String((count ?? 0) + 1).padStart(3, '0')
    const order_no = `${prefix}-${yy}${mm}${dd}-${seq}`

    const { data: newOrder } = await supabase.from('sales_orders').insert({
      order_no,
      quote_id: quote.id,
      client_id: quote.client_id,
      project_name: quote.project_name,
      contact_name: quote.contact_name,
      client_phone: quote.client_phone,
      payment_terms: quote.payment_terms,
      bank_account: quote.bank_account,
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      notes: quote.notes,
      status: '草稿',
    }).select('id').single()

    if (newOrder) {
      const orderItems = items.map(i => ({
        order_id: newOrder.id,
        seq_no: i.seq_no,
        product_id: i.product_id,
        product_name: i.product_name,
        model: i.model,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unit_price,
        item_notes: i.item_notes,
      }))
      await supabase.from('sales_order_items').insert(orderItems)
      await supabase.from('quotes').update({ status: '已轉銷貨單' }).eq('id', quote.id)
      router.push(`/sales-orders/${newOrder.id}`)
    }
    setActionLoading('')
  }

  // 轉訂購單
  async function handleToPurchaseOrder() {
    if (!quote || quote.status !== '已確認') {
      alert('只有「已確認」的報價單才能轉換為訂購單')
      return
    }
    setActionLoading('purchase')
    const today = new Date()
    const yy = String(today.getFullYear()).slice(2)
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')

    const { count } = await supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).like('order_no', `PO-${yy}${mm}${dd}%`)
    const seq = String((count ?? 0) + 1).padStart(3, '0')
    const order_no = `PO-${yy}${mm}${dd}-${seq}`

    const { data: newOrder } = await supabase.from('purchase_orders').insert({
      order_no,
      quote_id: quote.id,
      vendor_name: '',
      payment_terms: quote.payment_terms,
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      notes: quote.notes,
      status: '草稿',
    }).select('id').single()

    if (newOrder) {
      const orderItems = items.map(i => ({
        order_id: newOrder.id,
        seq_no: i.seq_no,
        product_id: i.product_id,
        product_name: i.product_name,
        model: i.model,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unit_price,
        item_notes: i.item_notes,
      }))
      await supabase.from('purchase_order_items').insert(orderItems)
      await supabase.from('quotes').update({ status: '已轉訂購單' }).eq('id', quote.id)
      router.push(`/purchase-orders/${newOrder.id}`)
    }
    setActionLoading('')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!quote) return <div className="p-8 text-center text-red-500">找不到報價單</div>

  if (editing) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></button>
          <h1 className="text-xl font-bold text-gray-900">編輯報價單 {quote.quote_no}</h1>
        </div>
        <QuoteForm
          initialQuote={quote}
          initialItems={items}
          onSuccess={() => { setEditing(false); fetchData() }}
        />
      </div>
    )
  }

  const clientName = (quote as any).clients?.company_name ?? '—'

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-900 mt-1"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{quote.quote_no}</h1>
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${QUOTE_STATUS_COLORS[quote.status]}`}>{quote.status}</span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{clientName} · {quote.project_name ?? '無案名'}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium text-gray-700">
          <Edit2 size={14} /> 編輯
        </button>
        <button
          onClick={() => window.open(`/quotes/${id}/print`, '_blank')}
          className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium text-gray-700"
        >
          <FileDown size={14} /> 匯出 PDF
        </button>
        <button onClick={handleShare} disabled={actionLoading === 'share'} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
          <Send size={14} /> {actionLoading === 'share' ? '寄送中...' : '分享報價單'}
        </button>
        <button onClick={handleCopy} disabled={actionLoading === 'copy'} className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium text-gray-700">
          <Copy size={14} /> {actionLoading === 'copy' ? '複製中...' : '複製報價單'}
        </button>
        {quote.status === '已確認' && (
          <>
            <button onClick={handleToSalesOrder} disabled={actionLoading === 'sales'} className="flex items-center gap-1.5 border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-2 rounded-xl text-sm font-medium">
              <ShoppingCart size={14} /> {actionLoading === 'sales' ? '轉換中...' : '轉銷貨單'}
            </button>
            <button onClick={handleToPurchaseOrder} disabled={actionLoading === 'purchase'} className="flex items-center gap-1.5 border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-2 rounded-xl text-sm font-medium">
              <Truck size={14} /> {actionLoading === 'purchase' ? '轉換中...' : '轉訂購單'}
            </button>
          </>
        )}
      </div>

      {/* Quote info */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><div className="text-gray-500 text-xs mb-0.5">客戶</div><div className="font-medium">{clientName}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">案名</div><div>{quote.project_name ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">聯絡人</div><div>{quote.contact_name ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">電話</div><div>{quote.client_phone ?? '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">有效期限</div><div>{formatDate(quote.valid_until)}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">交貨工期</div><div>{quote.delivery_days ? `${quote.delivery_days} 天` : '—'}</div></div>
          <div><div className="text-gray-500 text-xs mb-0.5">付款條件</div><div>{quote.payment_terms ?? '—'}</div></div>
          <div className="sm:col-span-2"><div className="text-gray-500 text-xs mb-0.5">匯款帳號</div><div>{quote.bank_account ?? '—'}</div></div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium w-8">#</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">品名</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">規格型號</th>
                <th className="text-center px-3 py-3 text-gray-600 font-medium">數量</th>
                <th className="text-center px-3 py-3 text-gray-600 font-medium">單位</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">單價</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">金額</th>
                <th className="text-center px-3 py-3 text-gray-600 font-medium">型錄</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">備註</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 text-gray-400">{item.seq_no}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.product_name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.model ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-gray-700">{item.quantity}</td>
                  <td className="px-3 py-3 text-center text-gray-500">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(item.amount)}</td>
                  <td className="px-3 py-3 text-center text-xs text-gray-500">
                    {item.provide_catalog && '型錄'}
                    {item.provide_catalog && item.provide_manual && ' / '}
                    {item.provide_manual && '說明書'}
                    {!item.provide_catalog && !item.provide_manual && '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.item_notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 p-4 flex justify-end">
          <div className="space-y-1 text-sm min-w-[220px]">
            <div className="flex justify-between font-bold text-base text-gray-900">
              <span>含稅總金額</span>
              <span className="text-blue-700">{formatCurrency(quote.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">備註</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</div>
        </div>
      )}
    </div>
  )
}
