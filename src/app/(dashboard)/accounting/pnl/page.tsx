'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, Settings2, Plus, Trash2, X, Pencil, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Period = {
  label: string
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  operatingIncome: number
  nonopNet: number
  pretaxIncome: number
  tax: number
  netIncome: number
}

type PnlData = {
  year: number
  totalRevenue: number
  totalCogs: number
  grossProfit: number
  totalOpex: number
  operatingIncome: number
  nonopNet: number
  pretaxIncome: number
  totalTax: number
  netIncome: number
  sharesOutstanding: number | null
  eps: number | null
  bimonthly: Period[]
  monthly: Period[]
  incomeCategoryDetail: { name: string; amount: number; kind: string }[]
  expenseCategoryDetail: { name: string; amount: number; kind: string }[]
}

type Category = { id: string; name: string; kind: string; sort_order?: number }

const INCOME_KINDS = [
  { value: 'revenue',      label: '營業收入' },
  { value: 'nonop_income', label: '營業外收入' },
]
const EXPENSE_KINDS = [
  { value: 'cogs',           label: '營業成本' },
  { value: 'opex',           label: '營業費用' },
  { value: 'nonop_expense',  label: '營業外支出' },
  { value: 'tax',            label: '所得稅費用' },
]

function kindLabel(kind: string, isIncome: boolean) {
  const list = isIncome ? INCOME_KINDS : EXPENSE_KINDS
  return list.find(k => k.value === kind)?.label ?? kind
}

function fmt(n: number) {
  const sign = n < 0 ? '-' : ''
  return sign + 'NT$' + Math.round(Math.abs(n)).toLocaleString()
}

function fmtEps(n: number | null) {
  if (n === null) return '—'
  const sign = n < 0 ? '-' : ''
  return sign + 'NT$' + Math.abs(n).toFixed(2)
}

export default function PnlPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [view, setView] = useState<'bimonthly' | 'monthly'>('bimonthly')
  const [data, setData] = useState<PnlData | null>(null)
  const [loading, setLoading] = useState(true)

  // 流通股數（供每股盈餘使用）
  const supabase = createClient()
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [sharesInput, setSharesInput] = useState('')
  const [editingShares, setEditingShares] = useState(false)
  const [savingShares, setSavingShares] = useState(false)

  // 科目管理
  const [showCatPanel, setShowCatPanel] = useState(false)
  const [catTab, setCatTab] = useState<'income' | 'expense'>('expense')
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([])
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatKind, setNewCatKind] = useState('opex')
  const [catSaving, setCatSaving] = useState(false)

  useEffect(() => {
    fetchPnl()
  }, [year])

  useEffect(() => {
    if (showCatPanel) {
      fetchCategories()
    }
  }, [showCatPanel])

  useEffect(() => {
    setNewCatKind(catTab === 'income' ? 'revenue' : 'opex')
  }, [catTab])

  useEffect(() => {
    supabase.from('system_settings').select('id, shares_outstanding').single().then(({ data }) => {
      if (data) {
        setSettingsId((data as any).id)
        setSharesInput((data as any).shares_outstanding ? String((data as any).shares_outstanding) : '')
      }
    })
  }, [])

  async function fetchPnl() {
    setLoading(true)
    const res = await fetch(`/api/accounting/pnl?year=${year}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  async function fetchCategories() {
    const [incRes, expRes] = await Promise.all([
      fetch('/api/accounting/income-categories'),
      fetch('/api/accounting/categories'),
    ])
    const incData = await incRes.json()
    const expData = await expRes.json()
    setIncomeCategories(incData.categories || [])
    setExpenseCategories(expData.categories || [])
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    setCatSaving(true)
    const url = catTab === 'income'
      ? '/api/accounting/income-categories'
      : '/api/accounting/categories'
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim(), kind: newCatKind }),
    })
    setNewCatName('')
    await fetchCategories()
    setCatSaving(false)
  }

  async function updateCategoryKind(id: string, kind: string) {
    const url = catTab === 'income'
      ? '/api/accounting/income-categories'
      : '/api/accounting/categories'
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, kind }),
    })
    await fetchCategories()
    await fetchPnl()
  }

  async function deleteCategory(id: string) {
    if (!confirm('確定刪除此科目？')) return
    const url = catTab === 'income'
      ? '/api/accounting/income-categories'
      : '/api/accounting/categories'
    await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchCategories()
  }

  async function saveShares() {
    if (!settingsId) return
    setSavingShares(true)
    const val = sharesInput.trim() ? Number(sharesInput) : null
    await supabase.from('system_settings').update({ shares_outstanding: val }).eq('id', settingsId)
    setSavingShares(false)
    setEditingShares(false)
    await fetchPnl()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!data) return null

  const periods = view === 'bimonthly' ? data.bimonthly : data.monthly
  const currentCategories = catTab === 'income' ? incomeCategories : expenseCategories

  // 損益表列定義：[標籤, 全年金額, 是否為小計/總計（粗體）, 是否為扣除項（顯示括號/負號）]
  const rows: { label: string; total: number; sub?: boolean; deduct?: boolean; percent?: number }[] = [
    { label: '營業收入',         total: data.totalRevenue,   percent: 100 },
    { label: '營業成本',         total: data.totalCogs,      deduct: true, percent: pctNum(data.totalCogs, data.totalRevenue) },
    { label: '營業毛利',         total: data.grossProfit,    sub: true,    percent: pctNum(data.grossProfit, data.totalRevenue) },
    { label: '營業費用',         total: data.totalOpex,      deduct: true, percent: pctNum(data.totalOpex, data.totalRevenue) },
    { label: '營業淨利',         total: data.operatingIncome, sub: true,   percent: pctNum(data.operatingIncome, data.totalRevenue) },
    { label: '營業外收入及支出', total: data.nonopNet,       percent: pctNum(data.nonopNet, data.totalRevenue) },
    { label: '稅前淨利',         total: data.pretaxIncome,   sub: true,    percent: pctNum(data.pretaxIncome, data.totalRevenue) },
    { label: '所得稅費用',       total: data.totalTax,       deduct: true, percent: pctNum(data.totalTax, data.totalRevenue) },
    { label: '本期（年度）淨利', total: data.netIncome,      sub: true,    percent: pctNum(data.netIncome, data.totalRevenue) },
  ]

  function pctNum(part: number, whole: number) {
    return whole ? part / whole * 100 : 0
  }

  function periodValue(p: Period, label: string): number {
    switch (label) {
      case '營業收入': return p.revenue
      case '營業成本': return p.cogs
      case '營業毛利': return p.grossProfit
      case '營業費用': return p.opex
      case '營業淨利': return p.operatingIncome
      case '營業外收入及支出': return p.nonopNet
      case '稅前淨利': return p.pretaxIncome
      case '所得稅費用': return p.tax
      case '本期（年度）淨利': return p.netIncome
      default: return 0
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">損益表</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowCatPanel(true)}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            <Settings2 size={15} />
            科目管理
          </button>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
            <button onClick={() => setView('bimonthly')}
              className={`px-3 py-2 ${view === 'bimonthly' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              雙月
            </button>
            <button onClick={() => setView('monthly')}
              className={`px-3 py-2 ${view === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              月份
            </button>
          </div>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-blue-500" />
            <span className="text-xs text-gray-500">營業收入</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.totalRevenue)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={16} className="text-red-400" />
            <span className="text-xs text-gray-500">營業毛利</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.grossProfit)}</div>
        </div>
        <div className={`bg-white rounded-2xl border p-4 ${data.netIncome >= 0 ? 'border-green-100' : 'border-red-100'}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className={data.netIncome >= 0 ? 'text-green-500' : 'text-red-500'} />
            <span className="text-xs text-gray-500">本期（年度）淨利</span>
          </div>
          <div className={`text-lg font-bold ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(data.netIncome)}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-purple-500" />
              <span className="text-xs text-gray-500">每股盈餘 (EPS)</span>
            </div>
            <button onClick={() => setEditingShares(true)} className="text-gray-300 hover:text-gray-500">
              <Pencil size={12} />
            </button>
          </div>
          {editingShares ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={sharesInput}
                onChange={e => setSharesInput(e.target.value)}
                placeholder="流通股數"
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={saveShares} disabled={savingShares} className="text-green-500 hover:text-green-600 shrink-0">
                <Check size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className={`text-lg font-bold ${data.eps === null ? 'text-gray-300' : data.eps >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                {fmtEps(data.eps)}
              </div>
              {data.eps === null && (
                <p className="text-[11px] text-gray-400 mt-0.5">點右上角鉛筆設定流通股數</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 損益表 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{data.year} 年度損益表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-4 py-3 text-left w-36">項目</th>
                <th className="px-4 py-3 text-right">全年累計</th>
                <th className="px-4 py-3 text-right text-gray-400">%</th>
                {periods.map(p => (
                  <th key={p.label} className="px-4 py-3 text-right">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <tr
                  key={row.label}
                  className={row.sub ? 'border-t-2 border-gray-200 bg-gray-50/40' : ''}
                >
                  <td className={`px-4 py-3 text-gray-700 ${row.sub ? 'font-bold text-gray-900' : 'font-medium'}`}>
                    {row.label}
                  </td>
                  <td className={`px-4 py-3 text-right ${row.sub ? 'font-bold text-base' : 'font-semibold'} ${
                    row.deduct ? 'text-red-500' : row.total >= 0 ? 'text-gray-900' : 'text-red-600'
                  }`}>
                    {row.deduct && row.total !== 0 ? '(' + fmt(row.total).replace('-', '') + ')' : fmt(row.total)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {data.totalRevenue ? (row.percent ?? 0).toFixed(1) + '%' : '—'}
                  </td>
                  {periods.map(p => {
                    const v = periodValue(p, row.label)
                    return (
                      <td key={p.label} className={`px-4 py-3 text-right ${row.sub ? 'font-semibold' : ''} ${
                        row.deduct ? 'text-red-500' : v >= 0 ? 'text-gray-700' : 'text-red-600'
                      }`}>
                        {v === 0 ? '—' : (row.deduct ? '(' + fmt(v).replace('-', '') + ')' : fmt(v))}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {/* 每股盈餘 */}
              <tr className="border-t-2 border-gray-200 bg-purple-50/30">
                <td className="px-4 py-3 font-bold text-gray-900">每股盈餘</td>
                <td className="px-4 py-3 text-right font-bold text-base text-purple-700">{fmtEps(data.eps)}</td>
                <td className="px-4 py-3 text-right text-gray-400 text-xs">—</td>
                {periods.map(p => (
                  <td key={p.label} className="px-4 py-3 text-right text-gray-400">—</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {data.sharesOutstanding && (
          <div className="px-6 py-2 text-xs text-gray-400 border-t">
            流通股數：{Number(data.sharesOutstanding).toLocaleString()} 股（每股盈餘 = 本期淨利 ÷ 流通股數）
          </div>
        )}
      </div>

      {/* 收入科目明細 */}
      {data.incomeCategoryDetail.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">收入科目明細</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.incomeCategoryDetail.map(c => (
              <div key={c.name} className="flex items-center px-6 py-3">
                <span className="text-sm text-gray-700 flex-1">{c.name}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full mr-3 ${c.kind === 'nonop_income' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                  {kindLabel(c.kind, true)}
                </span>
                <span className="text-sm font-medium text-gray-900 w-32 text-right">{fmt(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 支出科目明細 */}
      {data.expenseCategoryDetail.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">支出科目明細</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {data.expenseCategoryDetail.map(c => (
              <div key={c.name} className="flex items-center px-6 py-3">
                <span className="text-sm text-gray-700 flex-1">{c.name}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full mr-3 ${
                  c.kind === 'cogs' ? 'bg-orange-50 text-orange-600' :
                  c.kind === 'nonop_expense' ? 'bg-amber-50 text-amber-600' :
                  c.kind === 'tax' ? 'bg-gray-100 text-gray-600' :
                  'bg-red-50 text-red-500'
                }`}>
                  {kindLabel(c.kind, false)}
                </span>
                <span className="text-sm font-medium text-gray-900 w-32 text-right">{fmt(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 科目管理 Modal */}
      {showCatPanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">科目管理</h2>
              <button onClick={() => { setShowCatPanel(false); setNewCatName('') }}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mx-6 mt-4 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => { setCatTab('expense'); setNewCatName('') }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${catTab === 'expense' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
              >
                支出科目
              </button>
              <button
                onClick={() => { setCatTab('income'); setNewCatName('') }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${catTab === 'income' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
              >
                收入科目
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-400">
                {catTab === 'expense'
                  ? '每個支出科目請指定屬於「營業成本／營業費用／營業外支出／所得稅費用」，損益表會依此自動歸類計算。'
                  : '每個收入科目請指定屬於「營業收入」或「營業外收入」，損益表會依此自動歸類計算。'}
              </p>

              {/* 新增輸入 */}
              <div className="flex gap-2 flex-wrap">
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="輸入新科目名稱"
                  className="flex-1 min-w-[140px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={newCatKind}
                  onChange={e => setNewCatKind(e.target.value)}
                  className="border border-gray-200 rounded-xl px-2 py-2 text-sm"
                >
                  {(catTab === 'income' ? INCOME_KINDS : EXPENSE_KINDS).map(k => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                <button
                  onClick={addCategory}
                  disabled={catSaving || !newCatName.trim()}
                  className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus size={14} /> 新增
                </button>
              </div>

              {/* 科目列表 */}
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {currentCategories.length === 0 && (
                  <p className="text-sm text-gray-400 py-6 text-center">尚無科目</p>
                )}
                {currentCategories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
                    <span className="text-sm text-gray-800 flex-1">{cat.name}</span>
                    <select
                      value={cat.kind || (catTab === 'income' ? 'revenue' : 'opex')}
                      onChange={e => updateCategoryKind(cat.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 shrink-0"
                    >
                      {(catTab === 'income' ? INCOME_KINDS : EXPENSE_KINDS).map(k => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="text-gray-300 hover:text-red-500 transition p-1 rounded hover:bg-red-50 shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
