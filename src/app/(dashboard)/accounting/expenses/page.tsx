'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Save, Search } from 'lucide-react'

const INVOICE_TYPES = ['二聯式', '三聯式', '電子發票', '郵資', '無']

type Expense = {
  id: string
  invoice_type: string
  invoice_date: string
  invoice_no: string
  supplier: string
  item_name: string
  category: string
  untaxed_amount: number
  tax_amount: number
  total_amount: number
  due_date: string
  paid_date: string
  payment_account: string
  completion_date: string
  note_client: string
  note_reason: string
  year: number
}

const empty: Omit<Expense, 'id'> = {
  invoice_type: '三聯式',
  invoice_date: new Date().toISOString().split('T')[0],
  invoice_no: '',
  supplier: '',
  item_name: '',
  category: '',
  untaxed_amount: 0,
  tax_amount: 0,
  total_amount: 0,
  due_date: '',
  paid_date: '',
  payment_account: '',
  completion_date: '',
  note_client: '',
  note_reason: '',
  year: new Date().getFullYear(),
}

export default function ExpensesPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    fetchExpenses()
  }, [year])

  async function fetchCategories() {
    const res = await fetch('/api/accounting/categories')
    const data = await res.json()
    setCategories((data.categories || []).map((c: any) => c.name))
  }

  async function fetchExpenses() {
    setLoading(true)
    const res = await fetch(`/api/accounting/expenses?year=${year}`)
    const data = await res.json()
    setExpenses(data.expenses || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ ...empty, year })
    setShowForm(true)
  }

  function openEdit(e: Expense) {
    setEditing(e)
    setForm({ ...e })
    setShowForm(true)
  }

  function handleChange(field: string, value: any) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'untaxed_amount') {
        const untaxed = Number(value) || 0
        next.tax_amount = Math.round(untaxed * 0.05 * 100) / 100
        next.total_amount = untaxed + next.tax_amount
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const url = editing
        ? `/api/accounting/expenses/${editing.id}`
        : '/api/accounting/expenses'
      const method = editing ? 'PATCH' : 'POST'
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setShowForm(false)
      fetchExpenses()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除這筆支出？')) return
    await fetch(`/api/accounting/expenses/${id}`, { method: 'DELETE' })
    fetchExpenses()
  }

  // 篩選：關鍵字（供應商／品名／發票號碼）＋科目＋月份
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('全部')
  const [month, setMonth] = useState('全部')

  const catOptions = ['全部', ...Array.from(new Set(expenses.map(e => e.category).filter(Boolean)))]

  const filtered = expenses.filter(e => {
    if (cat !== '全部' && e.category !== cat) return false
    if (month !== '全部' && (e.invoice_date ?? '').slice(5, 7) !== month) return false
    if (q) {
      const s = `${e.supplier ?? ''} ${e.item_name ?? ''} ${e.invoice_no ?? ''} ${e.category ?? ''}`.toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  })

  const total = filtered.reduce((s, e) => s + Number(e.untaxed_amount), 0)
  const totalWithTax = filtered.reduce((s, e) => s + Number(e.total_amount), 0)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">支出記錄</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} / {expenses.length} 筆｜未稅合計 NT${total.toLocaleString()}｜含稅 NT${totalWithTax.toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700">
            <Plus size={16} /> 新增支出
          </button>
        </div>
      </div>

      {/* 篩選列 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋供應商／品名／發票號碼"
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm w-64" />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2">
          {catOptions.map(c => <option key={c} value={c}>{c === '全部' ? '全部科目' : c}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2">
          <option value="全部">全部月份</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
            <option key={m} value={m}>{Number(m)} 月</option>
          ))}
        </select>
        {(q || cat !== '全部' || month !== '全部') && (
          <button onClick={() => { setQ(''); setCat('全部'); setMonth('全部') }}
            className="text-sm text-gray-500 hover:text-gray-800 px-2">清除篩選</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-4 py-3 text-left">發票日期</th>
                <th className="px-4 py-3 text-left">供應商</th>
                <th className="px-4 py-3 text-left">品名</th>
                <th className="px-4 py-3 text-left">科目</th>
                <th className="px-4 py-3 text-right">未稅金額</th>
                <th className="px-4 py-3 text-right">含稅總額</th>
                <th className="px-4 py-3 text-left">付款日期</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">尚無支出記錄</td></tr>
              ) : filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{e.invoice_date || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{e.supplier || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{e.item_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">{e.category || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">NT${Number(e.untaxed_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">NT${Number(e.total_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{e.paid_date || '未付'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(e)} className="text-gray-400 hover:text-blue-600"><Pencil size={15} /></button>
                      <button onClick={() => handleDelete(e.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editing ? '編輯支出' : '新增支出'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {/* 發票型式 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">發票型式</label>
                <select value={form.invoice_type} onChange={e => handleChange('invoice_type', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {INVOICE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {/* 發票日期 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">發票日期</label>
                <input type="date" value={form.invoice_date} onChange={e => handleChange('invoice_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* 發票號碼 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">發票號碼</label>
                <input value={form.invoice_no} onChange={e => handleChange('invoice_no', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="AB-12345678" />
              </div>
              {/* 供應商 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">供應商</label>
                <input value={form.supplier} onChange={e => handleChange('supplier', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="供應商名稱" />
              </div>
              {/* 品名 */}
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">品名</label>
                <input value={form.item_name} onChange={e => handleChange('item_name', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="商品或服務名稱" />
              </div>
              {/* 科目 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">科目</label>
                <select value={form.category} onChange={e => handleChange('category', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">請選擇科目</option>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {/* 未稅金額 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">未稅金額</label>
                <input type="number" value={form.untaxed_amount} onChange={e => handleChange('untaxed_amount', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* 稅額 / 含稅 (唯讀) */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">稅額 (5%)</label>
                <input readOnly value={form.tax_amount}
                  className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">含稅總額</label>
                <input readOnly value={form.total_amount}
                  className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700" />
              </div>
              {/* 預計付款日 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">預計付款日</label>
                <input type="date" value={form.due_date} onChange={e => handleChange('due_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* 付款日期 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">付款日期</label>
                <input type="date" value={form.paid_date} onChange={e => handleChange('paid_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* 付款帳號 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">付款帳號</label>
                <input value={form.payment_account} onChange={e => handleChange('payment_account', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="銀行帳號後5碼" />
              </div>
              {/* 完工日期 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">完工日期</label>
                <input type="date" value={form.completion_date} onChange={e => handleChange('completion_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* 備註客戶 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">備註(客戶名)</label>
                <input value={form.note_client} onChange={e => handleChange('note_client', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {/* 備註事由 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">備註(事由)</label>
                <input value={form.note_reason} onChange={e => handleChange('note_reason', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">取消</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
                <Save size={15} /> {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
