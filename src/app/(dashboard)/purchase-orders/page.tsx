'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Search, Truck, Plus, Trash2 } from 'lucide-react'
import CopyDocButton from '@/components/CopyDocButton'

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已送出': 'bg-blue-100 text-blue-700',
  '已確認': 'bg-purple-100 text-purple-700',
  '已到貨': 'bg-green-100 text-green-700',
  '取消': 'bg-red-100 text-red-700',
}

export default function PurchaseOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadOrders()
    fetchMyRole()
  }, [])

  function loadOrders() {
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrders(data ?? []); setLoading(false) })
  }

  async function fetchMyRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    setIsAdmin((profile as any)?.role === 'admin')
  }

  const filtered = orders.filter(o =>
    o.order_no.includes(search) ||
    (o.vendor_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    if (selected.length === filtered.length) setSelected([])
    else setSelected(filtered.map(o => o.id))
  }

  async function handleDeleteOne(id: string, order_no: string) {
    if (!confirm(`確定刪除訂購單「${order_no}」？此操作無法復原。`)) return
    setDeleting(true)
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    setDeleting(false)
    if (error) { alert('刪除失敗：' + error.message); return }
    setSelected(prev => prev.filter(x => x !== id))
    loadOrders()
  }

  async function handleBatchDelete() {
    if (selected.length === 0) return
    if (!confirm(`確定刪除選取的 ${selected.length} 筆訂購單？此操作無法復原。`)) return
    setDeleting(true)
    const { error } = await supabase.from('purchase_orders').delete().in('id', selected)
    setDeleting(false)
    if (error) { alert('批次刪除失敗：' + error.message); return }
    setSelected([])
    loadOrders()
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Truck size={20} className="text-purple-600" />
        <h1 className="text-xl font-bold text-gray-900">訂購單</h1>
        <div className="flex-1" />
        {isAdmin && selected.length > 0 && (
          <button onClick={handleBatchDelete} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-red-200 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={13} /> 刪除選取的 {selected.length} 筆
          </button>
        )}
        <Link href="/purchase-orders/new"
          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium">
          <Plus size={15} /> 新增訂購單
        </Link>
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
                {isAdmin && (
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={filtered.length > 0 && selected.length === filtered.length}
                      onChange={toggleSelectAll} className="accent-purple-600 w-4 h-4" />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-gray-600 font-medium">訂購單號</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">客戶</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">含稅總計</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">建立日期</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">操作</th>
                {isAdmin && <th className="w-10 px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">沒有訂購單</td></tr>
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-purple-50 transition-colors">
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.includes(o.id)}
                          onChange={() => toggleSelect(o.id)} className="accent-purple-600 w-4 h-4" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link href={`/purchase-orders/${o.id}`} className="font-semibold text-purple-700 hover:underline">{o.order_no}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{o.vendor_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(o.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <CopyDocButton type="purchase-orders" id={o.id} title="複製此訂購單（單號重新產生、狀態回草稿）" />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDeleteOne(o.id, o.order_no)} disabled={deleting}
                          className="text-gray-300 hover:text-red-500 transition disabled:opacity-50">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
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
