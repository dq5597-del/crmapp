'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, ShoppingCart } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已確認': 'bg-blue-100 text-blue-700',
  '出貨中': 'bg-orange-100 text-orange-700',
  '已完成': 'bg-green-100 text-green-700',
  '取消': 'bg-red-100 text-red-700',
}

export default function SalesOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('sales_orders').select('*, clients(company_name)').order('created_at', { ascending: false })
      .then(({ data }) => { setOrders(data ?? []); setLoading(false) })
  }, [])

  const filtered = orders.filter(o =>
    o.order_no.includes(search) ||
    (o.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (o.project_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <ShoppingCart size={20} className="text-green-600" />
        <h1 className="text-xl font-bold text-gray-900">銷貨單</h1>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋單號、客戶..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-green-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/sales-orders/${o.id}`} className="font-semibold text-green-700 hover:underline">{o.order_no}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{o.clients?.company_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{o.project_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(o.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
