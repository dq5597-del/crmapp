'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, RefreshCw, ShoppingBag, ExternalLink } from 'lucide-react'

const INVOICE_COLORS: Record<string, string> = {
  '未開立': 'bg-red-100 text-red-700',
  '已開立': 'bg-green-100 text-green-700',
  '已作廢': 'bg-gray-100 text-gray-400',
}

const SHIPPING_COLORS: Record<string, string> = {
  '待出貨': 'bg-yellow-100 text-yellow-700',
  '已出貨': 'bg-blue-100 text-blue-700',
  '已送達': 'bg-green-100 text-green-700',
}

const FILTERS = ['全部', '待開發票', '待出貨', '已完成']

export default function WebOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('全部')

  useEffect(() => { fetchOrders() }, [])

  async function fetchOrders() {
    const { data } = await supabase
      .from('web_orders')
      .select('*')
      .order('order_date', { ascending: false })
      .limit(300)
    setOrders(data ?? [])
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/web/orders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 90 }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json?.error ?? '同步失敗')
      } else {
        alert(`同步完成：新增 ${json.inserted} 筆、更新 ${json.updated} 筆`)
        await fetchOrders()
      }
    } catch {
      alert('同步失敗，請確認網路與 WooCommerce 設定')
    }
    setSyncing(false)
  }

  const pendingInvoice = orders.filter(o => o.invoice_status === '未開立').length
  const pendingShip = orders.filter(o => o.shipping_status === '待出貨').length
  const monthTotal = orders
    .filter(o => o.order_date && new Date(o.order_date).getMonth() === new Date().getMonth())
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

  const filtered = orders.filter(o => {
    if (filter === '待開發票' && o.invoice_status !== '未開立') return false
    if (filter === '待出貨' && o.shipping_status !== '待出貨') return false
    if (filter === '已完成' && !(o.invoice_status === '已開立' && o.shipping_status === '已送達')) return false

    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return [o.order_no, o.customer_name, o.customer_company, o.invoice_no, o.invoice_tax_id, o.tracking_no]
      .filter(Boolean)
      .some((v: string) => String(v).toLowerCase().includes(q))
  })

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">網路訂單</h1>
          <p className="text-sm text-gray-500 mt-0.5">自 av-shop.com 同步</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? '同步中…' : '同步訂單'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">待出貨</p>
          <p className="text-2xl font-semibold text-yellow-600">{pendingShip}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">待開發票</p>
          <p className="text-2xl font-semibold text-red-600">{pendingInvoice}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">本月訂單金額</p>
          <p className="text-2xl font-semibold text-gray-900">{formatCurrency(monthTotal)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋訂單編號、客戶、發票號碼、統編、宅配單號"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 h-11 sm:h-auto sm:py-2 rounded-lg text-sm whitespace-nowrap ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">載入中…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl py-14 text-center">
          <ShoppingBag size={28} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            {orders.length === 0 ? '尚未同步任何網路訂單，點右上角「同步訂單」開始。' : '沒有符合條件的訂單。'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="hidden sm:flex items-center gap-3 px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
            <span className="flex-1">訂單編號</span>
            <span className="w-32">客戶</span>
            <span className="w-24 text-right">金額</span>
            <span className="w-20 text-center">出貨</span>
            <span className="w-20 text-center">發票</span>
            <span className="w-8" />
          </div>

          {filtered.map(o => (
            <Link
              key={o.id}
              href={`/web-orders/${o.id}`}
              className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">#{o.order_no}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {o.order_date ? formatDate(o.order_date) : '—'}
                  {o.invoice_type === 'company' ? ' · 三聯式' : o.invoice_type ? ' · 二聯式' : ''}
                  {o.item_count ? ` · ${o.item_count} 件` : ''}
                </p>
              </div>

              <span className="w-32 text-sm text-gray-700 truncate">
                {o.customer_company || o.customer_name || '—'}
              </span>

              <span className="w-24 text-sm text-gray-900 text-right">{formatCurrency(Number(o.total) || 0)}</span>

              <span className="w-20 text-center">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${SHIPPING_COLORS[o.shipping_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {o.shipping_status ?? '—'}
                </span>
              </span>

              <span className="w-20 text-center">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${INVOICE_COLORS[o.invoice_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {o.invoice_status ?? '未開立'}
                </span>
              </span>

              <ExternalLink size={14} className="w-8 text-gray-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
