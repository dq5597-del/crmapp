'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, BarChart2 } from 'lucide-react'

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

  useEffect(() => {
    fetchPnl()
  }, [year])

  async function fetchPnl() {
    setLoading(true)
    const res = await fetch(`/api/accounting/pnl?year=${year}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">損益表</h1>
        <div className="flex gap-2">
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
    </div>
  )
}
