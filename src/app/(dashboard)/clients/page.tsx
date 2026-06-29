'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Client } from '@/types'
import { CLIENT_STATUS_COLORS, formatDate } from '@/lib/utils'
import { Plus, Search, Phone, MapPin, Calendar } from 'lucide-react'

const STATUS_OPTIONS = ['全部', '有需求', '規劃中', '服務未完成', '已完成', '暫緩']

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')

  useEffect(() => {
    fetchClients()
  }, [statusFilter])

  async function fetchClients() {
    setLoading(true)
    let q = supabase.from('clients').select('*').order('created_at', { ascending: false })
    if (statusFilter !== '全部') q = q.eq('status', statusFilter)
    const { data } = await q
    setClients(data ?? [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (c.phone?.includes(search) ?? false)
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">客戶資料</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 筆</p>
        </div>
        <Link
          href="/clients/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition"
        >
          <Plus size={16} />
          新增客戶
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋公司名稱、姓名、電話..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Client Grid */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>沒有符合的客戶</p>
          <Link href="/clients/new" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            新增第一筆客戶
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(client => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                    {client.company_name}
                  </h3>
                  <p className="text-gray-500 text-sm mt-0.5">{client.contact_name ?? '—'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg font-medium shrink-0 ml-2 ${CLIENT_STATUS_COLORS[client.status]}`}>
                  {client.status}
                </span>
              </div>

              <div className="space-y-1.5 text-sm text-gray-500">
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="shrink-0" />
                    <span className="truncate">{client.phone}</span>
                  </div>
                )}
                {client.address && (
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="shrink-0" />
                    <span className="truncate">{client.address}</span>
                  </div>
                )}
                {client.next_visit_date && (
                  <div className="flex items-center gap-2 text-orange-600">
                    <Calendar size={13} className="shrink-0" />
                    <span>應回訪：{formatDate(client.next_visit_date)}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
