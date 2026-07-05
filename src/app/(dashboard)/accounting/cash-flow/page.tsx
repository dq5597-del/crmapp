'use client'
import { useEffect, useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, ArrowRightLeft, Plus, Trash2, Pencil, Check, X } from 'lucide-react'

type Account = {
  id: string
  year: number
  section: string
  name: string
  amount: number
  is_system: boolean
  system_key: string | null
  sort_order: number
}

type CashFlowData = {
  year: number
  accounts: Account[]
  operatingTotal: number
  investingTotal: number
  financingTotal: number
  netChange: number
  beginningCash: number
  endingCash: number
}

const SECTIONS: { key: string; label: string }[] = [
  { key: 'operating', label: '營業活動之現金流量' },
  { key: 'investing', label: '投資活動之現金流量' },
  { key: 'financing', label: '籌資活動之現金流量' },
]

function fmt(n: number) {
  const sign = n < 0 ? '-' : ''
  return sign + 'NT$' + Math.round(Math.abs(n)).toLocaleString()
}

export default function CashFlowPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<CashFlowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingBeginning, setEditingBeginning] = useState(false)
  const [beginningInput, setBeginningInput] = useState('')
  const [savingBeginning, setSavingBeginning] = useState(false)

  useEffect(() => {
    fetchData()
  }, [year])

  async function fetchData() {
    setLoading(true)
    const res = await fetch(`/api/accounting/cash-flow?year=${year}`)
    const json = await res.json()
    setData(json)
    setBeginningInput(String(json.beginningCash ?? 0))
    setLoading(false)
  }

  function startEdit(a: Account) {
    setEditingId(a.id)
    setEditValue(String(a.amount))
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    const val = editValue.trim() === '' ? 0 : Number(editValue)
    await fetch('/api/accounting/cash-flow', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, amount: val }),
    })
    setEditingId(null)
    setSavingId(null)
    await fetchData()
  }

  async function deleteAccount(id: string) {
    if (!confirm('確定刪除此項目？')) return
    await fetch('/api/accounting/cash-flow', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchData()
  }

  async function addAccount(section: string) {
    const name = (newNames[section] || '').trim()
    if (!name) return
    setAdding(section)
    await fetch('/api/accounting/cash-flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, section, name, amount: 0 }),
    })
    setNewNames(prev => ({ ...prev, [section]: '' }))
    setAdding(null)
    await fetchData()
  }

  async function saveBeginning() {
    setSavingBeginning(true)
    const val = beginningInput.trim() === '' ? 0 : Number(beginningInput)
    await fetch('/api/accounting/cash-flow', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, beginningCash: val }),
    })
    setSavingBeginning(false)
    setEditingBeginning(false)
    await fetchData()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!data) return null

  function sectionAccounts(section: string) {
    return data!.accounts.filter(a => a.section === section)
  }

  function sectionTotal(section: string) {
    return sectionAccounts(section).reduce((s, a) => s + a.amount, 0)
  }

  function renderSection(section: string, label: string) {
    const accounts = sectionAccounts(section)
    return (
      <div key={section} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{label}</h2>
          <span className="font-bold text-gray-900">{fmt(sectionTotal(section))}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {accounts.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">尚無項目</p>
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
        </div>
        <div className="flex gap-2 px-6 py-3 bg-gray-50/50">
          <input
            value={newNames[section] || ''}
            onChange={e => setNewNames(prev => ({ ...prev, [section]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addAccount(section)}
            placeholder="新增調整項目名稱"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => addAccount(section)}
            disabled={adding === section || !(newNames[section] || '').trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            <Plus size={13} /> 新增
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">現金流量表</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2">
          {[currentYear, currentYear - 1, currentYear - 2].map(y => (
            <option key={y} value={y}>{y} 年</option>
          ))}
        </select>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-blue-500" />
            <span className="text-xs text-gray-500">營業活動現金流量</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.operatingTotal)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRightLeft size={16} className="text-purple-500" />
            <span className="text-xs text-gray-500">投資活動現金流量</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.investingTotal)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={16} className="text-amber-500" />
            <span className="text-xs text-gray-500">籌資活動現金流量</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.financingTotal)}</div>
        </div>
        <div className={`bg-white rounded-2xl border p-4 ${data.netChange >= 0 ? 'border-green-100' : 'border-red-100'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={16} className={data.netChange >= 0 ? 'text-green-500' : 'text-red-500'} />
            <span className="text-xs text-gray-500">本期現金增減淨額</span>
          </div>
          <div className={`text-lg font-bold ${data.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(data.netChange)}
          </div>
        </div>
      </div>

      {renderSection('operating', '營業活動之現金流量')}
      {renderSection('investing', '投資活動之現金流量')}
      {renderSection('financing', '籌資活動之現金流量')}

      {/* 期初/期末現金餘額 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">現金餘額調節</h2>
        </div>
        <div className="divide-y divide-gray-50">
          <div className="flex items-center gap-2 px-6 py-3">
            <span className="text-sm text-gray-700 flex-1">期初現金餘額</span>
            {editingBeginning ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={beginningInput}
                  onChange={e => setBeginningInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBeginning()}
                  autoFocus
                  className="w-32 text-sm border border-gray-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={saveBeginning} disabled={savingBeginning} className="text-green-500 hover:text-green-600 shrink-0">
                  <Check size={16} />
                </button>
                <button onClick={() => setEditingBeginning(false)} className="text-gray-300 hover:text-gray-500 shrink-0">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmt(data.beginningCash)}</span>
                <button onClick={() => setEditingBeginning(true)} className="text-gray-300 hover:text-gray-500 p-1 shrink-0">
                  <Pencil size={13} />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-6 py-3">
            <span className="text-sm text-gray-700 flex-1">本期現金增減淨額</span>
            <span className={`text-sm font-medium w-28 text-right ${data.netChange < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmt(data.netChange)}</span>
          </div>
          <div className="flex items-center gap-2 px-6 py-3 bg-gray-50/50">
            <span className="text-sm font-bold text-gray-900 flex-1">期末現金餘額</span>
            <span className="text-base font-bold text-blue-700 w-28 text-right">{fmt(data.endingCash)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 px-1">
        本表採間接法編製。「本期淨利」為系統自動帶入（來自損益表該年度計算結果），其餘調整項目（如應收帳款增減、投資、籌資活動）請自行新增與維護。
      </p>
    </div>
  )
}
