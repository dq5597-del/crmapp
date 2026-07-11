'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Search, Receipt, Printer } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  '未付':     'bg-red-100 text-red-700',
  '部分付款': 'bg-yellow-100 text-yellow-700',
  '已付清':   'bg-green-100 text-green-700',
  '作廢':     'bg-gray-100 text-gray-400',
}

const STATUS_OPTIONS = ['全部', '未付', '部分付款', '已付清', '作廢']

export default function PayablesPage() {
  const supabase = createClient()
  const [payables, setPayables] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('全部')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    vendor_id: '',
    purchase_order_id: '',
    invoice_no: '',
    invoice_date: '',
    due_date: '',
    amount: 0,
    payment_method: '',
    notes: '',
  })

  useEffect(() => {
    Promise.all([
      supabase.from('payables')
        .select('*, vendors(company_name), purchase_orders(order_no)')
        .order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, company_name').eq('is_active', true).order('company_name'),
      supabase.from('purchase_orders').select('id, order_no, total_amount, vendor_id, vendor_name')
        .order('created_at', { ascending: false }),
    ]).then(([pRes, vRes, poRes]) => {
      setPayables(pRes.data ?? [])
      setVendors(vRes.data ?? [])
      setPurchaseOrders(poRes.data ?? [])
      setLoading(false)
    })
  }, [])

  async function fetchPayables() {
    const { data } = await supabase.from('payables')
      .select('*, vendors(company_name), purchase_orders(order_no)')
      .order('created_at', { ascending: false })
    setPayables(data ?? [])
  }

  function onOrderSelect(orderId: string) {
    const o = purchaseOrders.find(p => p.id === orderId)
    if (o) {
      setForm(prev => ({
        ...prev,
        purchase_order_id: orderId,
        vendor_id: o.vendor_id ?? prev.vendor_id,
        amount: o.total_amount ?? 0,
      }))
    }
  }

  async function handleSave() {
    if (!form.amount || form.amount <= 0) { alert('請輸入應付金額'); return }
    setSaving(true)

    const res = await fetch('/api/payables/generate-no')
    const { payable_no } = await res.json()

    await supabase.from('payables').insert({
      payable_no,
      vendor_id: form.vendor_id || null,
      purchase_order_id: form.purchase_order_id || null,
      invoice_no: form.invoice_no || null,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      amount: form.amount,
      payment_method: form.payment_method || null,
      notes: form.notes || null,
      status: '未付',
    })

    setShowForm(false)
    setForm({ vendor_id: '', purchase_order_id: '', invoice_no: '', invoice_date: '', due_date: '', amount: 0, payment_method: '', notes: '' })
    fetchPayables()
    setSaving(false)
  }

  const filtered = payables.filter(p => {
    const matchSearch =
      (p.payable_no?.includes(search) ?? false) ||
      (p.vendors?.company_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (p.invoice_no?.includes(search) ?? false)
    const matchStatus = statusFilter === '全部' || p.status === statusFilter
    return matchSearch && matchStatus
  })

  // KPI
  const totalAP = payables
    .filter(p => p.status !== '已付清' && p.status !== '作廢')
    .reduce((sum, p) => sum + Number(p.balance), 0)
  const overdueCount = payables.filter(p =>
    p.status === '未付' && p.due_date && new Date(p.due_date) < new Date()
  ).length
  const paidThisMonth = payables.filter(p => {
    if (p.status !== '已付清') return false
    const d = new Date(p.updated_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).reduce((sum, p) => sum + Number(p.paid_amount), 0)

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Receipt size={20} className="text-orange-600" />
          <h1 className="text-xl font-bold text-gray-900">應付帳款</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
        >
          <Plus size={16} /> 新增應付
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-red-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">未付帳款總額</div>
          <div className="text-xl font-bold text-red-700">{formatCurrency(totalAP)}</div>
        </div>
        <div className="bg-orange-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">逾期未付</div>
          <div className="text-xl font-bold text-orange-700">{overdueCount} 筆</div>
        </div>
        <div className="bg-green-50 rounded-2xl p-4">
          <div className="text-xs text-gray-500 mb-1">本月已付</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(paidThisMonth)}</div>
        </div>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-5 space-y-4">
          <div className="font-semibold text-orange-900">新增應付帳款</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">關聯訂購單（選填）</label>
              <select value={form.purchase_order_id} onChange={e => onOrderSelect(e.target.value)} className={inputClass}>
                <option value="">不選訂購單（手動輸入）</option>
                {purchaseOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.order_no} — {o.vendor_name} — {formatCurrency(o.total_amount)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">廠商</label>
              <select value={form.vendor_id} onChange={e => setForm(p => ({ ...p, vendor_id: e.target.value }))} className={inputClass}>
                <option value="">請選擇</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">應付金額 *</label>
              <input type="number" min="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">廠商發票號碼</label>
              <input value={form.invoice_no} onChange={e => setForm(p => ({ ...p, invoice_no: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">發票日期</label>
              <input type="date" value={form.invoice_date} onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">應付日期（到期日）</label>
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
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              {saving ? '儲存中...' : '建立'}
            </button>
          </div>
        </div>
      )}

      {/* 篩選 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋單號、廠商、發票號碼..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* 列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">單號</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">廠商</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">發票號碼</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">到期日</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">應付</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">已付</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">未付餘額</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">狀態</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">沒有應付帳款</td></tr>
              ) : (
                filtered.map(p => {
                  const isOverdue = p.status === '未付' && p.due_date && new Date(p.due_date) < new Date()
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 hover:bg-orange-50 transition-colors ${isOverdue ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{p.payable_no}</td>
                      <td className="px-4 py-3 text-gray-700">{p.vendors?.company_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{p.invoice_no ?? '—'}</td>
                      <td className={`px-4 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {formatDate(p.due_date)}
                        {isOverdue && <span className="ml-1 text-xs">⚠️逾期</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatCurrency(p.paid_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold">
                        <span className={p.balance > 0 ? 'text-red-600' : 'text-gray-400'}>
                          {formatCurrency(p.balance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <Link href={`/payables/${p.id}`} className="text-xs text-blue-600 hover:underline">
                            付款
                          </Link>
                          <button onClick={() => window.open(`/payables/${p.id}/print`, '_blank')}
                            title="列印／分享對帳單 PDF" className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                            <Printer size={14} />
                          </button>
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
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(filtered.reduce((s, p) => s + Number(p.amount), 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(filtered.reduce((s, p) => s + Number(p.paid_amount), 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">{formatCurrency(filtered.reduce((s, p) => s + Number(p.balance), 0))}</td>
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
