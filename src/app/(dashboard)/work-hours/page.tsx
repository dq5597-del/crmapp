'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Clock, Users, FolderKanban, Download, TrendingUp, FileSignature } from 'lucide-react'

// ============================================================
// 工時統計（跨專案彙總）
//   資料來源：project_work_logs（沿用專案頁的手動登錄，不動打卡系統）
//   三種視角：按專案 / 按人員 / 按月份
// ============================================================

type WorkLog = {
  id: string
  project_id: string
  work_date: string
  member_kind: string
  name: string
  hours: number
  rate_type: string
  rate: number
  cost: number
  work_item: string | null
}

type Proj = {
  id: string
  client_id: string | null
  project_code: string | null
  project_name: string
  status: string
  budget_labor: number | null
  budget_outsource: number | null
  clients?: { company_name: string } | null
}

const n = (v: any) => Number(v ?? 0) || 0
const nf = (v: number) => Math.round(v).toLocaleString('zh-TW')
const hf = (v: number) => (Math.round(v * 10) / 10).toLocaleString('zh-TW')

const KIND_COLORS: Record<string, string> = {
  '員工': 'bg-blue-100 text-blue-700',
  '協力廠商': 'bg-purple-100 text-purple-700',
  '臨時工': 'bg-amber-100 text-amber-700',
}
const STATUS_COLORS: Record<string, string> = {
  '草稿/報價中': 'bg-purple-100 text-purple-700',
  '施工中': 'bg-orange-100 text-orange-700',
  '完工驗收': 'bg-blue-100 text-blue-700',
  '結案': 'bg-green-100 text-green-700',
  '暫停': 'bg-yellow-100 text-yellow-700',
  '取消': 'bg-gray-100 text-gray-600',
}

const VIEWS = ['按專案', '按人員', '按月份'] as const
type View = typeof VIEWS[number]

const yearStart = (y: number) => `${y}-01-01`
const yearEnd = (y: number) => `${y}-12-31`

function csvEscape(v: any) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(filename: string, header: string[], rows: any[][]) {
  const body = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')
  // BOM 讓 Excel 正確辨識 UTF-8 中文
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function WorkHoursPage() {
  const supabase = createClient()
  const thisYear = new Date().getFullYear()

  const [logs, setLogs] = useState<WorkLog[]>([])
  const [projects, setProjects] = useState<Proj[]>([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)

  const [view, setView] = useState<View>('按專案')
  const [from, setFrom] = useState(yearStart(thisYear))
  const [to, setTo] = useState(yearEnd(thisYear))
  const [kindFilter, setKindFilter] = useState('全部')

  useEffect(() => { load() }, [from, to])

  async function load() {
    setLoading(true)
    const [wRes, pRes] = await Promise.all([
      supabase.from('project_work_logs').select('*')
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }),
      supabase.from('projects')
        .select('id, client_id, project_code, project_name, status, budget_labor, budget_outsource, clients(company_name)'),
    ])
    if (wRes.error) { console.error(wRes.error); setNoTable(true) }
    setLogs((wRes.data as any) ?? [])
    setProjects((pRes.data as any) ?? [])
    setLoading(false)
  }

  const projMap = useMemo(() => {
    const m: Record<string, Proj> = {}
    projects.forEach(p => { m[p.id] = p })
    return m
  }, [projects])

  const rows = useMemo(
    () => (kindFilter === '全部' ? logs : logs.filter(l => l.member_kind === kindFilter)),
    [logs, kindFilter]
  )

  const kinds = useMemo(() => {
    const s = new Set(logs.map(l => l.member_kind).filter(Boolean))
    return ['全部', ...Array.from(s)]
  }, [logs])

  /** 外包計件不算人工，另計 */
  const isOutsource = (r: WorkLog) => r.rate_type === '外包計件'

  const kpi = useMemo(() => {
    const hours = rows.reduce((s, r) => s + n(r.hours), 0)
    const labor = rows.filter(r => !isOutsource(r)).reduce((s, r) => s + n(r.cost), 0)
    const outsource = rows.filter(isOutsource).reduce((s, r) => s + n(r.cost), 0)
    const people = new Set(rows.map(r => r.name)).size
    const manDays = rows.length
    return { hours, labor, outsource, people, manDays }
  }, [rows])

  /** 按專案 */
  const byProject = useMemo(() => {
    const m: Record<string, { hours: number; labor: number; outsource: number; people: Set<string>; days: Set<string> }> = {}
    rows.forEach(r => {
      const k = r.project_id ?? 'unknown'
      m[k] ??= { hours: 0, labor: 0, outsource: 0, people: new Set(), days: new Set() }
      m[k].hours += n(r.hours)
      if (isOutsource(r)) m[k].outsource += n(r.cost)
      else m[k].labor += n(r.cost)
      m[k].people.add(r.name)
      m[k].days.add(r.work_date)
    })
    return Object.entries(m)
      .map(([pid, v]) => {
        const p = projMap[pid]
        const budget = n(p?.budget_labor) + n(p?.budget_outsource)
        const actual = v.labor + v.outsource
        return {
          pid,
          clientId: p?.client_id ?? null,
          code: p?.project_code ?? '—',
          name: p?.project_name ?? '（已刪除或未知專案）',
          client: p?.clients?.company_name ?? '—',
          status: p?.status ?? '—',
          hours: v.hours,
          labor: v.labor,
          outsource: v.outsource,
          people: v.people.size,
          days: v.days.size,
          budget,
          diff: budget > 0 ? budget - actual : null,
        }
      })
      .sort((a, b) => b.hours - a.hours)
  }, [rows, projMap])

  /** 按人員 */
  const byPerson = useMemo(() => {
    const m: Record<string, { kind: string; hours: number; cost: number; days: Set<string>; projects: Set<string> }> = {}
    rows.forEach(r => {
      const k = r.name || '（未填姓名）'
      m[k] ??= { kind: r.member_kind, hours: 0, cost: 0, days: new Set(), projects: new Set() }
      m[k].hours += n(r.hours)
      m[k].cost += n(r.cost)
      m[k].days.add(r.work_date)
      m[k].projects.add(r.project_id)
    })
    return Object.entries(m)
      .map(([name, v]) => ({
        name, kind: v.kind, hours: v.hours, cost: v.cost,
        days: v.days.size, projects: v.projects.size,
        avg: v.days.size > 0 ? v.hours / v.days.size : 0,
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [rows])

  /** 按月份 */
  const byMonth = useMemo(() => {
    const m: Record<string, { hours: number; labor: number; outsource: number; people: Set<string> }> = {}
    rows.forEach(r => {
      const k = (r.work_date ?? '').slice(0, 7)
      if (!k) return
      m[k] ??= { hours: 0, labor: 0, outsource: 0, people: new Set() }
      m[k].hours += n(r.hours)
      if (isOutsource(r)) m[k].outsource += n(r.cost)
      else m[k].labor += n(r.cost)
      m[k].people.add(r.name)
    })
    return Object.entries(m)
      .map(([month, v]) => ({ month, ...v, people: v.people.size }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [rows])

  const maxMonthHours = Math.max(1, ...byMonth.map(r => r.hours))

  function exportCsv() {
    if (view === '按專案') {
      downloadCsv(`工時統計_按專案_${from}_${to}.csv`,
        ['專案代碼', '案名', '客戶', '狀態', '總工時', '出工人次', '人數', '人工成本', '外包費用', '人工預算', '預算差額'],
        byProject.map(r => [r.code, r.name, r.client, r.status, r.hours, r.days, r.people, r.labor, r.outsource, r.budget || '', r.diff ?? '']))
    } else if (view === '按人員') {
      downloadCsv(`工時統計_按人員_${from}_${to}.csv`,
        ['姓名', '身分', '總工時', '出工天數', '平均每日工時', '參與專案數', '成本'],
        byPerson.map(r => [r.name, r.kind, r.hours, r.days, Math.round(r.avg * 10) / 10, r.projects, r.cost]))
    } else {
      downloadCsv(`工時統計_按月份_${from}_${to}.csv`,
        ['月份', '總工時', '人工成本', '外包費用', '出工人數'],
        byMonth.map(r => [r.month, r.hours, r.labor, r.outsource, r.people]))
    }
  }

  const th = 'text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap'
  const thR = 'text-right px-4 py-3 text-gray-600 font-medium whitespace-nowrap'
  const td = 'px-4 py-2.5'
  const tdR = 'px-4 py-2.5 text-right tabular-nums'

  if (noTable) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          尚未建立工時資料表。請先到 Supabase SQL Editor 執行 <code className="bg-white px-1.5 py-0.5 rounded">sql/project_work_logs.sql</code>，
          或先到任一專案的「工時紀錄」頁籤登錄一筆資料。
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Clock size={20} className="text-blue-600" /> 工時統計
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {from} ~ {to}　共 {rows.length} 筆登錄
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/work-hours/confirmations"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
            <FileSignature size={14} /> 工時確認單
          </Link>
          <button onClick={exportCsv} disabled={rows.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <Download size={14} /> 匯出 CSV
          </button>
        </div>
      </div>

      {/* 篩選 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">起始日</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">結束日</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-1.5">
            {[thisYear, thisYear - 1, thisYear - 2].map(y => (
              <button key={y} onClick={() => { setFrom(yearStart(y)); setTo(yearEnd(y)) }}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${
                  from === yearStart(y) && to === yearEnd(y)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {y} 年
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <label className="block text-xs text-gray-500 mb-1">身分</label>
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {kinds.map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi icon={<Clock size={16} />} label="總工時" value={`${hf(kpi.hours)} 小時`} tone="blue"
          sub={`${kpi.manDays} 人次出工`} />
        <Kpi icon={<Users size={16} />} label="人工成本" value={`NT$${nf(kpi.labor)}`} tone="amber"
          sub={`${kpi.people} 人參與`} />
        <Kpi icon={<FolderKanban size={16} />} label="外包費用" value={`NT$${nf(kpi.outsource)}`} tone="purple"
          sub="計件，不計入工時成本" />
        <Kpi icon={<TrendingUp size={16} />} label="合計人力支出" value={`NT$${nf(kpi.labor + kpi.outsource)}`} tone="green"
          sub={kpi.hours > 0 ? `平均 NT$${nf((kpi.labor + kpi.outsource) / kpi.hours)}／小時` : '—'} />
      </div>

      {/* 視角切換 */}
      <div className="flex gap-2 mb-4">
        {VIEWS.map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
              view === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>這段期間沒有工時登錄</p>
          <p className="text-xs mt-1">到專案資料夾 → 開啟專案 → 「工時紀錄」頁籤登錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {/* ── 按專案 ── */}
            {view === '按專案' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className={th}>專案代碼</th>
                    <th className={th}>案名</th>
                    <th className={th}>客戶</th>
                    <th className={th}>狀態</th>
                    <th className={thR}>總工時</th>
                    <th className={thR}>人次</th>
                    <th className={thR}>人工成本</th>
                    <th className={thR}>外包</th>
                    <th className={thR}>預算差額</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map(r => (
                    <tr key={r.pid} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className={td + ' font-mono text-xs text-gray-500'}>{r.code}</td>
                      <td className={td}>
                        {r.clientId ? (
                          <Link href={`/clients/${r.clientId}?tab=projects&edit=${r.pid}`}
                            className="font-medium text-gray-900 hover:text-blue-600">
                            {r.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{r.name}</span>
                        )}
                      </td>
                      <td className={td + ' text-gray-600'}>{r.client}</td>
                      <td className={td}>
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className={tdR + ' font-semibold'}>{hf(r.hours)}</td>
                      <td className={tdR + ' text-gray-500'}>{r.days}</td>
                      <td className={tdR}>NT${nf(r.labor)}</td>
                      <td className={tdR + ' text-gray-500'}>{r.outsource > 0 ? `NT$${nf(r.outsource)}` : '—'}</td>
                      <td className={tdR}>
                        {r.diff == null ? <span className="text-gray-300">未設預算</span>
                          : r.diff >= 0
                            ? <span className="text-green-600 font-medium">剩 NT${nf(r.diff)}</span>
                            : <span className="text-red-600 font-bold">超支 NT${nf(-r.diff)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-800">
                    <td className={td} colSpan={4}>合計（{byProject.length} 個專案）</td>
                    <td className={tdR}>{hf(kpi.hours)}</td>
                    <td className={tdR}>{kpi.manDays}</td>
                    <td className={tdR}>NT${nf(kpi.labor)}</td>
                    <td className={tdR}>NT${nf(kpi.outsource)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}

            {/* ── 按人員 ── */}
            {view === '按人員' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className={th}>姓名</th>
                    <th className={th}>身分</th>
                    <th className={thR}>總工時</th>
                    <th className={thR}>出工天數</th>
                    <th className={thR}>平均每日</th>
                    <th className={thR}>參與專案</th>
                    <th className={thR}>成本</th>
                  </tr>
                </thead>
                <tbody>
                  {byPerson.map(r => (
                    <tr key={r.name} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className={td + ' font-medium text-gray-900'}>{r.name}</td>
                      <td className={td}>
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${KIND_COLORS[r.kind] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.kind || '—'}
                        </span>
                      </td>
                      <td className={tdR + ' font-semibold'}>{hf(r.hours)}</td>
                      <td className={tdR + ' text-gray-500'}>{r.days}</td>
                      <td className={tdR + ' text-gray-500'}>{hf(r.avg)}</td>
                      <td className={tdR + ' text-gray-500'}>{r.projects}</td>
                      <td className={tdR}>NT${nf(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-800">
                    <td className={td} colSpan={2}>合計（{byPerson.length} 人）</td>
                    <td className={tdR}>{hf(kpi.hours)}</td>
                    <td className={tdR}>{kpi.manDays}</td>
                    <td colSpan={2} />
                    <td className={tdR}>NT${nf(kpi.labor + kpi.outsource)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* ── 按月份 ── */}
            {view === '按月份' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className={th}>月份</th>
                    <th className={th} style={{ width: '32%' }}>工時分佈</th>
                    <th className={thR}>總工時</th>
                    <th className={thR}>人工成本</th>
                    <th className={thR}>外包</th>
                    <th className={thR}>出工人數</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map(r => (
                    <tr key={r.month} className="border-b border-gray-50 hover:bg-blue-50/30">
                      <td className={td + ' font-medium text-gray-900 whitespace-nowrap'}>{r.month}</td>
                      <td className={td}>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${(r.hours / maxMonthHours) * 100}%` }} />
                        </div>
                      </td>
                      <td className={tdR + ' font-semibold'}>{hf(r.hours)}</td>
                      <td className={tdR}>NT${nf(r.labor)}</td>
                      <td className={tdR + ' text-gray-500'}>{r.outsource > 0 ? `NT$${nf(r.outsource)}` : '—'}</td>
                      <td className={tdR + ' text-gray-500'}>{r.people}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  tone: 'blue' | 'amber' | 'purple' | 'green'
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    purple: 'text-purple-600 bg-purple-50',
    green: 'text-green-600 bg-green-50',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones[tone]}`}>{icon}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}
