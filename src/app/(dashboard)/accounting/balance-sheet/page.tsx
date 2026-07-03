'use client'
import { useEffect, useState } from 'react'
import { Landmark, Scale, Wallet, AlertTriangle, Plus, Trash2, Pencil, Check, RotateCcw, X } from 'lucide-react'

type Account = {
  id: string
  section: string
  name: string
  balance: number | null
  is_system: boolean
  system_key: string | null
  sort_order: number
  displayBalance: number
  isAuto: boolean
}

type BalanceSheetData = {
  accounts: Account[]
  currentAssets: number
  nonCurrentAssets: number
  totalAssets: number
  currentLiabilities: number
  nonCurrentLiabilities: number
  totalLiabilities: number
  shareCapital: number
  capitalSurplus: number
  retainedEarnings: number
  totalEquity: number
  totalLiabilitiesAndEquity: number
  balanceDiff: number
}

const SECTIONS: { key: string; label: string; group: 'asset' | 'liability' | 'equity' }[] = [
  { key: 'current_asset', label: '流動資產', group: 'asset' },
  { key: 'noncurrent_asset', label: '非流動資產', group: 'asset' },
  { key: 'current_liability', label: '流動負債', group: 'liability' },
  { key: 'noncurrent_liability', label: '非流動負債', group: 'liability' },
  { key: 'share_capital', label: '股本', group: 'equity' },
  { key: 'capital_surplus', label: '資本公積', group: 'equity' },
  { key: 'retained_earnings', label: '保留盈餘', group: 'equity' },
]

const GROUP_META: Record<string, { label: string; color: string }> = {
  asset: { label: '資產', color: 'text-blue-600' },
  liability: { label: '負債', color: 'text-red-500' },
  equity: { label: '權益', color: 'text-green-600' },
}

function fmt(n: number) {
  const sign = n < 0 ? '-' : ''
  return sign + 'NT$' + Math.round(Math.abs(n)).toLocaleString()
}

export default function BalanceSheetPage() {
  const [data, setData] = useState<BalanceSheetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const res = await fetch('/api/accounting/balance-sheet')
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  function startEdit(a: Account) {
    setEditingId(a.id)
    setEditValue(String(a.displayBalance))
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    const val = editValue.trim() === '' ? 0 : Number(editValue)
    await fetch('/api/accounting/balance-sheet', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, balance: val }),
    })
    setEditingId(null)
    setSavingId(null)
    await fetchData()
  }

  async function resetToAuto(id: string) {
    setSavingId(id)
    await fetch('/api/accounting/balance-sheet', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resetToAuto: true }),
    })
    setSavingId(null)
    await fetchData()
  }

  async function deleteAccount(id: string) {
    if (!confirm('確定刪除此科目？')) return
    const res = await fetch('/api/accounting/balance-sheet', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error || '刪除失敗')
      return
    }
    await fetchData()
  }

  async function addAccount(section: string) {
    const name = (newNames[section] || '').trim()
    if (!name) return
    setAdding(section)
    await fetch('/api/accounting/balance-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, name, balance: 0 }),
    })
    setNewNames(prev => ({ ...prev, [section]: '' }))
    setAdding(null)
    await fetchData()
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!data) return null

  const balanced = Math.abs(data.balanceDiff) < 1

  function sectionAccounts(section: string) {
    return data!.accounts.filter(a => a.section === section)
  }

  function sectionTotal(section: string) {
    return sectionAccounts(section).reduce((s, a) => s + a.displayBalance, 0)
  }

  function renderSection(section: string, label: string) {
    const accounts = sectionAccounts(section)
    return (
      <div key={section} className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
          <span className="text-sm font-semibold text-gray-800">{label}</span>
          <span className="text-sm font-bold text-gray-900">{fmt(sectionTotal(section))}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {accounts.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">尚無科目</p>
          )}
          {accounts.map(a => (
            <div key={a.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="text-sm text-gray-700 flex-1 flex items-center gap-1.5">
                {a.name}
                {a.is_system && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 shrink-0">系統</span>
                )}
                {a.is_system && a.isAuto && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 shrink-0">自動帶入</span>
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
                  <span className="text-sm font-medium text-gray-900 w-28 text-right">{fmt(a.displayBalance)}</span>
                  <button onClick={() => startEdit(a)} className="text-gray-300 hover:text-gray-500 p-1 shrink-0">
                    <Pencil size={13} />
                  </button>
                  {a.is_system && !a.isAuto && (
                    <button onClick={() => resetToAuto(a.id)} title="還原自動計算" className="text-gray-300 hover:text-blue-500 p-1 shrink-0">
                      <RotateCcw size={13} />
                    </button>
                  )}
                  {!a.is_system && (
                    <button onClick={() => deleteAccount(a.id)} className="text-gray-300 hover:text-red-500 p-1 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-4 py-2.5 bg-gray-50/50">
          <input
            value={newNames[section] || ''}
            onChange={e => setNewNames(prev => ({ ...prev, [section]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addAccount(section)}
            placeholder="新增科目名稱"
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

  const today = new Date().toLocaleDateString('zh-TW')

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">資產負債表</h1>
          <p className="text-xs text-gray-400 mt-0.5">截至 {today}</p>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Landmark size={16} className="text-blue-500" />
            <span className="text-xs text-gray-500">資產總額</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.totalAssets)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={16} className="text-red-400" />
            <span className="text-xs text-gray-500">負債總額</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.totalLiabilities)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={16} className="text-green-500" />
            <span className="text-xs text-gray-500">權益總額</span>
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(data.totalEquity)}</div>
        </div>
        <div className={`bg-white rounded-2xl border p-4 ${balanced ? 'border-green-100' : 'border-red-100'}`}>
          <div className="flex items-center gap-2 mb-2">
            {balanced ? <Check size={16} className="text-green-500" /> : <AlertTriangle size={16} className="text-red-500" />}
            <span className="text-xs text-gray-500">平衡差額</span>
          </div>
          <div className={`text-lg font-bold ${balanced ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(data.balanceDiff)}
          </div>
          {!balanced && <p className="text-[11px] text-red-400 mt-0.5">資產 ≠ 負債＋權益</p>}
        </div>
      </div>

      {/* 資產 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={`font-bold ${GROUP_META.asset.color}`}>資產</h2>
          <span className="font-bold text-gray-900">{fmt(data.totalAssets)}</span>
        </div>
        {renderSection('current_asset', '流動資產')}
        {renderSection('noncurrent_asset', '非流動資產')}
      </div>

      {/* 負債 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={`font-bold ${GROUP_META.liability.color}`}>負債</h2>
          <span className="font-bold text-gray-900">{fmt(data.totalLiabilities)}</span>
        </div>
        {renderSection('current_liability', '流動負債')}
        {renderSection('noncurrent_liability', '非流動負債')}
      </div>

      {/* 權益 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={`font-bold ${GROUP_META.equity.color}`}>權益</h2>
          <span className="font-bold text-gray-900">{fmt(data.totalEquity)}</span>
        </div>
        {renderSection('share_capital', '股本')}
        {renderSection('capital_surplus', '資本公積')}
        {renderSection('retained_earnings', '保留盈餘')}
      </div>

      <p className="text-xs text-gray-400 px-1">
        「系統」科目（應收帳款、存貨、應付帳款、保留盈餘）預設自動帶入即時計算值，手動修改後以手動金額為準；可點選還原圖示恢復自動計算。
      </p>
    </div>
  )
}
