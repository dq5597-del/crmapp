'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowLeft, Plus, Receipt, CheckCircle } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  '未付':     'bg-red-100 text-red-700',
  '部分付款': 'bg-yellow-100 text-yellow-700',
  '已付清':   'bg-green-100 text-green-700',
  '作廢':     'bg-gray-100 text-gray-400',
}

import { PAYMENT_METHODS } from '@/lib/auto-ledger'

export default function PayableDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [payable, setPayable] = useState<any>(null)
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
    const [pRes, pmRes] = await Promise.all([
      supabase.from('payables')
        .select('*, vendors(company_name, bank_name, bank_account, bank_account_name, payment_terms), purchase_orders(order_no)')
        .eq('id', id)
        .single(),
      supabase.from('payable_payments')
        .select('*')
        .eq('payable_id', id)
        .order('payment_date', { ascending: false }),
    ])
    setPayable(pRes.data)
    setPayments(pmRes.data ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleAddPayment() {
    if (!payForm.amount || payForm.amount <= 0) { alert('請輸入付款金額'); return }
    if (!payForm.payment_date) { alert('請選擇付款日期'); return }
    setSaving(true)

    await supabase.from('payable_payments').insert({
      payable_id: id,
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
    if (!confirm('確定刪除此付款紀錄？')) return
    await supabase.from('payable_payments').delete().eq('id', pid)
    await fetchAll()
  }

  async function markVoid() {
    if (!confirm('確定作廢此應付帳款？')) return
    await supabase.from('payables').update({ status: '作廢' }).eq('id', id)
    await fetchAll()
  }

  if (loading) return <div className="p-6 text-gray-400">載入中...</div>
  if (!payable) return <div className="p-6 text-gray-400">找不到此應付帳款</div>

  const isOverdue = payable.status === '未付' && payable.due_date && new Date(payable.due_date) < new Date()
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
            <h1 className="text-xl font-bold text-gray-900">{payable.payable_no}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${STATUS_COLORS[payable.status]}`}>
              {payable.status}
            </span>
            {isOverdue && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg">⚠️ 逾期</span>}
          </div>
          <div className="text-sm text-gray-500 mt-0.5">{payable.vendors?.company_name ?? '—'}</div>
        </div>
        {payable.status !== '已付清' && payable.status !== '作廢' && (
          <button onClick={markVoid} className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
            作廢
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左：付款進度 */}
        <div className="lg:col-span-1 space-y-4">
          {/* 金額摘要 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide">付款進度</div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">應付金額</span>
                <span className="font-bold text-gray-900">{formatCurrency(payable.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">已付金額</span>
                <span className="font-bold text-green-600">{formatCurrency(payable.paid_amount)}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <span className="text-sm font-medium text-gray-700">未付餘額</span>
                <span className={`font-bold text-lg ${payable.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {formatCurrency(payable.balance)}
                </span>
              </div>
            </div>
            {payable.amount > 0 && (
              <div className="mt-4">
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (payable.paid_amount / payable.amount) * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1 text-right">
                  {Math.round((payable.paid_amount / payable.amount) * 100)}% 已付
                </div>
              </div>
            )}
          </div>

          {/* 基本資訊 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">基本資訊</div>
            {[
              { label: '關聯訂購單', value: payable.purchase_orders?.order_no ?? '無' },
              { label: '廠商發票號碼', value: payable.invoice_no ?? '未填' },
              { label: '發票日期', value: formatDate(payable.invoice_date) },
              { label: '應付到期日', value: formatDate(payable.due_date) },
              { label: '付款方式', value: payable.payment_method ?? '未填' },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{item.label}</span>
                <span className={`font-medium text-right max-w-48 ${item.label === '應付到期日' && isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
                  {item.value}
                </span>
              </div>
            ))}
            {payable.notes && (
              <div className="border-t border-gray-100 pt-3 text-sm text-gray-600">{payable.notes}</div>
            )}
          </div>

          {/* 廠商匯款資訊 */}
          {payable.vendors?.bank_account && (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
              <div className="text-xs text-orange-700 font-medium mb-3 uppercase tracking-wide">廠商匯款資訊</div>
              <div className="space-y-1.5 text-sm text-gray-700">
                {payable.vendors.bank_name && <div>{payable.vendors.bank_name}</div>}
                <div className="font-mono font-semibold">{payable.vendors.bank_account}</div>
                {payable.vendors.bank_account_name && <div className="text-gray-500">{payable.vendors.bank_account_name}</div>}
                {payable.vendors.payment_terms && (
                  <div className="text-xs text-orange-600 mt-2 bg-orange-100 px-2 py-1 rounded">
                    {payable.vendors.payment_terms}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右：付款紀錄 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 新增付款按鈕 */}
          {payable.status !== '已付清' && payable.status !== '作廢' && (
            <div>
              {!showPayForm ? (
                <button
                  onClick={() => {
                    setPayForm(p => ({ ...p, amount: payable.balance > 0 ? payable.balance : 0 }))
                    setShowPayForm(true)
                  }}
                  className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
                >
                  <Plus size={16} /> 登錄付款
                </button>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
                  <div className="font-semibold text-orange-900 flex items-center gap-2">
                    <Receipt size={16} /> 登錄付款
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">付款日期 *</label>
                      <input type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">付款金額 *</label>
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
                      <label className="text-xs text-gray-600 mb-1 block">匯款帳號末5碼 / 票號</label>
                      <input value={payForm.bank_ref} onChange={e => setPayForm(p => ({ ...p, bank_ref: e.target.value }))} className={inputClass} placeholder="選填" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600 mb-1 block">備註</label>
                      <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowPayForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
                    <button
                      onClick={handleAddPayment}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                    >
                      <CheckCircle size={14} /> {saving ? '儲存中...' : '確認付款'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 付款紀錄列表 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="font-semibold text-gray-900">付款紀錄</div>
            </div>
            {payments.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">尚未登錄任何付款</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-gray-600 font-medium">付款日期</th>
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
                    <td className="px-5 py-3 font-semibold text-gray-700">合計已付</td>
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
