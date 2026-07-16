'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Receivable } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, DollarSign, AlertCircle, CheckCircle, Clock, Printer } from 'lucide-react'
import RowDeleteButton from '@/components/RowDeleteButton'

const STATUS_COLORS: Record<string, string> = {
  '未收':     'bg-red-100 text-red-700',
  '部分收款': 'bg-yellow-100 text-yellow-700',
  '已收清':   'bg-green-100 text-green-700',
  '壞帳':     'bg-gray-100 text-gray-500',
  '已開立發票': 'bg-blue-100 text-blue-700',
}

const STATUS_OPTIONS = ['全部', '未收', '部分收款', '已收清', '壞帳', '已開立發票']

export default function ReceivablesPage() {
  const supabase = createClient()
  const [receivables, setReceivables] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    client_id: '',
    sales_order_id: '',
    invoice_no: '',
    invoice_date: '',
    due_date: '',
    amount: 0,
    payment_method: '',
    notes: '',
  })

  useEffect(() => {
    Promise.all([
      supabase.from('receivables').select('*, clients(company_name), sales_orders(order_no)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company_name').order('company_name'),
      supabase.from('sales_orders').select('id, order_no, total_amount, client_id, clients(company_name)').eq('status', '已確認').order('created_at', { ascending: false }),
    ]).then(([rRes, cRes, soRes]) => {
      setReceivables(rRes.data ?? [])
      setClients(cRes.data ?? [])
      setSalesOrders(soRes.data ?? [])
      setLoading(false)
    })
  }, [])

  async function fetchReceivables() {
    const { data } = await supabase.from('receivables').select('*, clients(company_name), sales_orders(order_no)').order('created_at', { ascending: false })
    setReceivables(data ?? [])
  }

  function onOrderSelect(orderId: string) {
    const o = salesOrders.find(s => s.id === orderId)
    if (o) {
      setForm(p => ({
        ...p,
        sales_order_id: orderId,
        client_id: o.client_id ?? '',
        amount: o.total_amount ?? 0,
      }))
    }
  }

  async function handleSave() {
    if (!form.amount || form.amount <= 0) { alert('請輸入應收金額'); return }
    setSaving(true)

    const res = await fetch('/api/receivables/generate-no')
    const { receivable_no } = await res.json()

    await supabase.from('receivables').insert({
      receivable_no,
      client_id: form.client_id || null,
      sales_order_id: form.sales_order_id || null,
      invoice_no: form.invoice_no || null,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      amount: form.amount,
      payment_method: form.payment_method || null,
      notes: form.notes || null,
      status: '未收',
    })

    setShowForm(false)
    setForm({ client_id: '', sales_order_id: '', invoice_no: '', invoice_date: '', due_date: '', amount: 0, payment_method: '', notes: '' })
    fetchReceivables()
    setSaving(false)
  }

  const filtered = receivables.filter(r => {
    const matchSearch = (r.receivable_no?.includes(search) ?? false) ||
      (r.clients?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (r.invoice_no?.includes(search) ?? false)
    const matchStatus = statusFilter === '全部' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  // KPI
  const totalAR = receivables.filter(r => r.status !== '已收清' && r.status !== '壞帳').reduce((sum, r) => sum + Number(r.balance), 0)
  const overdueCount = receivables.filter(r => r.status === '未收' && r.due_date && new Date(r.due_date) < new Date()).length
  const collectedThisMonth = receivables.filter(r => {
    if (r.status !== '已收清') return false
    const d = new Date(r.updated_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((sum, r) => sum + Number(r.received_amount), 0)

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <DollarSign size={20} className="text-green-600" />
          <h1 className="text-xl font-bold text-gray-900">應收帳款</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增應收
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-red-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">未收帳款總額</div>
          <div className="text-xl font-bold text-red-700">{formatCurrency(totalAR)}</div>
        </div>
        <div className="bg-orange-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">逾期未收</div>
          <div className="text-xl font-bold text-orange-700">{overdueCount} 筆</div>
        </div>
        <div className="bg-green-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">本月已收</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(collectedThisMonth)}</div>
        </div>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5 space-y-4">
          <div className="font-semibold text-blue-900">新增應收帳款</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">關聯銷貨單（選填）</label>
              <select value={form.sales_order_id} onChange={e => onOrderSelect(e.target.value)} className={inputClass}>
                <option value="">不選銷貨單（手動輸入）</option>
                {salesOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.order_no} — {o.clients?.company_name} — {formatCurrency(o.total_amount)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">單位名稱</label>
              <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={inputClass}>
                <option value="">請選擇</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">應收金額 *</label>
              <input type="number" min="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">發票號碼</label>
              <input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">開立日期</label>
              <input type="date" value={form.invoice_date} onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">應收日期（到期日）</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">付款方式</label>
              <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} className={inputClass}>
                <option value="">請選擇</option>
                <option>現金</option>
                <option>匯款</option>
                <option>票期</option>
                <option>信用卡</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs text-gray-600 mb-1 block">備註</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? '儲存中...' : '建立'}
            </button>
          </div>
        </div>
      )}

      {/* 篩選 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋單號、單位名稱、發票號碼..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-medium transition ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">單號</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">單位名稱</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">發票號碼</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">到期日</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">應收</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">已收</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">未收餘額</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">沒有應收帳款</td></tr>
              ) : (
                filtered.map(r => {
                  const isOverdue = r.status === '未收' && r.due_date && new Date(r.due_date) < new Date()
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-green-50 transition-colors ${isOverdue ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{r.receivable_no}</td>
                      <td className="px-4 py-3 text-gray-700">{r.clients?.company_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{r.invoice_no ?? '—'}</td>
                      <td className={`px-4 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {formatDate(r.due_date)}
                        {isOverdue && <span className="ml-1 text-xs">⚠️逾期</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatCurrency(r.received_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold">
                        <span className={r.balance > 0 ? 'text-red-600' : 'text-gray-400'}>
                          {formatCurrency(r.balance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <Link href={`/receivables/${r.id}`} className="text-xs text-blue-600 hover:underline">
                            收款
                          </Link>
                          <button onClick={() => window.open(`/receivables/${r.id}/print`, '_blank')}
                            title="列印／分享對帳單 PDF" className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                            <Printer size={14} />
                          </button>
                          <RowDeleteButton
                            table="receivables"
                            id={r.id}
                            label="應收帳款"
                            confirmMessage={`確定刪除應收帳款 ${r.receivable_no}？收款紀錄將一併刪除，此動作無法復原。`}
                            onDeleted={id => setReceivables(prev => prev.filter(x => x.id !== id))}
                            iconOnly
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-semibold text-gray-700 text-sm">合計</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(filtered.reduce((s, r) => s + Number(r.amount), 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(filtered.reduce((s, r) => s + Number(r.received_amount), 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">{formatCurrency(filtered.reduce((s, r) => s + Number(r.balance), 0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
