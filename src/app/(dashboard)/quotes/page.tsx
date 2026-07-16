'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Quote } from '@/types'
import { QUOTE_STATUS_COLORS, formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, FileText, Copy, Trash2 } from 'lucide-react'

const STATUS_OPTIONS = ['全部', '草稿', '已確認', '已轉銷貨單', '已轉訂購單', '作廢']

export default function QuotesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchQuotes() }, [statusFilter])

  async function handleCopy(e: React.MouseEvent, quoteId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (copyingId) return
    setCopyingId(quoteId)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '複製失敗')
      router.push(`/quotes/${data.id}`)   // 進入新複製單（草稿）編輯頁
    } catch (err: any) {
      alert(err.message ?? '複製失敗，請稍後再試')
      setCopyingId(null)
    }
  }

  async function fetchQuotes() {
    setLoading(true)
    let q = supabase
      .from('quotes')
      .select('*, clients(company_name)')
      .order('created_at', { ascending: false })
    if (statusFilter !== '全部') q = q.eq('status', statusFilter)
    const { data } = await q
    setQuotes(data ?? [])
    setSelected([])
    setLoading(false)
  }

  const filtered = quotes.filter(q =>
    q.quote_no.includes(search) ||
    (q.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (q.project_name?.toLowerCase() ?? '').includes(search.toLowerCase())
  )

  const allSelected = filtered.length > 0 && filtered.every(q => selected.includes(q.id))

  function toggleAll() {
    setSelected(allSelected ? [] : filtered.map(q => q.id))
  }

  function toggleOne(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function deleteWarning(targets: any[]): string {
    const converted = targets.filter(q => q.status === '已轉銷貨單' || q.status === '已轉訂購單')
    let msg = `確定刪除 ${targets.length} 張報價單？品項將一併刪除，此動作無法復原。`
    if (converted.length > 0) {
      msg += `\n\n注意：其中 ${converted.length} 張已轉銷貨單/訂購單，刪除後原單據仍保留，但會失去與報價單的連結。`
    }
    return msg
  }

  async function handleDeleteOne(e: React.MouseEvent, q: any) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(deleteWarning([q]))) return
    setDeleting(true)
    const { error } = await supabase.from('quotes').delete().eq('id', q.id)
    if (error) alert('刪除失敗：' + error.message)
    await fetchQuotes()
    setDeleting(false)
  }

  async function handleDeleteSelected() {
    const targets = filtered.filter(q => selected.includes(q.id))
    if (targets.length === 0) return
    if (!confirm(deleteWarning(targets))) return
    setDeleting(true)
    const { error } = await supabase.from('quotes').delete().in('id', targets.map(q => q.id))
    if (error) alert('刪除失敗：' + error.message)
    await fetchQuotes()
    setDeleting(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">報價單</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 筆</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              <Trash2 size={15} /> {deleting ? '刪除中…' : `刪除選取（${selected.length}）`}
            </button>
          )}
          <Link href="/quotes/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增報價單
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋報價單號、單位名稱、案名..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                  <th className="px-3 py-3 w-10 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-blue-600 w-4 h-4 align-middle" title="全選" />
                  </th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">報價單號</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">單位名稱</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">案名</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">含稅總計</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">建立日期</th>
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">沒有符合的報價單</td></tr>
                ) : (
                  filtered.map(q => (
                    <tr key={q.id} className={`border-b border-gray-50 transition-colors ${selected.includes(q.id) ? 'bg-blue-50/70' : 'hover:bg-blue-50'}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggleOne(q.id)} className="accent-blue-600 w-4 h-4 align-middle" />
                      </td>
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
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => handleCopy(e, q.id)}
                          disabled={copyingId === q.id}
                          title="複製此報價單（日期改今天、單號重新產生）"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 transition-colors"
                        >
                          <Copy size={13} />
                          {copyingId === q.id ? '複製中…' : '複製'}
                        </button>
                        <button
                          onClick={(e) => handleDeleteOne(e, q)}
                          disabled={deleting}
                          title="刪除此報價單"
                          className="ml-1.5 inline-flex items-center px-2 py-1.5 text-xs text-gray-400 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
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
