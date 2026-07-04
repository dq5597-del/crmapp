'use client'
import { useEffect, useState } from 'react'
import { Landmark, PiggyBank, TrendingUp, Scale, Plus, Trash2, Pencil, Check, X } from 'lucide-react'

type Account = {
  id: string
  year: number
  category: string
  name: string
  amount: number
  is_system: boolean
  system_key: string | null
  sort_order: number
}

type EquityData = {
  year: number
  accounts: Account[]
  shareCapitalBeginning: number
  capitalSurplusBeginning: number
  retainedEarningsBeginning: number
  shareCapitalChange: number
  capitalSurplusChange: number
  retainedEarningsChange: number
  shareCapitalEnding: number
  capitalSurplusEnding: number
  retainedEarningsEnding: number
  totalBeginning: number
  totalChange: number
  totalEnding: number
}

const CATEGORIES: { key: string; label: string; icon: any }[] = [
  { key: 'share_capital', label: '股本', icon: Landmark },
  { key: 'capital_surplus', label: '資本公積', icon: PiggyBank },
  { key: 'retained_earnings', label: '保留盈餘（未分配盈餘）', icon: TrendingUp },
]

function fmt(n: number) {
  const sign = n < 0 ? '-' : ''
  return sign + 'NT$' + Math.round(Math.abs(n)).toLocaleString()
}

export default function EquityChangesPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<EquityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingBeginning, setEditingBeginning] = useState<string | null>(null)
  const [beginningInput, setBeginningInput] = useState('')
  const [savingBeginning, setSavingBeginning] = useState(false)

  useEffect(() => {
    fetchData()
  }, [year])

  async function fetchData() {
    setLoading(true)
    const res = await fetch(`/api/accounting/equity-changes?year=${year}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  function startEdit(a: Account) {
    setEditingId(a.id)
    setEditValue(String(a.amount))
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    const val = editValue.trim() === '' ? 0 : Number(editValue)
    await fetch('/api/accounting/equity-changes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, amount: val }),
    })
    setEditingId(null)
    setSavingId(null)
    await fetchData()
  }

  async function deleteAccount(id: string) {
    if (!confirm('確定刪除此變動項目？')) return
    await fetch('/api/accounting/equity-changes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchData()
  }

  async function addAccount(category: string) {
    const name = (newNames[category] || '').trim()
    if (!name) return
    setAdding(category)
    await fetch('/api/accounting/equity-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, category, name, amount: 0 }),
    })
    setNewNames(prev => ({ ...prev, [category]: '' }))
    setAdding(null)
    await fetchData()
  }

  function beginningField(category: string): keyof EquityData {
    if (category === 'share_capital') return 'shareCapitalBeginning'
    if (category === 'capital_surplus') return 'capitalSurplusBeginning'
    return 'retainedEarningsBeginning'
  }

  function beginningPayloadKey(category: string) {
    if (category === 'share_capital') return 'shareCapitalBeginning'
    if (category === 'capital_surplus') return 'capitalSurplusBeginning'
    return 'retainedEarningsBeginning'
  }

  async function saveBeginning(category: string) {
    setSavingBeginning(true)
    const val = beginningInput.trim() === '' ? 0 : Number(beginningInput)
    await fetch('/api/accounting/equity-changes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, [beginningPayloadKey(category)]: val }),
    })
    setSavingBeginning(false)
    setEditingBeginning(null)
    await fetchData()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!data) return null

  function categoryAccounts(category: string) {
    return data!.accounts.filter(a => a.category === category)
  }

  function categoryChangeTotal(category: string) {
    return categoryAccounts(category).reduce((s, a) => s + a.amount, 0)
  }

  function endingOf(category: string) {
    if (category === 'share_capital') return data!.shareCapitalEnding
    if (category === 'capital_surplus') return data!.capitalSurplusEnding
    return data!.retainedEarningsEnding
  }

  function beginningOf(category: string) {
    if (category === 'share_capital') return data!.shareCapitalBeginning
    if (category === 'capital_surplus') return data!.capitalSurplusBeginning
    return data!.retainedEarningsBeginning
  }

  function renderCategory(category: string, label: string, Icon: any) {
    const accounts = categoryAccounts(category)
    return (
      <div key={category} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Icon size={16} className="text-blue-500" />
            {label}
          </h2>
          <span className="font-bold text-blue-700">{fmt(endingOf(category))}</span>
        </div>

        <div className="divide-y divide-gray-50">
          {/* 期初餘額 */}
          <div className="flex items-center gap-2 px-6 py-3 bg-gray-50/50">
            <span className="text-sm text-gray-700 flex-1">期初餘額</span>
            {editingBeginning === category ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={beginningInput}
                  onChange={e => setBeginningInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBeginning(category)}
                  autoFocus
                  className="w-32 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={() => saveBeginning(category)} disabled={savingBeginning} className="text-green-500 hover:text-green-600 shrink-0">
                  <Check size={16} />
                </button>
                <button onClick={() => setEditingBeginning(null)} className="text-gray-300 hover:text-gray-500 shrink-0">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmt(beginningOf(category))}</span>
                <button
                  onClick={() => { setEditingBeginning(category); setBeginningInput(String(beginningOf(category))) }}
                  className="text-gray-300 hover:text-gray-500 p-1 shrink-0"
                >
                  <Pencil size={13} />
                </button>
              </div>
            )}
          </div>

          {/* 變動項目 */}
          {accounts.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">尚無變動項目</p>
          )}
          {accounts.map(a => (
            <div key={a.id} className="flex items-center gap-2 px-6 py-3">
              <span className="text-sm text-gray-700 flex-1 flex items-center gap-1.5">
                {a.name}
                {a.is_system && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 shrink-0">系統・自動帶入</span>
                )}
              </span>

              {editingId === a.id ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(a.id)}
                    autoFocus
                    className="w-32 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={() => saveEdit(a.id)} disabled={savingId === a.id} className="text-green-500 hover:text-green-600 shrink-0">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-gray-300 hover:text-gray-500 shrink-0">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-medium w-28 text-right ${a.amount < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmt(a.amount)}</span>
                  {!a.is_system && (
                    <>
                      <button onClick={() => startEdit(a)} className="text-gray-300 hover:text-gray-500 p-1 shrink-0">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteAccount(a.id)} className="text-gray-300 hover:text-red-500 p-1 shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 本期變動合計 */}
          <div className="flex items-center gap-2 px-6 py-2.5 bg-gray-50/30">
            <span className="text-xs text-gray-500 flex-1">本期變動合計</span>
            <span className={`text-xs font-medium w-28 text-right ${categoryChangeTotal(category) < 0 ? 'text-red-500' : 'text-gray-600'}`}>
              {fmt(categoryChangeTotal(category))}
            </span>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-3 bg-gray-50/50">
          <input
            value={newNames[category] || ''}
            onChange={e => setNewNames(prev => ({ ...prev, [category]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addAccount(category)}
            placeholder="新增變動項目名稱（如：現金股利分派、增資）"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => addAccount(category)}
            disabled={adding === category || !(newNames[category] || '').trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            <Plus size={13} /> 新增
          </button>
        </div>

        {/* 期末餘額 */}
        <div className="flex items-center gap-2 px-6 py-3 border-t bg-blue-50/30">
          <span className="text-sm font-bold text-gray-900 flex-1">期末餘額</span>
          <span className="text-base font-bold text-blue-700 w-28 text-right">{fmt(endingOf(category))}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">權益變動表</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2">
          {[currentYear, currentYear - 1, currentYear - 2].map(y => (
            <option key={y} value={y}>{y} 年</option>
          ))}
        </select>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={16} className="text-gray-400" />
            <span className="text-xs text-gray-500">期初權益總額</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.totalBeginning)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className={data.totalChange >= 0 ? 'text-green-500' : 'text-red-500'} />
            <span className="text-xs text-gray-500">本期權益變動淨額</span>
          </div>
          <div className={`text-lg font-bold ${data.totalChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(data.totalChange)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={16} className="text-blue-500" />
            <span className="text-xs text-gray-500">期末權益總額</span>
          </div>
          <div className="text-lg font-bold text-blue-700">{fmt(data.totalEnding)}</div>
        </div>
      </div>

      {CATEGORIES.map(c => renderCategory(c.key, c.label, c.icon))}

      <p className="text-xs text-gray-400 px-1">
        「本期淨利」為系統自動帶入（來自損益表該年度計算結果），計入保留盈餘的變動項目。其餘變動項目（現金股利分派、增資、提列公積等）與各權益種類的期初餘額，請自行新增與維護。
      </p>
    </div>
  )
}
