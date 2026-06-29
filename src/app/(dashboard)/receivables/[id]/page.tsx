'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowLeft, Plus, DollarSign, CheckCircle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  '未收':     'bg-red-100 text-red-700',
  '部分收款': 'bg-yellow-100 text-yellow-700',
  '已收清':   'bg-green-100 text-green-700',
  '壞帳':     'bg-gray-100 text-gray-500',
  '已開立發票': 'bg-blue-100 text-blue-700',
}

const PAYMENT_METHODS = ['現金', '匯款', '票期', '信用卡']

export default function ReceivableDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [receivable, setReceivable] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [payForm, setPayForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    payment_method: '',
    bank_ref: '',
    notes: '',
  })

  const fetchAll = useCallback(async () => {
    const [rRes, pRes] = await Promise.all([
      supabase.from('receivables')
        .select('*, clients(company_name), sales_orders(order_no)')
        .eq('id', id)
        .single(),
      supabase.from('payment_records')
        .select('*')
        .eq('receivable_id', id)
        .order('payment_date', { ascending: false }),
    ])
    setReceivable(rRes.data)
    setPayments(pRes.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleAddPayment() {
    if (!payForm.amount || payForm.amount <= 0) { alert('請輸入收款金額'); return }
    if (!payForm.payment_date) { alert('請選擇收款日期'); return }
    setSaving(true)

    await supabase.from('payment_records').insert({
      receivable_id: id,
      payment_date: payForm.payment_date,
      amount: payForm.amount,
      payment_method: payForm.payment_method || null,
      bank_ref: payForm.bank_ref || null,
      notes: payForm.notes || null,
    })

    setShowPayForm(false)
    setPayForm({ payment_date: new Date().toISOString().slice(0, 10), amount: 0, payment_method: '', bank_ref: '', notes: '' })
    await fetchAll()
    setSaving(false)
  }

  async function handleDeletePayment(pid: string) {
    if (!confirm('確定刪除此收款紀錄？')) return
    await supabase.from('payment_records').delete().eq('id', pid)
    await fetchAll()
  }

  async function markBadDebt() {
    if (!confirm('確定標記為壞帳？')) return
    await supabase.from('receivables').update({ status: '壞帳' }).eq('id', id)
    await fetchAll()
  }

  async function markInvoiced() {
    await supabase.from('receivables').update({ status: '已開立發票' }).eq('id', id)
    await fetchAll()
  }

  if (loading) return <div className="p-6 text-gray-400">載入中...</div>
  if (!receivable) return <div className="p-6 text-gray-400">找不到此應收帳款</div>

  const isOverdue = receivable.status === '未收' && receivable.due_date && new Date(receivable.due_date) < new Date()
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{receivable.receivable_no}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${STATUS_COLORS[receivable.status]}`}>
              {receivable.status}
            </span>
            {isOverdue && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg">⚠️ 逾期</span>}
          </div>
          <div className="text-sm text-gray-500 mt-0.5">{receivable.clients?.company_name}</div>
        </div>
        <div className="flex gap-2">
          {receivable.status !== '壞帳' && receivable.status !== '已收清' && (
            <>
              <button onClick={markInvoiced} className="px-3 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50">
                標記已開發票
              </button>
              <button onClick={markBadDebt} className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
                標記壞帳
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左：收款進度 */}
        <div className="lg:col-span-1 space-y-4">
          {/* 金額摘要 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide">收款進度</div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">應收金額</span>
                <span className="font-bold text-gray-900">{formatCurrency(receivable.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">已收金額</span>
                <span className="font-bold text-green-600">{formatCurrency(receivable.received_amount)}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <span className="text-sm font-medium text-gray-700">未收餘額</span>
                <span className={`font-bold text-lg ${receivable.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatCurrency(receivable.balance)}
                </span>
              </div>
            </div>
            {/* Progress bar */}
            {receivable.amount > 0 && (
              <div className="mt-4">
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (receivable.received_amount / receivable.amount) * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1 text-right">
                  {Math.round((receivable.received_amount / receivable.amount) * 100)}% 已收
                </div>
              </div>
            )}
          </div>

          {/* 基本資訊 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">基本資訊</div>
            {[
              { label: '關聯銷貨單', value: receivable.sales_orders?.order_no ?? '無' },
              { label: '發票號碼', value: receivable.invoice_no ?? '未填' },
              { label: '開立日期', value: formatDate(receivable.invoice_date) },
              { label: '應收到期日', value: formatDate(receivable.due_date) },
              { label: '付款方式', value: receivable.payment_method ?? '未填' },
              { label: '建立日期', value: formatDate(receivable.created_at) },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{item.label}</span>
                <span className={`font-medium text-right max-w-48 ${item.label === '應收到期日' && isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
                  {item.value}
                </span>
              </div>
            ))}
            {receivable.notes && (
              <div className="border-t border-gray-100 pt-3 text-sm text-gray-600">{receivable.notes}</div>
            )}
          </div>
        </div>

        {/* 右：收款紀錄 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 新增收款按鈕 */}
          {receivable.status !== '已收清' && receivable.status !== '壞帳' && (
            <div>
              {!showPayForm ? (
                <button
                  onClick={() => { setPayForm(p => ({ ...p, amount: receivable.balance > 0 ? receivable.balance : 0 })); setShowPayForm(true) }}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
                >
                  <Plus size={16} /> 登錄收款
                </button>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-4">
                  <div className="font-semibold text-green-900 flex items-center gap-2">
                    <DollarSign size={16} /> 登錄收款
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">收款日期 *</label>
                      <input type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">收款金額 *</label>
                      <input type="number" min="0" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: Number(e.target.value) }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">付款方式</label>
                      <select value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))} className={inputClass}>
                        <option value="">請選擇</option>
                        {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">銀行轉帳末5碼 / 票號</label>
                      <input value={payForm.bank_ref} onChange={e => setPayForm(p => ({ ...p, bank_ref: e.target.value }))} className={inputClass} placeholder="選填" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600 mb-1 block">備註</label>
                      <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowPayForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
                    <button onClick={handleAddPayment} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                      <CheckCircle size={14} /> {saving ? '儲存中...' : '確認收款'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 收款紀錄列表 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="font-semibold text-gray-900">收款紀錄</div>
            </div>
            {payments.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">尚未登錄任何收款</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-gray-600 font-medium">收款日期</th>
                    <th className="text-right px-5 py-3 text-gray-600 font-medium">金額</th>
                    <th className="text-left px-5 py-3 text-gray-600 font-medium">方式</th>
                    <th className="text-left px-5 py-3 text-gray-600 font-medium">參考號碼</th>
                    <th className="text-left px-5 py-3 text-gray-600 font-medium">備註</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">{formatDate(p.payment_date)}</td>
                      <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(p.amount)}</td>
                      <td className="px-5 py-3 text-gray-600">{p.payment_method ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{p.bank_ref ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{p.notes ?? '—'}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleDeletePayment(p.id)} className="text-xs text-red-400 hover:text-red-600">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-5 py-3 font-semibold text-gray-700">合計已收</td>
                    <td className="px-5 py-3 text-right font-bold text-green-700">
                      {formatCurrency(payments.reduce((s, p) => s + Number(p.amount), 0))}
                    </td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
