'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Inquiry, InquiryStatus } from '@/types'
import { Plus, Search, MessageSquareQuote } from 'lucide-react'
import { INQUIRY_STATUS_COLORS } from '@/components/inquiries/InquiryForm'

const FILTERS: ('全部' | InquiryStatus)[] = ['全部', '草稿', '已送出', '已回覆', '已結案']

export default function InquiriesPage() {
  const supabase = createClient()
  const [inquiries, setInquiries] = useState<(Inquiry & { items: { id: string; vendor_price: number | null }[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'全部' | InquiryStatus>('全部')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('inquiries')
      .select('*, items:inquiry_items(id, vendor_price)')
      .order('created_at', { ascending: false })
    setInquiries((data as any) ?? [])
    setLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]

  const filtered = inquiries
    .filter(q => filter === '全部' || q.status === filter)
    .filter(q =>
      q.inquiry_no.toLowerCase().includes(search.toLowerCase()) ||
      (q.vendor_name ?? '').toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">廠商詢價單</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 張</p>
        </div>
        <Link href="/inquiries/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增詢價單
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋單號、廠商..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquareQuote size={36} className="mx-auto mb-3 opacity-40" />
          尚無詢價單
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-4">單號</th>
                  <th className="text-left py-3 px-4">廠商</th>
                  <th className="text-left py-3 px-4">詢價日期</th>
                  <th className="text-left py-3 px-4">回覆期限</th>
                  <th className="text-right py-3 px-4">品項數</th>
                  <th className="text-right py-3 px-4">已回覆項數</th>
                  <th className="text-left py-3 px-4">狀態</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => {
                  const total = q.items?.length ?? 0
                  const replied = q.items?.filter(i => i.vendor_price != null).length ?? 0
                  const overdue = q.status === '已送出' && q.reply_deadline && q.reply_deadline < today
                  return (
                    <tr key={q.id} className={`border-b border-gray-50 last:border-0 hover:bg-blue-50/40 ${overdue ? 'bg-red-50/50' : ''}`}>
                      <td className="py-3 px-4">
                        <Link href={`/inquiries/${q.id}`} className="font-medium text-blue-600 hover:underline">{q.inquiry_no}</Link>
                      </td>
                      <td className="py-3 px-4 text-gray-900">{q.vendor_name ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-500">{q.inquiry_date ?? '—'}</td>
                      <td className={`py-3 px-4 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {q.reply_deadline ?? '—'}
                        {overdue && <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">逾期</span>}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700">{total}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{replied > 0 ? `${replied}/${total}` : '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${INQUIRY_STATUS_COLORS[q.status]}`}>{q.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
