'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Client } from '@/types'
import { CLIENT_STATUS_COLORS, formatDate } from '@/lib/utils'
import { Plus, Search, Phone, MapPin, Calendar, Award } from 'lucide-react'

const STATUS_OPTIONS = ['全部', '有需求', '規劃中', '服務未完成', '已完成', '暫緩']
const TIER_OPTIONS = ['全部分級', '高價值', '中價值', '一般', '尚無交易']

// 顧客分級（依杜拉克「顧客創造」精神：用實際貢獻的營收排名分級，而非主觀認定）
const TIER_STYLES: Record<string, string> = {
  '高價值': 'bg-amber-100 text-amber-700 border-amber-200',
  '中價值': 'bg-blue-100 text-blue-700 border-blue-200',
  '一般':   'bg-gray-100 text-gray-600 border-gray-200',
  '尚無交易': 'bg-gray-50 text-gray-400 border-gray-100',
}

function computeTiers(revenueMap: Record<string, number>): Record<string, string> {
  const withRevenue = Object.entries(revenueMap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const tiers: Record<string, string> = {}
  withRevenue.forEach(([id], idx) => {
    const pct = (idx + 1) / withRevenue.length
    tiers[id] = pct <= 0.2 ? '高價值' : pct <= 0.5 ? '中價值' : '一般'
  })
  return tiers
}

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [tierFilter, setTierFilter] = useState('全部分級')
  const [revenueMap, setRevenueMap] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchClients()
  }, [statusFilter])

  useEffect(() => {
    fetchRevenue()
  }, [])

  async function fetchClients() {
    setLoading(true)
    let q = supabase.from('clients').select('*').order('created_at', { ascending: false })
    if (statusFilter !== '全部') q = q.eq('status', statusFilter)
    const { data } = await q
    setClients(data ?? [])
    setLoading(false)
  }

  async function fetchRevenue() {
    const { data } = await supabase.from('sales_orders').select('client_id, total_amount').neq('status', '取消')
    const map: Record<string, number> = {}
    ;(data ?? []).forEach((o: any) => {
      if (o.client_id) map[o.client_id] = (map[o.client_id] || 0) + Number(o.total_amount || 0)
    })
    setRevenueMap(map)
  }

  const tiers = computeTiers(revenueMap)
  const getTier = (clientId: string) => tiers[clientId] ?? '尚無交易'

  const filtered = clients.filter(c => {
    if (tierFilter !== '全部分級' && getTier(c.id) !== tierFilter) return false
    return c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (c.phone?.includes(search) ?? false)
  })

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

      {/* 顧客分級篩選 */}
      <div className="flex gap-2 flex-wrap mb-5">
        {TIER_OPTIONS.map(t => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              tierFilter === t
                ? 'bg-gray-900 text-white border-gray-900'
                : (TIER_STYLES[t] ?? 'bg-white border-gray-200 text-gray-600')
            }`}
          >
            {t !== '全部分級' && <Award size={11} />}
            {t}
          </button>
        ))}
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                      {client.company_name}
                    </h3>
                    {getTier(client.id) !== '尚無交易' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border shrink-0 ${TIER_STYLES[getTier(client.id)]}`}>
                        {getTier(client.id)}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-0.5">{client.contact_name ?? '—'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg font-medium shrink-0 ml-2 ${CLIENT_STATUS_COLORS[client.status]}`}>
                  {client.status}
                </span>
              </div>

              {revenueMap[client.id] > 0 && (
                <p className="text-xs text-gray-400 mb-2">累計成交：NT${revenueMap[client.id].toLocaleString()}</p>
              )}

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
