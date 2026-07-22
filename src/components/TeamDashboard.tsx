'use client'

/**
 * 團隊戰情室共用元件（2026-07）
 * 董事長／總經理／經理／主任 四個戰情室共用，依登入者與組織樹自動決定可見範圍：
 *   all     董事長：全公司
 *   gm      總經理：所有經理＋主任＋員工（＋自己）
 *   subtree 經理：自己底下的主任與其群組人員（組織樹子樹）
 *   direct  主任：自己群組（直屬人員）
 * 組織樹 = user_profiles.manager_id（上級主管），於人資戰情室設定
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { CalendarDays, Users, AlertTriangle, Wrench, Clock } from 'lucide-react'

const num = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$${Math.round(num(v)).toLocaleString()}`
const hhmm = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : null

export type TeamScope = 'all' | 'gm' | 'subtree' | 'direct' | 'manager' | 'acct-line' | 'tech-line' | 'self'
// manager   = 經理：自己支線 + 同通訊處的會計線/技術線
// acct-line = 會計主管：全區所有會計線人員（跨通訊處）
// tech-line = 技術主管：全區所有技術線人員（跨通訊處）
// self      = 個人：只看自己（會計人員等基層戰情室）

function Card({ icon, title, children, tone = 'gray' }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: string }) {
  const border = tone === 'amber' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-white'
  return (
    <div className={`rounded-2xl border shadow-sm p-5 ${border}`}>
      <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">{icon} {title}</div>
      {children}
    </div>
  )
}

export default function TeamDashboard({ pageTitle, scope, icon }: {
  pageTitle: string
  scope: TeamScope
  icon: React.ReactNode
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [people, setPeople] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [workStart, setWorkStart] = useState('09:00')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUid(user?.id ?? null)
      const todayStr = new Date().toLocaleDateString('sv')
      const [sp, br, sch, at, q, so, sv, st] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, is_active, title, manager_id, branch_id'),
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('schedules').select('*, clients(company_name)').eq('schedule_date', todayStr).order('plan_start'),
        supabase.from('attendance_records').select('*').eq('work_date', todayStr),
        supabase.from('quotes').select('id, quote_no, project_name, total_amount, status, valid_until, salesperson_id, created_at, clients(company_name)'),
        supabase.from('sales_orders').select('salesperson_id, total_amount, status, created_at'),
        supabase.from('service_requests').select('id, service_no, equipment_name, status, clients(company_name)').not('status', 'in', '("已結案")'),
        supabase.from('system_settings').select('work_start_time').limit(1).maybeSingle(),
      ])
      setPeople(sp.data ?? []); setBranches(br.data ?? [])
      setSchedules(sch.data ?? []); setAttendance(at.data ?? [])
      setQuotes(q.data ?? []); setSalesOrders(so.data ?? []); setServices(sv.data ?? [])
      if ((st.data as any)?.work_start_time) setWorkStart((st.data as any).work_start_time)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 可見人員（依 scope 與組織樹）
  const visible = useMemo(() => {
    const act = people.filter(p => p.is_active !== false)
    if (scope === 'all') return act
    if (scope === 'gm') return act.filter(p => !['董事長', 'CEO', '總經理'].includes(p.title ?? '員工') || p.id === uid)
    if (!uid) return []
    if (scope === 'self') return act.filter(p => p.id === uid)
    if (scope === 'direct') return act.filter(p => p.manager_id === uid || p.id === uid)

    // 職能線判定：本人或任一上級的職稱 = 指定主管職稱
    const inLine = (p: any, headTitle: string): boolean => {
      let cur: any = p
      const seen = new Set<string>()
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id)
        if ((cur.title ?? '') === headTitle) return true
        cur = act.find(x => x.id === cur.manager_id)
      }
      return false
    }
    if (scope === 'acct-line') return act.filter(p => inLine(p, '會計主管') || p.id === uid)
    if (scope === 'tech-line') return act.filter(p => inLine(p, '技術主管') || p.id === uid)
    // subtree / manager：BFS 找所有下屬
    const ids = new Set<string>([uid])
    let grew = true
    while (grew) {
      grew = false
      for (const p of act) {
        if (!ids.has(p.id) && p.manager_id && ids.has(p.manager_id)) { ids.add(p.id); grew = true }
      }
    }

    // 經理：加上「同通訊處」的會計線與技術線
    if (scope === 'manager') {
      const me = act.find(p => p.id === uid)
      const myBranch = me?.branch_id ?? null
      if (myBranch) {
        // 判斷某人屬於會計線或技術線：本人或任一上級的職稱是會計主管/技術主管
        const lineOf = (p: any): boolean => {
          let cur: any = p
          const seen = new Set<string>()
          while (cur && !seen.has(cur.id)) {
            seen.add(cur.id)
            if (['會計主管', '技術主管'].includes(cur.title ?? '')) return true
            cur = act.find(x => x.id === cur.manager_id)
          }
          return false
        }
        for (const p of act) {
          if (!ids.has(p.id) && p.branch_id === myBranch && lineOf(p)) ids.add(p.id)
        }
      }
    }

    return act.filter(p => ids.has(p.id))
  }, [people, scope, uid])

  const vIds = useMemo(() => new Set(visible.map(p => p.id)), [visible])
  const nameOf = (id: string | null) => people.find(u => u.id === id)?.full_name ?? '未指定'

  const mySchedules = schedules.filter(s => vIds.has(s.created_by))
  const schedByUser = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const s of mySchedules) {
      const k = nameOf(s.created_by)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, visible])

  const perf = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    const inMonth = (d: any) => (d ?? '').slice(0, 7) === ym
    const WON = ['已確認', '已轉銷貨單', '已轉訂購單']
    const m = new Map<string, { cnt: number; amt: number; won: number; so: number }>()
    const g = (k: string) => { if (!m.has(k)) m.set(k, { cnt: 0, amt: 0, won: 0, so: 0 }); return m.get(k)! }
    quotes.filter(q => inMonth(q.created_at) && q.salesperson_id && vIds.has(q.salesperson_id)).forEach(q => {
      const s = g(nameOf(q.salesperson_id)); s.cnt++; s.amt += num(q.total_amount)
      if (WON.includes(q.status)) s.won += num(q.total_amount)
    })
    salesOrders.filter(o => inMonth(o.created_at) && o.status !== '作廢' && o.salesperson_id && vIds.has(o.salesperson_id))
      .forEach(o => { g(nameOf(o.salesperson_id)).so += num(o.total_amount) })
    return [...m.entries()].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.so - a.so)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, salesOrders, visible])

  const followUp = useMemo(() => {
    const today = new Date(new Date().toDateString())
    const soon = new Date(today); soon.setDate(today.getDate() + 7)
    return quotes
      .filter(q => !['已轉銷貨單', '已轉訂購單', '作廢'].includes(q.status))
      .filter(q => scope === 'all' || scope === 'gm' ? true : (q.salesperson_id && vIds.has(q.salesperson_id)))
      .filter(q => q.valid_until && new Date(q.valid_until) <= soon)
      .sort((a, b) => (a.valid_until ?? '').localeCompare(b.valid_until ?? ''))
      .slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, visible, scope])

  // 出勤（可見人員，依通訊處分組）
  const attGroups = useMemo(() => {
    const gs: { name: string; members: any[] }[] = [
      ...branches.map(b => ({ name: b.name, members: visible.filter(p => p.branch_id === b.id) })),
      { name: '未分配通訊處', members: visible.filter(p => !p.branch_id || !branches.some(b => b.id === p.branch_id)) },
    ]
    return gs.filter(g => g.members.length > 0)
  }, [branches, visible])

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        {icon}
        <h1 className="text-xl font-bold text-gray-900">{pageTitle}</h1>
        <span className="text-sm text-gray-400">可見範圍：{visible.length} 人</span>
      </div>

      <Card icon={<Clock size={16} className="text-emerald-600" />} title={`今日出勤打卡（上班時間 ${workStart}，遲到紅字）`}>
        {attGroups.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">沒有可見人員，請先到人資戰情室設定「上級主管」組織樹</div> : (
          <div className="space-y-2">
            {attGroups.map(g => (
              <div key={g.name}>
                <div className="text-[11px] text-gray-400 mb-1">{g.name}（{g.members.length} 人）</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.members.map(p => {
                    const r = attendance.find(x => x.user_id === p.id)
                    const inT = hhmm(r?.clock_in ?? null)
                    const outT = hhmm(r?.clock_out ?? null)
                    const late = !!inT && inT > workStart
                    return (
                      <span key={p.id} className={`text-xs px-2.5 py-1 rounded-full border ${
                        !inT ? 'bg-gray-50 border-gray-200 text-gray-400'
                        : late ? 'bg-red-50 border-red-200 text-red-600 font-semibold'
                        : 'bg-green-50 border-green-200 text-green-700'}`}>
                        {p.full_name ?? '—'}{p.title ? `（${p.title}）` : ''}：{!inT ? '未打卡' : `${inT}${late ? '（遲到）' : ''}`}{outT ? ` – ${outT}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card icon={<CalendarDays size={16} className="text-blue-500" />} title={`今日團隊行程（${mySchedules.length} 件）`}>
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
        <Card icon={<Users size={16} className="text-emerald-600" />} title="本月團隊業績">
          {perf.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">本月尚無資料</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b"><th className="py-1.5">人員</th><th className="text-right">報價</th><th className="text-right">成交</th><th className="text-right">銷貨</th></tr></thead>
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

      {(scope === 'all' || scope === 'gm') && (
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
      )}
    </div>
  )
}
