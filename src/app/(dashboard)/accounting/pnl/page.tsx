'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, Settings2, Plus, Trash2, X } from 'lucide-react'

type PnlData = {
  year: number
  totalRevenue: number
  totalExpense: number
  netProfit: number
  netMargin: number
  revenueByMonth: Record<number, number>
  expenseByMonth: Record<number, number>
  expenseByCategory: Record<string, number>
  bimonthly: { label: string; revenue: number; expense: number }[]
}

type Category = { id: string; name: string }

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']

function fmt(n: number) {
  return 'NT$' + Math.round(n).toLocaleString()
}

export default function PnlPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [view, setView] = useState<'bimonthly' | 'monthly'>('bimonthly')
  const [data, setData] = useState<PnlData | null>(null)
  const [loading, setLoading] = useState(true)

  // 科目管理
  const [showCatPanel, setShowCatPanel] = useState(false)
  const [catTab, setCatTab] = useState<'income' | 'expense'>('expense')
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([])
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  useEffect(() => {
    fetchPnl()
  }, [year])

  useEffect(() => {
    if (showCatPanel) {
      fetchCategories()
    }
  }, [showCatPanel])

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
      body: JSON.stringify({ name: newCatName.trim() }),
    })
    setNewCatName('')
    await fetchCategories()
    setCatSaving(false)
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

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!data) return null

  const periods = view === 'bimonthly'
    ? data.bimonthly
    : MONTHS.map((label, i) => ({
        label,
        revenue: data.revenueByMonth[i + 1] || 0,
        expense: data.expenseByMonth[i + 1] || 0,
      }))

  const categories = Object.entries(data.expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 0)

  const currentCategories = catTab === 'income' ? incomeCategories : expenseCategories

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">損益表</h1>
        <div className="flex gap-2">
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
            <span className="text-xs text-gray-500">營業成本費用</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.totalExpense)}</div>
        </div>
        <div className={`bg-white rounded-2xl border p-4 ${data.netProfit >= 0 ? 'border-green-100' : 'border-red-100'}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className={data.netProfit >= 0 ? 'text-green-500' : 'text-red-500'} />
            <span className="text-xs text-gray-500">稅前淨利</span>
          </div>
          <div className={`text-lg font-bold ${data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(data.netProfit)}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart2 size={16} className="text-purple-500" />
            <span className="text-xs text-gray-500">淨利率</span>
          </div>
          <div className={`text-lg font-bold ${data.netMargin >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
            {(data.netMargin * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 期間損益表 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">期間損益</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-4 py-3 text-left w-32">項目</th>
                <th className="px-4 py-3 text-right">今年累計</th>
                <th className="px-4 py-3 text-right text-gray-400">%</th>
                {periods.map(p => (
                  <th key={p.label} className="px-4 py-3 text-right">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {/* 收入 */}
              <tr className="bg-blue-50/30">
                <td className="px-4 py-3 font-semibold text-gray-700">營業收入</td>
                <td className="px-4 py-3 text-right font-bold text-blue-700">{fmt(data.totalRevenue)}</td>
                <td className="px-4 py-3 text-right text-gray-400">100%</td>
                {periods.map(p => (
                  <td key={p.label} className="px-4 py-3 text-right text-blue-600">{p.revenue > 0 ? fmt(p.revenue) : '—'}</td>
                ))}
              </tr>
              {/* 支出合計 */}
              <tr className="bg-red-50/20">
                <td className="px-4 py-3 font-semibold text-gray-700">營業成本費用</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(data.totalExpense)}</td>
                <td className="px-4 py-3 text-right text-gray-400">
                  {data.totalRevenue > 0 ? (data.totalExpense / data.totalRevenue * 100).toFixed(1) + '%' : '—'}
                </td>
                {periods.map(p => (
                  <td key={p.label} className="px-4 py-3 text-right text-red-500">{p.expense > 0 ? fmt(p.expense) : '—'}</td>
                ))}
              </tr>
              {/* 淨利 */}
              <tr className="border-t-2 border-gray-200">
                <td className="px-4 py-3 font-bold text-gray-900">稅前淨利</td>
                <td className={`px-4 py-3 text-right font-bold text-lg ${data.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(data.netProfit)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {data.totalRevenue > 0 ? (data.netMargin * 100).toFixed(1) + '%' : '—'}
                </td>
                {periods.map(p => {
                  const net = p.revenue - p.expense
                  return (
                    <td key={p.label} className={`px-4 py-3 text-right font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(p.revenue > 0 || p.expense > 0) ? fmt(net) : '—'}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 支出科目明細 */}
      {categories.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">支出科目明細</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {categories.map(([cat, amount]) => (
              <div key={cat} className="flex items-center px-6 py-3">
                <span className="text-sm text-gray-700 flex-1">{cat}</span>
                <div className="w-48 mr-4">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full"
                      style={{ width: `${Math.min(100, amount / data.totalExpense * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900 w-32 text-right">{fmt(amount)}</span>
                <span className="text-xs text-gray-400 w-16 text-right">
                  {data.totalExpense > 0 ? (amount / data.totalExpense * 100).toFixed(1) + '%' : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 科目管理 Modal */}
      {showCatPanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
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
                  ? '這些科目出現在支出記錄的「科目」選單中。'
                  : '這些科目出現在收入記錄的「科目」選單中。'}
              </p>

              {/* 新增輸入 */}
              <div className="flex gap-2">
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="輸入新科目名稱"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                  <div key={cat.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <span className="text-sm text-gray-800">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="text-gray-300 hover:text-red-500 transition p-1 rounded hover:bg-red-50"
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
