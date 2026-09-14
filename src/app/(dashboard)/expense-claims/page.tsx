'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { Receipt, Plus, Trash2, X } from 'lucide-react'
import ApprovalBar from '@/components/approvals/ApprovalBar'

/**
 * 員工報銷申請
 * 先申請、後簽核；核准後才進入會計付款與支出記錄。
 * 草稿可改可刪，送簽後由 approval_status 鎖定（資料庫 trigger 擋修改）。
 */

const CATEGORIES = ['交通費', '餐費', '住宿費', '郵資', '採買代墊', '其他']

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', submitted: '簽核中', approved: '已核准',
  rejected: '已退回', paid: '已付款', cancelled: '已取消',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

const money = (v: unknown) => `NT$${Math.round(Number(v ?? 0)).toLocaleString()}`

type FormState = {
  expense_date: string
  category: string
  description: string
  amount: string
  receipt_url: string
}

const EMPTY_FORM: FormState = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: '交通費', description: '', amount: '', receipt_url: '',
}

export default function ExpenseClaims() {
  const supabase = useMemo(() => createClient(), [])
  const { permOf } = usePermissions()
  const perm = permOf('expense-claims')

  const [claims, setClaims] = useState<any[]>([])
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const { data, error: err } = await supabase
      .from('employee_expense_claims')
      .select('*, user_profiles!employee_expense_claims_applicant_id_fkey(full_name)')
      .order('created_at', { ascending: false })

    if (err) {
      setError('報銷模組尚未完成資料庫初始化，請先執行最新 Supabase migration。')
      setLoading(false)
      return
    }
    setClaims(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function create() {
    if (!form.description.trim() || !(Number(form.amount) > 0)) {
      return alert('請填寫用途與正確金額')
    }
    setSaving(true)
    const { error: err } = await supabase.from('employee_expense_claims').insert({
      applicant_id: userId,
      expense_date: form.expense_date,
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
      receipt_url: form.receipt_url.trim() || null,
      status: 'draft',
    })
    setSaving(false)
    if (err) return alert('新增失敗：' + err.message)
    setFormOpen(false)
    setForm(EMPTY_FORM)
    await load()
  }

  async function remove(claim: any) {
    if (!confirm(`確定刪除報銷申請「${claim.description}」？`)) return
    const { error: err } = await supabase.from('employee_expense_claims').delete().eq('id', claim.id)
    if (err) return alert('刪除失敗：' + err.message)
    await load()
  }

  return <div className="p-4 md:p-6 max-w-5xl mx-auto">
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div>
        <div className="flex items-center gap-2">
          <Receipt size={21} className="text-violet-600" />
          <h1 className="text-xl font-bold">員工報銷申請</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">先申請、後簽核；核准後才進入會計付款與支出記錄</p>
      </div>
      {perm.can_create && <button
        onClick={() => { setForm(EMPTY_FORM); setFormOpen(true) }}
        className="ml-auto flex items-center gap-1.5 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
        <Plus size={16} />新增申請
      </button>}
    </div>

    {error
      ? <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">{error}</div>
      : loading
      ? <div className="py-16 text-center text-gray-400">載入中…</div>
      : claims.length === 0
      ? <div className="py-16 text-center text-gray-400">尚無報銷申請</div>
      : <div className="space-y-3">
          {claims.map(claim => {
            const mine = claim.applicant_id === userId
            const isDraft = claim.status === 'draft'
            return <section key={claim.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700">{claim.category}</span>
                {claim.claim_no && <span className="font-mono text-xs text-gray-400">{claim.claim_no}</span>}
                <h2 className="font-semibold text-gray-900">{claim.description}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-lg ${STATUS_STYLE[claim.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[claim.status] ?? claim.status}
                </span>
                <span className="ml-auto font-semibold">{money(claim.amount)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
                <span>申請人：{claim.user_profiles?.full_name ?? '—'}</span>
                <span>費用日期：{claim.expense_date}</span>
                {claim.receipt_url && <a href={claim.receipt_url} target="_blank" rel="noreferrer"
                  className="text-blue-600 hover:underline">查看憑證</a>}
                {mine && isDraft && <button onClick={() => remove(claim)}
                  className="ml-auto p-1.5 text-gray-400 hover:text-red-600" title="刪除草稿"><Trash2 size={14} /></button>}
              </div>

              {/* 送簽、關卡進度與准駁一律交給共用簽核列，不要另建第二套送簽入口。 */}
              <div className="mt-3 pt-3 border-t">
                <ApprovalBar docType="expense_claim" docId={claim.id} onChanged={load} />
              </div>
            </section>
          })}
        </div>}

    {formOpen && <div onClick={() => setFormOpen(false)}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex">
          <h2 className="font-semibold">新增報銷申請</h2>
          <button onClick={() => setFormOpen(false)} className="ml-auto"><X size={18} /></button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="費用日期">
            <input type="date" value={form.expense_date}
              onChange={e => setForm({ ...form, expense_date: e.target.value })} className="input" />
          </Field>
          <Field label="分類">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <Field label="用途說明">
          <textarea rows={2} value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} className="input" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="金額">
            <input type="number" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} className="input" />
          </Field>
          <Field label="憑證連結">
            <input value={form.receipt_url}
              onChange={e => setForm({ ...form, receipt_url: e.target.value })}
              placeholder="https://…" className="input" />
          </Field>
        </div>

        <div className="flex justify-end">
          <button onClick={create} disabled={saving}
            className="bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? '儲存中…' : '建立草稿'}
          </button>
        </div>
      </div>
    </div>}

    <style jsx>{`
      .input {
        width: 100%;
        border: 1px solid #e5e7eb;
        border-radius: 0.75rem;
        padding: 0.625rem 0.75rem;
        font-size: 0.875rem;
        outline: none;
      }
      .input:focus { box-shadow: 0 0 0 2px #8b5cf6; }
    `}</style>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block">
    <span className="block text-xs font-medium text-gray-600 mb-1.5">{label}</span>
    {children}
  </label>
}
