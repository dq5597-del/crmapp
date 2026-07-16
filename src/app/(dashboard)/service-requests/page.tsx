'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ServiceRequest, ServiceStatus } from '@/types'
import { Plus, Search, Wrench, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import CopyDocButton from '@/components/CopyDocButton'
import RowDeleteButton from '@/components/RowDeleteButton'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<ServiceStatus, string> = {
  '待處理':       'bg-gray-100 text-gray-600',
  '處理中':       'bg-blue-100 text-blue-700',
  '報價中':       'bg-amber-100 text-amber-700',
  '等待客戶確認': 'bg-orange-100 text-orange-700',
  '維修中':       'bg-purple-100 text-purple-700',
  '已完成':       'bg-green-100 text-green-700',
  '收費中':       'bg-red-100 text-red-700',
  '已結案':       'bg-gray-100 text-gray-400',
}

const ALL_STATUSES: ServiceStatus[] = [
  '待處理','處理中','報價中','等待客戶確認','維修中','已完成','收費中','已結案'
]

export default function ServiceRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>('all')

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    setLoading(true)
    const { data } = await supabase
      .from('service_requests')
      .select('*, client:clients(company_name)')
      .order('created_at', { ascending: false })
    setRequests((data as ServiceRequest[]) ?? [])
    setLoading(false)
  }

  const filtered = requests.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.service_no.toLowerCase().includes(q) ||
      r.equipment_name.toLowerCase().includes(q) ||
      (r.client as any)?.company_name?.toLowerCase().includes(q) ||
      (r.equipment_model ?? '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  // KPIs
  const active = requests.filter(r => !r.is_closed).length
  const pending = requests.filter(r => r.status === '待處理').length
  const closed = requests.filter(r => r.is_closed).length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">叫修管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">設備報修、維修追蹤與結案管理</p>
        </div>
        <Link
          href="/service-requests/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          新增叫修單
        </Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Wrench size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{active}</p>
              <p className="text-xs text-gray-500">進行中</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pending}</p>
              <p className="text-xs text-gray-500">待處理</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{closed}</p>
              <p className="text-xs text-gray-500">已結案</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜尋單號、單位名稱、設備名稱..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              statusFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
          >
            全部 ({requests.length})
          </button>
          {ALL_STATUSES.map(s => {
            const count = requests.filter(r => r.status === s).length
            if (count === 0) return null
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
              >
                {s} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <AlertCircle size={32} className="mb-2 opacity-40" />
            <p className="text-sm">目前沒有叫修單</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">單號</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">單位名稱</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">設備</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">保固</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">維修方式</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">通報日</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">狀態</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/service-requests/${r.id}`} className="text-blue-600 hover:underline font-medium">
                      {r.service_no}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{(r.client as any)?.company_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.equipment_name}</div>
                    {r.equipment_model && <div className="text-xs text-gray-400">{r.equipment_model}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full',
                      r.warranty_status === '保固內' ? 'bg-green-100 text-green-700' :
                      r.warranty_status === '保固外' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-500')}>
                      {r.warranty_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.service_type}</td>
                  <td className="px-4 py-3 text-gray-500">{r.reported_date}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[r.status])}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <CopyDocButton type="service-requests" id={r.id} title="複製此叫修單（單號重新產生、狀態回待處理）" />
                    <RowDeleteButton
                      table="service_requests"
                      id={r.id}
                      label="叫修單"
                      confirmMessage={`確定刪除叫修單 ${r.service_no}？相關維修報價／送修資料將一併刪除，此動作無法復原。`}
                      onDeleted={id => setRequests(prev => prev.filter(x => x.id !== id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
