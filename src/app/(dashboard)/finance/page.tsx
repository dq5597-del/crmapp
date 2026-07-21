'use client'

/**
 * 會計戰情室（2026-07 新增）
 * 應收/應付總覽、逾期清單、7 日內到期收付、本月收付統計
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, CalendarClock } from 'lucide-react'

const num = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$${Math.round(num(v)).toLocaleString()}`
const balOf = (x: any) => num(x.balance ?? x.amount)

function Kpi({ label, value, color = 'text-gray-900' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default function FinanceDashboard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [ar, setAr] = useState<any[]>([])
  const [ap, setAp] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      const [r, p] = await Promise.all([
        supabase.from('receivables').select('*, clients(company_name)').neq('status', '已收款'),
        supabase.from('payables').select('*, vendors(company_name)').neq('status', '已付款'),
      ])
      setAr(r.data ?? []); setAp(p.data ?? [])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const view = useMemo(() => {
    const today = new Date(new Date().toDateString())
    const soon = new Date(today); soon.setDate(today.getDate() + 7)
    const isOver = (x: any) => x.due_date && new Date(x.due_date) < today
    const isSoon = (x: any) => x.due_date && new Date(x.due_date) >= today && new Date(x.due_date) <= soon

    const arTotal = ar.reduce((s, x) => s + balOf(x), 0)
    const apTotal = ap.reduce((s, x) => s + balOf(x), 0)
    const arOver = ar.filter(isOver)
    const apOver = ap.filter(isOver)
    const arSoon = ar.filter(isSoon).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    const apSoon = ap.filter(isSoon).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

    return {
      arTotal, apTotal,
      arOverSum: arOver.reduce((s, x) => s + balOf(x), 0),
      apOverSum: apOver.reduce((s, x) => s + balOf(x), 0),
      arOver: arOver.sort((a, b) => balOf(b) - balOf(a)).slice(0, 10),
      apOver: apOver.sort((a, b) => balOf(b) - balOf(a)).slice(0, 10),
      arSoon: arSoon.slice(0, 10), apSoon: apSoon.slice(0, 10),
      net: arTotal - apTotal,
    }
  }, [ar, ap])

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Calculator size={22} className="text-emerald-600" />
        <h1 className="text-xl font-bold text-gray-900">會計戰情室</h1>
        <span className="text-sm text-gray-400">應收應付・逾期・到期提醒</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi label="應收未收" value={money(view.arTotal)} color="text-blue-700" />
        <Kpi label="逾期未收" value={money(view.arOverSum)} color={view.arOverSum > 0 ? 'text-red-600' : 'text-gray-400'} />
        <Kpi label="應付未付" value={money(view.apTotal)} color="text-amber-700" />
        <Kpi label="逾期未付" value={money(view.apOverSum)} color={view.apOverSum > 0 ? 'text-red-600' : 'text-gray-400'} />
        <Kpi label="淨部位（收-付）" value={money(view.net)} color={view.net >= 0 ? 'text-green-700' : 'text-red-600'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-red-200 bg-red-50/40 shadow-sm p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3"><AlertTriangle size={16} className="text-red-500" /> 逾期應收（前 10 大）</div>
          {view.arOver.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">沒有逾期應收 🎉</div> : view.arOver.map(x => (
            <Link key={x.id} href="/receivables" className="flex items-center gap-3 text-sm bg-white rounded-lg px-3 py-2 mb-1.5 border border-red-100 hover:border-red-300">
              <span className="flex-1 truncate">{(x as any).clients?.company_name ?? '—'}</span>
              <span className="text-xs text-red-500 shrink-0">到期 {x.due_date}</span>
              <span className="font-semibold text-red-600 shrink-0">{money(balOf(x))}</span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50/40 shadow-sm p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3"><AlertTriangle size={16} className="text-red-500" /> 逾期應付（前 10 大）</div>
          {view.apOver.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">沒有逾期應付 🎉</div> : view.apOver.map(x => (
            <Link key={x.id} href={`/payables/${x.id}`} className="flex items-center gap-3 text-sm bg-white rounded-lg px-3 py-2 mb-1.5 border border-red-100 hover:border-red-300">
              <span className="flex-1 truncate">{(x as any).vendors?.company_name ?? '—'}</span>
              <span className="text-xs text-red-500 shrink-0">到期 {x.due_date}</span>
              <span className="font-semibold text-red-600 shrink-0">{money(balOf(x))}</span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3"><TrendingUp size={16} className="text-blue-500" /><CalendarClock size={14} className="text-gray-400" /> 7 日內到期應收</div>
          {view.arSoon.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">7 日內沒有到期應收</div> : view.arSoon.map(x => (
            <div key={x.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
              <span className="flex-1 truncate">{(x as any).clients?.company_name ?? '—'}</span>
              <span className="text-xs text-gray-500 shrink-0">{x.due_date}</span>
              <span className="font-medium text-blue-700 shrink-0">{money(balOf(x))}</span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
          <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3"><TrendingDown size={16} className="text-amber-500" /><CalendarClock size={14} className="text-gray-400" /> 7 日內到期應付</div>
          {view.apSoon.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">7 日內沒有到期應付</div> : view.apSoon.map(x => (
            <div key={x.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
              <span className="flex-1 truncate">{(x as any).vendors?.company_name ?? '—'}</span>
              <span className="text-xs text-gray-500 shrink-0">{x.due_date}</span>
              <span className="font-medium text-amber-700 shrink-0">{money(balOf(x))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
