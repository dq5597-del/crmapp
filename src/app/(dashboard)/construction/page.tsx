'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  HardHat, AlertTriangle, CalendarRange, LayoutList, ChevronLeft, ChevronRight, Users, Clock,
} from 'lucide-react'

// ============================================================
// 施工追蹤總覽
//   卡片檢視：所有施工中專案的加權進度、延遲工項、本週派工
//   甘特圖：以 project_tasks 的預定起訖日排出時程
// ============================================================

type Proj = {
  id: string
  client_id: string | null
  project_code: string | null
  project_name: string
  status: string
  start_date: string | null
  end_date: string | null
  clients?: { company_name: string } | null
}
type Task = {
  id: string
  project_id: string
  seq_no: number
  task_name: string
  weight: number | string
  progress_pct: number | string
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  assignee: string | null
}
type Log = { project_id: string; work_date: string; name: string; hours: number }

const n = (v: any) => Number(v ?? 0) || 0
const today = () => new Date().toISOString().slice(0, 10)
const DAY = 86400000

const STATUS_COLORS: Record<string, string> = {
  '草稿/報價中': 'bg-purple-100 text-purple-700',
  '施工中': 'bg-orange-100 text-orange-700',
  '完工驗收': 'bg-blue-100 text-blue-700',
  '結案': 'bg-green-100 text-green-700',
  '暫停': 'bg-yellow-100 text-yellow-700',
  '取消': 'bg-gray-100 text-gray-600',
}
/** 預設只看還在跑的案子 */
const ACTIVE = ['施工中', '完工驗收']

/** 專案完整內容在客戶詳情頁的「專案」頁籤，沒有獨立詳情路由 */
const projHref = (p: Proj) =>
  p.client_id ? `/clients/${p.client_id}?tab=projects&edit=${p.id}` : '/projects'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, k: number) => iso(new Date(new Date(s).getTime() + k * DAY))
const diffDays = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)
function mondayOf(d: string) {
  const dt = new Date(d)
  const wd = (dt.getDay() + 6) % 7 // 週一 = 0
  return iso(new Date(dt.getTime() - wd * DAY))
}

export default function ConstructionBoardPage() {
  const supabase = createClient()

  const [projects, setProjects] = useState<Proj[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)

  const [tab, setTab] = useState<'卡片' | '甘特圖'>('卡片')
  const [showAll, setShowAll] = useState(false)
  /** 甘特圖起始週（週一） */
  const [weekStart, setWeekStart] = useState(mondayOf(today()))
  const [weeks, setWeeks] = useState(6)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const weekAgo = addDays(today(), -7)
    const [pRes, tRes, lRes] = await Promise.all([
      supabase.from('projects')
        .select('id, client_id, project_code, project_name, status, start_date, end_date, clients(company_name)')
        .order('start_date', { ascending: true }),
      supabase.from('project_tasks').select('*').order('seq_no'),
      supabase.from('project_work_logs')
        .select('project_id, work_date, name, hours')
        .gte('work_date', weekAgo),
    ])
    if (tRes.error) { console.error(tRes.error); setNoTable(true) }
    setProjects((pRes.data as any) ?? [])
    setTasks((tRes.data as any) ?? [])
    setLogs((lRes.data as any) ?? [])
    setLoading(false)
  }

  const visible = useMemo(
    () => projects.filter(p => showAll || ACTIVE.includes(p.status)),
    [projects, showAll]
  )

  const tasksByProject = useMemo(() => {
    const m: Record<string, Task[]> = {}
    tasks.forEach(t => { (m[t.project_id] ??= []).push(t) })
    return m
  }, [tasks])

  const crewByProject = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    logs.forEach(l => { (m[l.project_id] ??= new Set()).add(l.name) })
    return m
  }, [logs])

  /** 每個專案的加權進度與延遲工項 */
  const stats = useMemo(() => {
    const m: Record<string, { progress: number; wTotal: number; delayed: Task[]; done: number; total: number }> = {}
    visible.forEach(p => {
      const rows = tasksByProject[p.id] ?? []
      const wTotal = rows.reduce((s, r) => s + n(r.weight), 0)
      const weighted = wTotal > 0
        ? rows.reduce((s, r) => s + n(r.weight) * n(r.progress_pct), 0) / wTotal
        : 0
      const delayed = rows.filter(r => n(r.progress_pct) < 100 && r.planned_end && r.planned_end < today())
      m[p.id] = {
        progress: Math.round(weighted * 10) / 10,
        wTotal,
        delayed,
        done: rows.filter(r => n(r.progress_pct) >= 100).length,
        total: rows.length,
      }
    })
    return m
  }, [visible, tasksByProject])

  const summary = useMemo(() => {
    const list = visible.map(p => stats[p.id]).filter(Boolean)
    return {
      projects: visible.length,
      delayed: list.filter(s => s.delayed.length > 0).length,
      onSite: new Set(logs.map(l => l.name)).size,
      avg: list.length > 0 ? Math.round((list.reduce((s, x) => s + x.progress, 0) / list.length) * 10) / 10 : 0,
    }
  }, [visible, stats, logs])

  // ── 甘特圖時間軸 ──
  const ganttDays = weeks * 7
  const ganttEnd = addDays(weekStart, ganttDays - 1)
  const dayCells = useMemo(
    () => Array.from({ length: ganttDays }, (_, i) => addDays(weekStart, i)),
    [weekStart, ganttDays]
  )

  if (noTable) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          尚未建立工項資料表。請先到 Supabase SQL Editor 執行 <code className="bg-white px-1.5 py-0.5 rounded">sql/project_tasks.sql</code>。
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
            <HardHat size={20} className="text-orange-600" /> 施工追蹤
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {showAll ? '所有專案' : '施工中與完工驗收'}　共 {visible.length} 案
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 mr-1">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
              className="accent-blue-600 w-4 h-4" />
            顯示全部狀態
          </label>
          {(['卡片', '甘特圖'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
                tab === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {t === '卡片' ? <LayoutList size={14} /> : <CalendarRange size={14} />} {t}
            </button>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="追蹤中專案" value={String(summary.projects)} tone="blue" icon={<HardHat size={16} />} />
        <Kpi label="平均進度" value={`${summary.avg}%`} tone="green" icon={<LayoutList size={16} />} />
        <Kpi label="有延遲工項" value={String(summary.delayed)} tone={summary.delayed > 0 ? 'red' : 'green'}
          icon={<AlertTriangle size={16} />} sub={summary.delayed > 0 ? '需要處理' : '目前無延遲'} />
        <Kpi label="近 7 天出工" value={`${summary.onSite} 人`} tone="amber" icon={<Users size={16} />} />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>目前沒有施工中的專案</p>
          <Link href="/projects" className="text-blue-600 hover:underline text-sm mt-2 inline-block">前往專案資料夾</Link>
        </div>
      ) : tab === '卡片' ? (
        /* ── 卡片檢視 ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visible.map(p => {
            const s = stats[p.id] ?? { progress: 0, wTotal: 0, delayed: [], done: 0, total: 0 }
            const crew = Array.from(crewByProject[p.id] ?? [])
            const overdue = p.end_date && p.end_date < today() && s.progress < 100
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <Link href={projHref(p)}
                      className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                      {p.project_name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {p.clients?.company_name ?? '—'}
                      {p.project_code && <span className="font-mono ml-2 text-gray-400">{p.project_code}</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                </div>

                {/* 進度條 */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      s.delayed.length > 0 ? 'bg-amber-500' : s.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, s.progress)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums w-14 text-right">{s.progress}%</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                  <span>工項 {s.done}/{s.total}</span>
                  <span className={overdue ? 'text-red-600 font-medium' : ''}>
                    {p.start_date ?? '—'} ~ {p.end_date ?? '—'}{overdue && '（已逾期）'}
                  </span>
                  {crew.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> 近 7 天：{crew.slice(0, 3).join('、')}{crew.length > 3 && ` +${crew.length - 3}`}
                    </span>
                  )}
                </div>

                {s.total === 0 && (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                    尚未建立工項，進度無法計算
                  </div>
                )}
                {s.delayed.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 mb-1">
                      <AlertTriangle size={12} /> {s.delayed.length} 項逾期未完成
                    </div>
                    <ul className="text-xs text-amber-700 space-y-0.5">
                      {s.delayed.slice(0, 3).map(t => (
                        <li key={t.id} className="truncate">
                          · {t.task_name}（預定 {t.planned_end}，{n(t.progress_pct)}%）
                        </li>
                      ))}
                      {s.delayed.length > 3 && <li className="text-amber-600">…另有 {s.delayed.length - 3} 項</li>}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── 甘特圖 ── */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* 工具列 */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-blue-600">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setWeekStart(mondayOf(today()))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50">
              本週
            </button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-blue-600">
              <ChevronRight size={14} />
            </button>
            <span className="text-xs text-gray-500 ml-1">{weekStart} ~ {ganttEnd}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-gray-500">顯示</span>
              <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                {[4, 6, 8, 12].map(w => <option key={w} value={w}>{w} 週</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div style={{ minWidth: 260 + ganttDays * 22 }}>
              {/* 時間軸表頭 */}
              <div className="flex border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
                <div className="w-[260px] shrink-0 px-4 py-2 text-xs font-medium text-gray-600 border-r border-gray-100">
                  專案 / 工項
                </div>
                <div className="flex">
                  {dayCells.map(d => {
                    const dt = new Date(d)
                    const isMon = dt.getDay() === 1
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                    const isToday = d === today()
                    return (
                      <div key={d}
                        className={`w-[22px] shrink-0 text-center text-[10px] py-2 border-r ${
                          isMon ? 'border-gray-200' : 'border-gray-50'} ${
                          isToday ? 'bg-blue-100 text-blue-700 font-bold' : isWeekend ? 'bg-gray-100 text-gray-400' : 'text-gray-400'}`}
                        title={d}>
                        {dt.getDate()}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 專案列 */}
              {visible.map(p => {
                const rows = (tasksByProject[p.id] ?? []).filter(t => t.planned_start || t.planned_end)
                const s = stats[p.id]
                return (
                  <div key={p.id} className="border-b border-gray-100">
                    {/* 專案標題列 */}
                    <div className="flex bg-gray-50/70">
                      <div className="w-[260px] shrink-0 px-4 py-2 border-r border-gray-100 min-w-0">
                        <Link href={projHref(p)}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600 block truncate">
                          {p.project_name}
                        </Link>
                        <div className="text-[11px] text-gray-400 truncate">
                          {p.clients?.company_name ?? '—'} · {s?.progress ?? 0}%
                        </div>
                      </div>
                      <div className="flex relative">
                        {dayCells.map(d => {
                          const dt = new Date(d)
                          const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                          return <div key={d} className={`w-[22px] shrink-0 border-r border-gray-50 ${isWeekend ? 'bg-gray-100/60' : ''}`} />
                        })}
                        {/* 專案整體工期 */}
                        {p.start_date && p.end_date && (() => {
                          const off = Math.max(0, diffDays(weekStart, p.start_date))
                          const endOff = Math.min(ganttDays - 1, diffDays(weekStart, p.end_date))
                          if (endOff < 0 || off > ganttDays - 1) return null
                          const w = Math.max(1, endOff - off + 1)
                          return (
                            <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gray-300"
                              style={{ left: off * 22 + 2, width: w * 22 - 4 }}
                              title={`工期 ${p.start_date} ~ ${p.end_date}`} />
                          )
                        })()}
                      </div>
                    </div>

                    {/* 工項列 */}
                    {rows.length === 0 ? (
                      <div className="flex">
                        <div className="w-[260px] shrink-0 px-4 py-1.5 text-xs text-gray-300 border-r border-gray-100">
                          尚未設定工項起訖日
                        </div>
                        <div className="flex">
                          {dayCells.map(d => <div key={d} className="w-[22px] shrink-0 border-r border-gray-50" />)}
                        </div>
                      </div>
                    ) : rows.map(t => {
                      const start = t.planned_start ?? t.planned_end!
                      const end = t.planned_end ?? t.planned_start!
                      const off = diffDays(weekStart, start)
                      const endOff = diffDays(weekStart, end)
                      const visibleBar = !(endOff < 0 || off > ganttDays - 1)
                      const clipL = Math.max(0, off)
                      const clipR = Math.min(ganttDays - 1, endOff)
                      const w = Math.max(1, clipR - clipL + 1)
                      const pct = n(t.progress_pct)
                      const delayed = pct < 100 && t.planned_end && t.planned_end < today()
                      const barColor = delayed ? 'bg-red-500' : pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-blue-500' : 'bg-gray-300'
                      return (
                        <div key={t.id} className="flex hover:bg-blue-50/30">
                          <div className="w-[260px] shrink-0 px-4 py-1.5 border-r border-gray-100 min-w-0">
                            <div className="text-xs text-gray-700 truncate">
                              {t.task_name}
                              {t.assignee && <span className="text-gray-400 ml-1.5">· {t.assignee}</span>}
                            </div>
                          </div>
                          <div className="flex relative">
                            {dayCells.map(d => {
                              const dt = new Date(d)
                              const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                              const isToday = d === today()
                              return (
                                <div key={d}
                                  className={`w-[22px] shrink-0 border-r border-gray-50 ${
                                    isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-100/60' : ''}`}
                                  style={{ height: 28 }} />
                              )
                            })}
                            {visibleBar && (
                              <div className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded"
                                style={{ left: clipL * 22 + 2, width: w * 22 - 4 }}
                                title={`${t.task_name}｜${t.planned_start ?? '?'} ~ ${t.planned_end ?? '?'}｜進度 ${pct}%${delayed ? '（逾期）' : ''}`}>
                                <div className="absolute inset-0 rounded bg-gray-200" />
                                <div className={`absolute inset-y-0 left-0 rounded ${barColor}`}
                                  style={{ width: `${Math.min(100, Math.max(pct, 3))}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 圖例 */}
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-gray-100 bg-gray-50/60 text-xs text-gray-500">
            <Legend color="bg-gray-300" label="未開始" />
            <Legend color="bg-blue-500" label="進行中" />
            <Legend color="bg-green-500" label="已完成" />
            <Legend color="bg-red-500" label="逾期未完成" />
            <span className="ml-auto">長條長度為預定工期，填色比例為實際進度</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-4 h-2.5 rounded ${color}`} />{label}
    </span>
  )
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  tone: 'blue' | 'amber' | 'red' | 'green'
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
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
