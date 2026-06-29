'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Quote } from '@/types'
import { QUOTE_STATUS_COLORS, formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, FileText } from 'lucide-react'

const STATUS_OPTIONS = ['全部', '草稿', '已確認', '已轉銷貨單', '已轉訂購單', '作廢']

export default function QuotesPage() {
  const supabase = createClient()
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')

  useEffect(() => { fetchQuotes() }, [statusFilter])

  async function fetchQuotes() {
    setLoading(true)
    let q = supabase
      .from('quotes')
      .select('*, clients(company_name)')
      .order('created_at', { ascending: false })
    if (statusFilter !== '全部') q = q.eq('status', statusFilter)
    const { data } = await q
    setQuotes(data ?? [])
    setLoading(false)
  }

  const filtered = quotes.filter(q =>
    q.quote_no.includes(search) ||
    (q.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (q.project_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">報價單</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 筆</p>
        </div>
        <Link href="/quotes/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增報價單
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋報價單號、客戶、案名..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-medium transition ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">報價單號</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">客戶</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">案名</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">含稅總計</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">建立日期</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">沒有符合的報價單</td></tr>
                ) : (
                  filtered.map(q => (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${q.id}`} className="font-semibold text-blue-700 hover:underline flex items-center gap-1.5">
                          <FileText size={14} className="text-blue-400" />
                          {q.quote_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{q.clients?.company_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{q.project_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(q.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${QUOTE_STATUS_COLORS[q.status]}`}>{q.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(q.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
