'use client'

/**
 * 主管戰情室（2026-07 新增）
 * 團隊視角：今日團隊行程、本月業務業績、待跟催報價、進行中叫修
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ShieldCheck, CalendarDays, Users, AlertTriangle, Wrench } from 'lucide-react'
import TodayAttendance from '@/components/TodayAttendance'

const num = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$${Math.round(num(v)).toLocaleString()}`

function Card({ icon, title, children, tone = 'gray' }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: string }) {
  const border = tone === 'red' ? 'border-red-200 bg-red-50/40' : tone === 'amber' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-white'
  return (
    <div className={`rounded-2xl border shadow-sm p-5 ${border}`}>
      <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">{icon} {title}</div>
      {children}
    </div>
  )
}

export default function ManagerDashboard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      const todayStr = new Date().toLocaleDateString('sv')
      const [sch, sp, q, so, sv] = await Promise.all([
        supabase.from('schedules').select('*, clients(company_name)').eq('schedule_date', todayStr).order('plan_start'),
        supabase.from('user_profiles').select('id, full_name'),
        supabase.from('quotes').select('id, quote_no, project_name, total_amount, status, valid_until, win_probability, salesperson_id, created_at, clients(company_name)'),
        supabase.from('sales_orders').select('salesperson_id, total_amount, status, created_at'),
        supabase.from('service_requests').select('id, service_no, equipment_name, status, client_id, clients(company_name)').not('status', 'in', '("已結案")'),
      ])
      setSchedules(sch.data ?? []); setPeople(sp.data ?? [])
      setQuotes(q.data ?? []); setSalesOrders(so.data ?? []); setServices(sv.data ?? [])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = (uid: string | null) => people.find(u => u.id === uid)?.full_name ?? '未指定'

  const schedByUser = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const s of schedules) {
      const k = nameOf(s.created_by)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, people])

  const perf = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    const inMonth = (d: any) => (d ?? '').slice(0, 7) === ym
    const WON = ['已確認', '已轉銷貨單', '已轉訂購單']
    const m = new Map<string, { cnt: number; amt: number; won: number; so: number }>()
    const g = (k: string) => { if (!m.has(k)) m.set(k, { cnt: 0, amt: 0, won: 0, so: 0 }); return m.get(k)! }
    quotes.filter(q => inMonth(q.created_at)).forEach(q => {
      const s = g(nameOf(q.salesperson_id)); s.cnt++; s.amt += num(q.total_amount)
      if (WON.includes(q.status)) s.won += num(q.total_amount)
    })
    salesOrders.filter(o => inMonth(o.created_at) && o.status !== '作廢').forEach(o => { g(nameOf(o.salesperson_id)).so += num(o.total_amount) })
    return [...m.entries()].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.so - a.so)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, salesOrders, people])

  // 待跟催：7天內到期或已過期、且尚未成交/作廢的報價
  const followUp = useMemo(() => {
    const today = new Date(new Date().toDateString())
    const soon = new Date(today); soon.setDate(today.getDate() + 7)
    return quotes
      .filter(q => !['已轉銷貨單', '已轉訂購單', '作廢'].includes(q.status))
      .filter(q => q.valid_until && new Date(q.valid_until) <= soon)
      .sort((a, b) => (a.valid_until ?? '').localeCompare(b.valid_until ?? ''))
      .slice(0, 12)
  }, [quotes])

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={22} className="text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">主管戰情室</h1>
        <span className="text-sm text-gray-400">團隊行程・業績・待跟催</span>
      </div>

      <Card icon={<CalendarDays size={16} className="text-blue-500" />} title={`今日團隊行程（${schedules.length} 件）`}>
        <TodayAttendance />
        {schedByUser.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">今天沒有行程</div> : (
          <div className="space-y-3">
            {schedByUser.map(([name, list]) => (
              <div key={name}>
                <div className="text-sm font-medium text-gray-700 mb-1">{name}<span className="text-xs text-gray-400 ml-2">{list.length} 件</span></div>
                {list.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-1.5 mb-1">
                    <span className="text-xs text-gray-500 w-24 shrink-0">{s.is_gap_task ? '空檔任務' : `${(s.plan_start ?? '').slice(0, 5)}–${(s.plan_end ?? '').slice(0, 5)}`}</span>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">{(s as any).clients?.company_name ?? s.type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${['已完成', '延誤完成'].includes(s.status) ? 'bg-green-100 text-green-700' : s.status === '進行中' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card icon={<Users size={16} className="text-emerald-600" />} title="本月業務業績">
          {perf.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">本月尚無資料</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b"><th className="py-1.5">業務</th><th className="text-right">報價</th><th className="text-right">成交</th><th className="text-right">銷貨</th></tr></thead>
              <tbody>
                {perf.map(r => (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="py-1.5 font-medium">{r.name}</td>
                    <td className="text-right text-gray-600">{r.cnt} 筆</td>
                    <td className="text-right text-green-700">{money(r.won)}</td>
                    <td className="text-right font-semibold text-blue-700">{money(r.so)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card icon={<AlertTriangle size={16} className="text-amber-600" />} title={`待跟催報價（7 天內到期，${followUp.length} 筆）`} tone={followUp.length > 0 ? 'amber' : 'gray'}>
          {followUp.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">沒有即將到期的報價</div> : (
            <div className="space-y-1.5">
              {followUp.map(q => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-3 text-sm bg-white rounded-lg px-3 py-2 border border-amber-100 hover:border-amber-300">
                  <span className="text-xs text-gray-500 shrink-0">{q.quote_no}</span>
                  <span className="flex-1 truncate">{(q as any).clients?.company_name ?? ''}{q.project_name ? `｜${q.project_name}` : ''}</span>
                  <span className="text-xs text-red-500 shrink-0">效期 {q.valid_until}</span>
                  <span className="font-medium shrink-0">{money(q.total_amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card icon={<Wrench size={16} className="text-purple-600" />} title={`進行中叫修（${services.length} 件）`}>
        {services.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">目前沒有進行中的叫修</div> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {services.map(s => (
              <Link key={s.id} href={`/service-requests/${s.id}`} className="flex items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100">
                <span className="text-xs text-gray-500 shrink-0">{s.service_no}</span>
                <span className="flex-1 truncate">{(s as any).clients?.company_name ?? ''}｜{s.equipment_name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">{s.status}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
