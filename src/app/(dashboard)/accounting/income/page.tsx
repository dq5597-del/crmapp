'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Save, RefreshCw } from 'lucide-react'

const INVOICE_TYPES = ['三聯式', '二聯式', '電子發票', '無']

type Income = {
  id: string
  invoice_type: string
  invoice_date: string
  invoice_no: string
  client_name: string
  description: string
  category: string
  untaxed_amount: number
  tax_amount: number
  total_amount: number
  collected_date: string
  payment_account: string
  source_type: string
  year: number
  note: string
}

const empty: Omit<Income, 'id' | 'source_type'> = {
  invoice_type: '三聯式',
  invoice_date: new Date().toISOString().split('T')[0],
  invoice_no: '',
  client_name: '',
  description: '',
  category: '銷售收入',
  untaxed_amount: 0,
  tax_amount: 0,
  total_amount: 0,
  collected_date: '',
  payment_account: '',
  year: new Date().getFullYear(),
  note: '',
}

export default function IncomePage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [income, setIncome] = useState<Income[]>([])
  const [incomeCategories, setIncomeCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Income | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchIncomeCategories()
  }, [])

  useEffect(() => { fetchIncome() }, [year])

  async function fetchIncomeCategories() {
    const res = await fetch('/api/accounting/income-categories')
    const data = await res.json()
    setIncomeCategories((data.categories || []).map((c: any) => c.name))
  }

  async function fetchIncome() {
    setLoading(true)
    const res = await fetch(`/api/accounting/income?year=${year}`)
    const data = await res.json()
    setIncome(data.income || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ ...empty, year })
    setShowForm(true)
  }

  function openEdit(item: Income) {
    setEditing(item)
    setForm({ ...item } as any)
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
      const url = editing ? `/api/accounting/income/${editing.id}` : '/api/accounting/income'
      const method = editing ? 'PATCH' : 'POST'
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setShowForm(false)
      fetchIncome()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除這筆收入？')) return
    await fetch(`/api/accounting/income/${id}`, { method: 'DELETE' })
    fetchIncome()
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/accounting/income/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const data = await res.json()
      if (data.error) { alert('同步失敗：' + data.error); return }
      alert(data.imported > 0 ? `已匯入 ${data.imported} 筆報價單` : data.message || '無新資料')
      fetchIncome()
    } finally {
      setSyncing(false)
    }
  }

  const total = income.reduce((s, e) => s + Number(e.untaxed_amount), 0)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">收入記錄</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {income.length} 筆｜未稅合計 NT${total.toLocaleString()}</p>
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
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            從報價單匯入
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700">
            <Plus size={16} /> 新增收入
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-4 py-3 text-left">發票日期</th>
                <th className="px-4 py-3 text-left">客戶</th>
                <th className="px-4 py-3 text-left">品名/說明</th>
                <th className="px-4 py-3 text-left">科目</th>
                <th className="px-4 py-3 text-right">未稅金額</th>
                <th className="px-4 py-3 text-right">含稅總額</th>
                <th className="px-4 py-3 text-left">收款日期</th>
                <th className="px-4 py-3 text-left">來源</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">載入中...</td></tr>
              ) : income.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">尚無收入記錄，可點「從報價單匯入」自動帶入</td></tr>
              ) : income.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{item.invoice_date || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.client_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{item.description || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-lg">{item.category || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">NT${Number(item.untaxed_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">NT${Number(item.total_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{item.collected_date || '未收'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-lg ${item.source_type === 'quote' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {item.source_type === 'quote' ? '報價單' : '手動'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-blue-600"><Pencil size={15} /></button>
                      <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
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
              <h2 className="font-bold text-gray-900">{editing ? '編輯收入' : '新增收入'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">發票型式</label>
                <select value={form.invoice_type} onChange={e => handleChange('invoice_type', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {INVOICE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">發票日期</label>
                <input type="date" value={form.invoice_date} onChange={e => handleChange('invoice_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">發票號碼</label>
                <input value={form.invoice_no} onChange={e => handleChange('invoice_no', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="AB-12345678" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">客戶名稱</label>
                <input value={form.client_name} onChange={e => handleChange('client_name', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="客戶公司名稱" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">品名/說明</label>
                <input value={form.description} onChange={e => handleChange('description', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="商品或服務說明" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">科目</label>
                <select value={form.category} onChange={e => handleChange('category', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">請選擇科目</option>
                  {incomeCategories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">未稅金額</label>
                <input type="number" value={form.untaxed_amount} onChange={e => handleChange('untaxed_amount', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">收款日期</label>
                <input type="date" value={form.collected_date} onChange={e => handleChange('collected_date', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">收款帳號</label>
                <input value={form.payment_account} onChange={e => handleChange('payment_account', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="銀行帳號後5碼" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">備註</label>
                <input value={form.note} onChange={e => handleChange('note', e.target.value)}
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
