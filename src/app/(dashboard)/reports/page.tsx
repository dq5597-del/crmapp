'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ClipboardList, Printer, Search, X, CheckSquare, Square } from 'lucide-react'

type ReportKey = 'statement' | 'sales' | 'receivable'

const REPORTS: { key: ReportKey; label: string; desc: string }[] = [
  { key: 'statement', label: '客戶對帳單', desc: '各單位銷貨與收款彙整，一單位一區塊' },
  { key: 'sales', label: '銷貨統計報表', desc: '期間內銷貨單明細與金額彙總' },
  { key: 'receivable', label: '應收帳款明細', desc: '未收與逾期款項、到期日' },
]

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function ReportsPage() {
  const supabase = createClient()
  const [report, setReport] = useState<ReportKey>('statement')
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(todayStr())
  const [clients, setClients] = useState<any[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [salesRows, setSalesRows] = useState<any[]>([])
  const [recvRows, setRecvRows] = useState<any[]>([])

  useEffect(() => {
    supabase.from('clients').select('id, company_name').order('company_name')
      .then(({ data }) => setClients(data ?? []))
  }, [])

  const filteredClients = clientSearch
    ? clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients

  const allFilteredSelected = filteredClients.length > 0 && filteredClients.every(c => selectedClients.includes(c.id))
  function toggleClient(id: string) {
    setSelectedClients(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const ids = filteredClients.map(c => c.id)
      setSelectedClients(s => s.filter(x => !ids.includes(x)))
    } else {
      setSelectedClients(s => Array.from(new Set([...s, ...filteredClients.map(c => c.id)])))
    }
  }

  const clientName = (id: string | null) => clients.find(c => c.id === id)?.company_name ?? '（未指定單位）'

  async function handleGenerate() {
    setLoading(true)
    setGenerated(false)
    const fromTs = dateFrom
    const toTs = dateTo + 'T23:59:59'

    const jobs: Promise<any>[] = []

    if (report === 'statement' || report === 'sales') {
      let q = supabase.from('sales_orders')
        .select('id, order_no, client_id, project_name, total_amount, status, created_at')
        .gte('created_at', fromTs).lte('created_at', toTs)
        .neq('status', '取消')
        .order('created_at', { ascending: true })
      if (selectedClients.length > 0) q = q.in('client_id', selectedClients)
      jobs.push(q.then(({ data }) => setSalesRows(data ?? [])))
    } else {
      setSalesRows([])
    }

    if (report === 'statement' || report === 'receivable') {
      let q = supabase.from('receivables')
        .select('id, receivable_no, client_id, invoice_no, invoice_date, due_date, amount, received_amount, balance, status, created_at')
        .neq('status', '作廢')
        .order('due_date', { ascending: true })
      if (report === 'receivable') {
        q = q.gt('balance', 0)
      } else {
        q = q.gte('created_at', fromTs).lte('created_at', toTs)
      }
      if (selectedClients.length > 0) q = q.in('client_id', selectedClients)
      jobs.push(q.then(({ data }) => setRecvRows(data ?? [])))
    } else {
      setRecvRows([])
    }

    await Promise.all(jobs)
    setLoading(false)
    setGenerated(true)
  }

  // 依單位分組（客戶對帳單用）
  const byClient = useMemo(() => {
    const ids = new Set<string>()
    salesRows.forEach(r => ids.add(r.client_id ?? ''))
    recvRows.forEach(r => ids.add(r.client_id ?? ''))
    return Array.from(ids).map(id => ({
      id,
      name: clientName(id || null),
      sales: salesRows.filter(r => (r.client_id ?? '') === id),
      recv: recvRows.filter(r => (r.client_id ?? '') === id),
    })).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  }, [salesRows, recvRows, clients])

  const salesTotal = salesRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const recvBalanceTotal = recvRows.reduce((s, r) => s + Number(r.balance || 0), 0)
  const reportLabel = REPORTS.find(r => r.key === report)?.label ?? ''
  const today = todayStr()

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; border: none !important; }
          aside, nav, header { display: none !important; }
          @page { margin: 12mm; }
          tr { break-inside: avoid; }
          .client-block { break-inside: avoid; }
        }
      `}</style>

      {/* ── 條件設定（列印時隱藏） ── */}
      <div className="no-print">
        <div className="flex items-center gap-3 mb-5">
          <ClipboardList size={22} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">各式報表</h1>
            <p className="text-sm text-gray-500 mt-0.5">設定條件後產生報表，即可直接列印</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 mb-5">
          {/* 報表類型 */}
          <div>
            <label className="text-xs text-gray-600 mb-1.5 block">報表類型</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {REPORTS.map(r => (
                <button key={r.key} onClick={() => { setReport(r.key); setGenerated(false) }}
                  className={`text-left p-3 rounded-xl border transition ${report === r.key ? 'border-blue-500 border-2 bg-blue-50/50' : 'border-gray-200 hover:border-blue-300'}`}>
                  <div className="text-sm font-medium text-gray-900">{r.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 日期區間 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">起始日期</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setGenerated(false) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">結束日期</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setGenerated(false) }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {report === 'receivable' && (
              <div className="col-span-2 flex items-end">
                <p className="text-xs text-gray-400 pb-2">應收明細列出「目前仍有未收餘額」的款項，日期區間不影響。</p>
              </div>
            )}
          </div>

          {/* 單位多選 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-600">
                單位（可多選；不選＝全部單位）
                {selectedClients.length > 0 && <span className="ml-2 text-blue-600 font-medium">已選 {selectedClients.length} 家</span>}
              </label>
              <div className="flex items-center gap-3">
                <button onClick={toggleAllFiltered} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  {allFilteredSelected ? <CheckSquare size={13} /> : <Square size={13} />} 全選（目前清單）
                </button>
                {selectedClients.length > 0 && (
                  <button onClick={() => setSelectedClients([])} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                    <X size={12} /> 清除
                  </button>
                )}
              </div>
            </div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="搜尋單位名稱..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="border border-gray-100 rounded-xl max-h-44 overflow-y-auto divide-y divide-gray-50">
              {filteredClients.map(c => (
                <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50/50 cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedClients.includes(c.id)} onChange={() => toggleClient(c.id)} className="accent-blue-600 w-4 h-4" />
                  <span className="text-gray-800">{c.company_name}</span>
                </label>
              ))}
              {filteredClients.length === 0 && <div className="px-3 py-3 text-sm text-gray-400">找不到單位</div>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={handleGenerate} disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {loading ? '產生中…' : '產生報表'}
            </button>
            <button onClick={() => window.print()} disabled={!generated}
              className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <Printer size={15} /> 列印
            </button>
          </div>
        </div>
      </div>

      {/* ── 報表內容（列印區） ── */}
      {generated && (
        <div className="print-area bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {/* 報表表頭 */}
          <div className="text-center mb-1">
            <div className="text-lg font-bold text-gray-900">光輝影音科技 — {reportLabel}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              期間：{formatDate(dateFrom)} ～ {formatDate(dateTo)}　列印日：{formatDate(today)}
              {selectedClients.length > 0 && `　單位：${selectedClients.length} 家`}
            </div>
          </div>

          {/* 客戶對帳單：依單位分組 */}
          {report === 'statement' && (
            byClient.length === 0 ? <p className="text-center text-gray-400 py-8 text-sm">此區間無資料</p> :
            byClient.map(g => {
              const st = g.sales.reduce((s, r) => s + Number(r.total_amount || 0), 0)
              const bal = g.recv.reduce((s, r) => s + Number(r.balance || 0), 0)
              return (
                <div key={g.id} className="client-block mt-5 border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-gray-900">{g.name}</div>
                    <div className="text-xs text-gray-500">銷貨合計 {formatCurrency(st)}　未收餘額 <span className={bal > 0 ? 'text-red-600 font-semibold' : ''}>{formatCurrency(bal)}</span></div>
                  </div>
                  {g.sales.length > 0 && (
                    <table className="w-full text-xs mb-2 border-collapse">
                      <thead><tr className="bg-gray-50 border-y border-gray-200">
                        <th className="text-left px-2 py-1.5 text-gray-500">銷貨單號</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">案名</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">日期</th>
                        <th className="text-center px-2 py-1.5 text-gray-500">狀態</th>
                        <th className="text-right px-2 py-1.5 text-gray-500">金額</th>
                      </tr></thead>
                      <tbody>
                        {g.sales.map(r => (
                          <tr key={r.id} className="border-b border-gray-50">
                            <td className="px-2 py-1.5">{r.order_no}</td>
                            <td className="px-2 py-1.5">{r.project_name ?? '—'}</td>
                            <td className="px-2 py-1.5">{formatDate(r.created_at)}</td>
                            <td className="px-2 py-1.5 text-center">{r.status}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(r.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {g.recv.length > 0 && (
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-gray-50 border-y border-gray-200">
                        <th className="text-left px-2 py-1.5 text-gray-500">應收單號</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">發票</th>
                        <th className="text-left px-2 py-1.5 text-gray-500">到期日</th>
                        <th className="text-right px-2 py-1.5 text-gray-500">應收</th>
                        <th className="text-right px-2 py-1.5 text-gray-500">已收</th>
                        <th className="text-right px-2 py-1.5 text-gray-500">未收餘額</th>
                      </tr></thead>
                      <tbody>
                        {g.recv.map(r => (
                          <tr key={r.id} className="border-b border-gray-50">
                            <td className="px-2 py-1.5">{r.receivable_no}</td>
                            <td className="px-2 py-1.5">{r.invoice_no ?? '—'}</td>
                            <td className="px-2 py-1.5">{r.due_date ? formatDate(r.due_date) : '—'}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(r.amount)}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(r.received_amount)}</td>
                            <td className={`px-2 py-1.5 text-right ${Number(r.balance) > 0 ? 'text-red-600 font-semibold' : ''}`}>{formatCurrency(r.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {g.sales.length === 0 && g.recv.length === 0 && <p className="text-xs text-gray-400">此區間無資料</p>}
                </div>
              )
            })
          )}

          {/* 銷貨統計 */}
          {report === 'sales' && (
            salesRows.length === 0 ? <p className="text-center text-gray-400 py-8 text-sm">此區間無銷貨單</p> : (
              <>
                <table className="w-full text-xs mt-4 border-collapse">
                  <thead><tr className="bg-gray-50 border-y border-gray-200">
                    <th className="text-left px-2 py-1.5 text-gray-500">銷貨單號</th>
                    <th className="text-left px-2 py-1.5 text-gray-500">單位名稱</th>
                    <th className="text-left px-2 py-1.5 text-gray-500">案名</th>
                    <th className="text-left px-2 py-1.5 text-gray-500">日期</th>
                    <th className="text-center px-2 py-1.5 text-gray-500">狀態</th>
                    <th className="text-right px-2 py-1.5 text-gray-500">金額</th>
                  </tr></thead>
                  <tbody>
                    {salesRows.map(r => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="px-2 py-1.5">{r.order_no}</td>
                        <td className="px-2 py-1.5">{clientName(r.client_id)}</td>
                        <td className="px-2 py-1.5">{r.project_name ?? '—'}</td>
                        <td className="px-2 py-1.5">{formatDate(r.created_at)}</td>
                        <td className="px-2 py-1.5 text-center">{r.status}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(r.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-gray-300 font-bold">
                    <td colSpan={5} className="px-2 py-2 text-right">合計（{salesRows.length} 筆）</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(salesTotal)}</td>
                  </tr></tfoot>
                </table>
              </>
            )
          )}

          {/* 應收帳款明細 */}
          {report === 'receivable' && (
            recvRows.length === 0 ? <p className="text-center text-gray-400 py-8 text-sm">目前沒有未收款項</p> : (
              <table className="w-full text-xs mt-4 border-collapse">
                <thead><tr className="bg-gray-50 border-y border-gray-200">
                  <th className="text-left px-2 py-1.5 text-gray-500">應收單號</th>
                  <th className="text-left px-2 py-1.5 text-gray-500">單位名稱</th>
                  <th className="text-left px-2 py-1.5 text-gray-500">發票</th>
                  <th className="text-left px-2 py-1.5 text-gray-500">到期日</th>
                  <th className="text-right px-2 py-1.5 text-gray-500">應收</th>
                  <th className="text-right px-2 py-1.5 text-gray-500">已收</th>
                  <th className="text-right px-2 py-1.5 text-gray-500">未收餘額</th>
                </tr></thead>
                <tbody>
                  {recvRows.map(r => {
                    const overdue = r.due_date && r.due_date < today && Number(r.balance) > 0
                    return (
                      <tr key={r.id} className={`border-b border-gray-50 ${overdue ? 'bg-red-50/60' : ''}`}>
                        <td className="px-2 py-1.5">{r.receivable_no}</td>
                        <td className="px-2 py-1.5">{clientName(r.client_id)}</td>
                        <td className="px-2 py-1.5">{r.invoice_no ?? '—'}</td>
                        <td className={`px-2 py-1.5 ${overdue ? 'text-red-600 font-semibold' : ''}`}>{r.due_date ? formatDate(r.due_date) : '—'}{overdue ? '（逾期）' : ''}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(r.amount)}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(r.received_amount)}</td>
                        <td className="px-2 py-1.5 text-right text-red-600 font-semibold">{formatCurrency(r.balance)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot><tr className="border-t-2 border-gray-300 font-bold">
                  <td colSpan={6} className="px-2 py-2 text-right">未收合計（{recvRows.length} 筆）</td>
                  <td className="px-2 py-2 text-right text-red-600">{formatCurrency(recvBalanceTotal)}</td>
                </tr></tfoot>
              </table>
            )
          )}
        </div>
      )}
    </div>
  )
}
