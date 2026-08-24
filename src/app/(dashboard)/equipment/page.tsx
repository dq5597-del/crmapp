'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Equipment } from '@/types'
import { Plus, Search, HardDrive, ChevronRight, Wrench, ShieldCheck, ShieldAlert, ShieldX, Pencil, HardHat, Crown, Trash2, Bell, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

type WarrantyKey = 'good' | 'warn' | 'danger'

const WARRANTY_LABEL: Record<WarrantyKey, string> = { good: '保固內', warn: '即將到期', danger: '已過保固' }
const WARRANTY_COLOR: Record<WarrantyKey, string> = {
  good:   'bg-green-100 text-green-700',
  warn:   'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-600',
}

const DAY = 86400000

function warrantyKey(dateStr: string | null): WarrantyKey {
  if (!dateStr) return 'good' // 沒填保固到期日，先不當作已過保固
  const diffDays = Math.round((new Date(dateStr).getTime() - Date.now()) / DAY)
  if (diffDays < 0) return 'danger'
  if (diffDays <= 30) return 'warn'
  return 'good'
}

function warrantyLabel(e: Equipment): string {
  const k = warrantyKey(e.warranty_expiry)
  if (!e.warranty_expiry) return '未設定'
  if (k === 'warn') {
    const diffDays = Math.round((new Date(e.warranty_expiry).getTime() - Date.now()) / DAY)
    return `即將到期・剩 ${diffDays} 天`
  }
  return WARRANTY_LABEL[k]
}

type FollowUpKey = 'none' | 'overdue' | 'soon' | 'scheduled'

const FOLLOWUP_COLOR: Record<Exclude<FollowUpKey, 'none'>, string> = {
  overdue:   'bg-red-100 text-red-600',
  soon:      'bg-amber-100 text-amber-700',
  scheduled: 'bg-blue-100 text-blue-700',
}

/** 主動安排的回訪／保養提醒（跟保固到期不同：沒填日期就是「沒有排定」，不是問題） */
function followUpKey(dateStr: string | null): FollowUpKey {
  if (!dateStr) return 'none'
  const diffDays = Math.round((new Date(dateStr).getTime() - Date.now()) / DAY)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 14) return 'soon'
  return 'scheduled'
}

function followUpLabel(dateStr: string | null): string {
  const k = followUpKey(dateStr)
  if (k === 'none' || !dateStr) return ''
  if (k === 'overdue') return `已逾期・${dateStr}`
  if (k === 'soon') return `即將到期・${dateStr}`
  return `已排定・${dateStr}`
}

type FollowUpLogEntry = {
  id: string
  old_date: string | null
  new_date: string | null
  old_notes: string | null
  new_notes: string | null
  changed_by: string | null
  changed_at: string
}

type Batch = {
  key: string
  client_id: string
  client_name: string
  project_id: string | null
  project_name: string | null
  installed_date: string | null
  devices: Equipment[]
}

function groupEquipment(list: Equipment[]): Batch[] {
  const map = new Map<string, Batch>()
  const order: string[] = []
  for (const e of list) {
    const key = `${e.client_id}|${e.project_id ?? ''}|${e.installed_date ?? ''}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        client_id: e.client_id,
        client_name: (e.client as any)?.company_name ?? '—',
        project_id: e.project_id,
        project_name: (e.project as any)?.project_name ?? null,
        installed_date: e.installed_date,
        devices: [],
      })
      order.push(key)
    }
    map.get(key)!.devices.push(e)
  }
  return order.map(k => map.get(k)!)
}

function batchLabel(b: Batch) {
  if (b.project_name) return b.project_name
  return b.devices.map(d => [d.brand, d.model].filter(Boolean).join(' ')).filter(Boolean).join('、') || '未命名設備'
}

function batchInstallers(b: Batch): string[] {
  const names = b.devices.flatMap(d => (d.work_logs ?? []).map(w => w.name)).filter(Boolean)
  return Array.from(new Set(names))
}

function batchWarranty(b: Batch): { key: WarrantyKey; label: string } {
  if (b.devices.length === 1) return { key: warrantyKey(b.devices[0].warranty_expiry), label: warrantyLabel(b.devices[0]) }
  const counts: Record<WarrantyKey, number> = { good: 0, warn: 0, danger: 0 }
  b.devices.forEach(d => { counts[warrantyKey(d.warranty_expiry)]++ })
  const priority: WarrantyKey = counts.danger > 0 ? 'danger' : counts.warn > 0 ? 'warn' : 'good'
  return { key: priority, label: `${WARRANTY_LABEL[priority]}（${counts[priority]}/${b.devices.length}）` }
}

/** 這批安裝裡最急的追蹤提醒（逾期優先，其次即將到期），沒有任何設備排定就回傳 null */
function batchFollowUp(b: Batch): { key: Exclude<FollowUpKey, 'none'>; label: string } | null {
  const withDate = b.devices.filter(d => followUpKey(d.next_follow_up_date) !== 'none')
  if (withDate.length === 0) return null
  const priority: Exclude<FollowUpKey, 'none'> =
    withDate.some(d => followUpKey(d.next_follow_up_date) === 'overdue') ? 'overdue'
    : withDate.some(d => followUpKey(d.next_follow_up_date) === 'soon') ? 'soon'
    : 'scheduled'
  const soonest = withDate.map(d => d.next_follow_up_date!).sort()[0] // 日期由小到大排序，取最早的（最急）
  return { key: priority, label: followUpLabel(soonest) }
}

export default function EquipmentPage() {
  const supabase = createClient()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [leaderMap, setLeaderMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | WarrantyKey | 'followup'>('all')
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null)
  const [followUpDraft, setFollowUpDraft] = useState<{ date: string; notes: string }>({ date: '', notes: '' })
  const [savingFollowUp, setSavingFollowUp] = useState(false)
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)
  const [historyMap, setHistoryMap] = useState<Map<string, FollowUpLogEntry[]>>(new Map())
  const [historyLoading, setHistoryLoading] = useState<string | null>(null)

  useEffect(() => { fetchEquipment() }, [])

  async function fetchEquipment() {
    setLoading(true)
    setLoadError(null)

    let eq: any[] | null = null
    const primary = await supabase
      .from('equipment')
      .select('*, client:clients(company_name), project:projects(project_name, project_code), equipment_work_logs(work_log:project_work_logs(name, rate_type, work_date))')
      .order('installed_date', { ascending: false })

    if (primary.error) {
      // 多點工那張關聯表（equipment_work_logs）如果還沒在 Supabase 執行 SQL，這個查詢會整個失敗。
      // 先退回不含多點工資訊的查詢，資料至少能正常顯示出來，不會誤以為設備不見了。
      console.error('equipment 查詢失敗，改用簡易版查詢：', primary.error)
      const fallback = await supabase
        .from('equipment')
        .select('*, client:clients(company_name), project:projects(project_name, project_code)')
        .order('installed_date', { ascending: false })
      if (fallback.error) {
        setLoadError('讀取設備清單失敗：' + fallback.error.message)
        eq = []
      } else {
        eq = fallback.data
        setLoadError('目前顯示簡易版資料（看不到多點工資訊）——請到 Supabase SQL Editor 執行 sql/equipment_work_logs.sql 之後重新整理。')
      }
    } else {
      eq = primary.data
    }

    const { data: stats } = await supabase.from('v_equipment_service_stats').select('*')
    const statMap = new Map((stats ?? []).map((s: any) => [s.equipment_id, s]))
    const merged = (eq ?? []).map((e: any) => ({
      ...e,
      // 一台設備可能是好幾個點工一起裝的，equipment_work_logs 是關聯表，攤平成陣列方便顯示
      work_logs: (e.equipment_work_logs ?? []).map((r: any) => r.work_log).filter(Boolean),
      service_count: statMap.get(e.id)?.service_count ?? 0,
      last_reported_date: statMap.get(e.id)?.last_reported_date ?? null,
    }))
    setEquipment(merged)

    // 工頭是專案層級的資訊（project_crew.is_leader），不是每台設備各自記錄，抓一次做成 map
    const projectIds = Array.from(new Set(merged.map((e: any) => e.project_id).filter(Boolean)))
    if (projectIds.length > 0) {
      const { data: leaders } = await supabase
        .from('project_crew')
        .select('project_id, name')
        .in('project_id', projectIds)
        .eq('is_leader', true)
      setLeaderMap(new Map((leaders ?? []).map((l: any) => [l.project_id, l.name])))
    } else {
      setLeaderMap(new Map())
    }
    setLoading(false)
  }

  const filtering = search.trim().length > 0 || filter !== 'all'

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipment.filter(e => {
      const matchesFilter = filter === 'all'
        || (filter === 'followup' ? followUpKey(e.next_follow_up_date) === 'overdue' || followUpKey(e.next_follow_up_date) === 'soon'
          : warrantyKey(e.warranty_expiry) === filter)
      const hay = [
        (e.client as any)?.company_name, e.brand, e.model, e.serial_no, (e.project as any)?.project_name,
      ].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !q || hay.includes(q)
      return matchesFilter && matchesSearch
    })
  }, [equipment, search, filter])

  const batches = useMemo(() => groupEquipment(matched), [matched])

  const counts = useMemo(() => {
    const c: Record<WarrantyKey, number> = { good: 0, warn: 0, danger: 0 }
    let followup = 0
    equipment.forEach(e => {
      c[warrantyKey(e.warranty_expiry)]++
      const fk = followUpKey(e.next_follow_up_date)
      if (fk === 'overdue' || fk === 'soon') followup++
    })
    return { ...c, followup }
  }, [equipment])

  function toggle(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function deleteDevice(d: Equipment) {
    if (!confirm(`確定要刪除「${[d.brand, d.model].filter(Boolean).join(' ') || '這台設備'}」嗎？此動作無法復原。`)) return
    const { error } = await supabase.from('equipment').delete().eq('id', d.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    setEquipment(prev => prev.filter(e => e.id !== d.id))
  }

  async function deleteBatch(b: Batch) {
    if (!confirm(`確定要刪除「${batchLabel(b)}」這筆安裝紀錄嗎？裡面共 ${b.devices.length} 台設備會一起刪除，此動作無法復原。`)) return
    const ids = b.devices.map(d => d.id)
    const { error } = await supabase.from('equipment').delete().in('id', ids)
    if (error) { alert('刪除失敗：' + error.message); return }
    setEquipment(prev => prev.filter(e => !ids.includes(e.id)))
  }

  function startEditFollowUp(d: Equipment) {
    setEditingFollowUpId(d.id)
    setFollowUpDraft({ date: d.next_follow_up_date ?? '', notes: d.follow_up_notes ?? '' })
  }

  function cancelEditFollowUp() {
    setEditingFollowUpId(null)
  }

  async function saveFollowUp(d: Equipment) {
    const oldDate = d.next_follow_up_date ?? null
    const oldNotes = d.follow_up_notes ?? null
    const newDate = followUpDraft.date || null
    const newNotes = followUpDraft.notes.trim() || null

    if (oldDate === newDate && oldNotes === newNotes) {
      setEditingFollowUpId(null)
      return
    }

    setSavingFollowUp(true)
    const { error } = await supabase
      .from('equipment')
      .update({ next_follow_up_date: newDate, follow_up_notes: newNotes })
      .eq('id', d.id)

    if (error) {
      alert('儲存失敗：' + error.message)
      setSavingFollowUp(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: logError } = await supabase.from('equipment_followup_log').insert({
      equipment_id: d.id,
      old_date: oldDate,
      new_date: newDate,
      old_notes: oldNotes,
      new_notes: newNotes,
      changed_by: user?.email ?? null,
    })
    if (logError) {
      // 編輯紀錄寫入失敗不影響主要資料已經存檔成功，只在 console 留意即可
      console.error('寫入後續追蹤編輯紀錄失敗：', logError)
    }

    setEquipment(prev => prev.map(e => e.id === d.id ? { ...e, next_follow_up_date: newDate, follow_up_notes: newNotes } : e))
    // 這筆的歷史紀錄快取已經過期，清掉讓下次展開時重新抓
    setHistoryMap(prev => { const next = new Map(prev); next.delete(d.id); return next })
    setSavingFollowUp(false)
    setEditingFollowUpId(null)
  }

  async function toggleHistory(d: Equipment) {
    if (historyOpenId === d.id) { setHistoryOpenId(null); return }
    setHistoryOpenId(d.id)
    if (!historyMap.has(d.id)) {
      setHistoryLoading(d.id)
      const { data, error } = await supabase
        .from('equipment_followup_log')
        .select('*')
        .eq('equipment_id', d.id)
        .order('changed_at', { ascending: false })
      if (!error) {
        setHistoryMap(prev => new Map(prev).set(d.id, data ?? []))
      }
      setHistoryLoading(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">設備清單</h1>
          <p className="text-sm text-gray-500 mt-0.5">不用先想是哪個專案——直接用客戶名稱、品牌、型號或序號搜尋</p>
        </div>
        <Link
          href="/equipment/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          新增設備
        </Link>
      </div>

      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
          {loadError}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <ShieldCheck size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.good}</p>
              <p className="text-xs text-gray-500">保固內</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <ShieldAlert size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.warn}</p>
              <p className="text-xs text-gray-500">即將到期（30 天內）</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <ShieldX size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.danger}</p>
              <p className="text-xs text-gray-500">已過保固</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Bell size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.followup}</p>
              <p className="text-xs text-gray-500">待追蹤（含逾期）</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜尋客戶名稱、品牌、型號或序號…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              filter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
          >
            全部（{equipment.length}）
          </button>
          {(['good', 'warn', 'danger'] as WarrantyKey[]).map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                filter === k ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
            >
              {WARRANTY_LABEL[k]}（{counts[k]}）
            </button>
          ))}
          <button
            onClick={() => setFilter('followup')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              filter === 'followup' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
          >
            待追蹤（{counts.followup}）
          </button>
        </div>
        <p className="text-xs text-gray-400">
          {filtering
            ? `顯示 ${batches.length} 個安裝紀錄・${matched.length} 台設備（共 ${equipment.length} 台）`
            : `顯示 ${batches.length} 個安裝紀錄・${matched.length} 台設備`}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">載入中...</div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <HardDrive size={32} className="mb-2 opacity-40" />
            <p className="text-sm">{equipment.length === 0 ? '目前沒有設備資料' : '沒有符合的設備'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">客戶</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">安裝內容</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">所屬專案</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">安裝日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">保固狀態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">叫修次數</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">後續追蹤</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(b => {
                const open = filtering || openKeys.has(b.key)
                const w = batchWarranty(b)
                const svcSum = b.devices.reduce((s, d) => s + (d.service_count ?? 0), 0)
                return (
                  <Fragment key={b.key}>
                    <tr
                      onClick={() => toggle(b.key)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-800">{b.client_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{batchLabel(b)}</div>
                        {b.devices.length > 1 && <div className="text-xs text-gray-400">{b.devices.length} 台設備</div>}
                        {batchInstallers(b).length > 0 && (
                          <div className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                            <HardHat size={11} /> 點工：{batchInstallers(b).join('、')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {b.project_id
                          ? <Link href={`/clients/${b.client_id}?tab=projects&edit=${b.project_id}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">{b.project_name}</Link>
                          : <span className="text-gray-400">未指定</span>}
                        {b.project_id && leaderMap.get(b.project_id) && (
                          <div className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                            <Crown size={11} className="text-amber-500" /> 工頭：{leaderMap.get(b.project_id)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{b.installed_date ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', WARRANTY_COLOR[w.key])}>{w.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{svcSum > 0 ? `${svcSum} 次` : '—'}</td>
                      <td className="px-4 py-3">
                        {batchFollowUp(b) ? (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1', FOLLOWUP_COLOR[batchFollowUp(b)!.key])}>
                            <Bell size={10} /> {batchFollowUp(b)!.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            title="刪除這筆安裝紀錄"
                            onClick={e => { e.stopPropagation(); deleteBatch(b) }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                          <ChevronRight size={15} className={cn('text-gray-400 transition-transform', open && 'rotate-90')} />
                        </div>
                      </td>
                    </tr>
                    {open && b.devices.map(d => {
                      const dw = warrantyKey(d.warranty_expiry)
                      const history = historyMap.get(d.id) ?? []
                      return (
                        <Fragment key={d.id}>
                        <tr className="bg-gray-50/60">
                          <td className="px-4 py-2.5 pl-8" colSpan={2}>
                            <div className="font-medium text-gray-700">{[d.brand, d.model].filter(Boolean).join(' ') || '未命名設備'}</div>
                            <div className="text-xs text-gray-400">
                              {d.serial_no ? `SN ${d.serial_no}` : '無序號'}{d.install_location ? ` ・ ${d.install_location}` : ''}
                            </div>
                            {d.work_logs && d.work_logs.length > 0 && (
                              <div className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                                <HardHat size={11} />
                                點工：{d.work_logs.map((w, i) => `${w.name}${w.rate_type ? `（${w.rate_type}）` : ''}`).join('、')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs" colSpan={2}>
                            {d.service_count ? `最近叫修：${d.last_reported_date}` : ''}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', WARRANTY_COLOR[dw])}>{warrantyLabel(d)}</span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">{d.service_count ? `${d.service_count} 次` : '—'}</td>
                          <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                            {editingFollowUpId === d.id ? (
                              <div className="flex flex-col gap-1 w-40">
                                <input
                                  type="date"
                                  value={followUpDraft.date}
                                  onChange={e => setFollowUpDraft(v => ({ ...v, date: e.target.value }))}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <input
                                  type="text"
                                  placeholder="備註（選填）"
                                  value={followUpDraft.notes}
                                  onChange={e => setFollowUpDraft(v => ({ ...v, notes: e.target.value }))}
                                  className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    disabled={savingFollowUp}
                                    onClick={() => saveFollowUp(d)}
                                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {savingFollowUp ? '儲存中…' : '儲存'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditFollowUp}
                                    className="text-xs px-2 py-1 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1">
                                <div>
                                  {followUpKey(d.next_follow_up_date) !== 'none' ? (
                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1', FOLLOWUP_COLOR[followUpKey(d.next_follow_up_date) as Exclude<FollowUpKey, 'none'>])}>
                                      <Bell size={10} /> {followUpLabel(d.next_follow_up_date)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-300">未設定</span>
                                  )}
                                  {d.follow_up_notes && <div className="text-xs text-gray-500 mt-0.5">{d.follow_up_notes}</div>}
                                </div>
                                <button
                                  type="button"
                                  title="編輯後續追蹤"
                                  onClick={() => startEditFollowUp(d)}
                                  className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                                >
                                  <Pencil size={11} />
                                </button>
                                <button
                                  type="button"
                                  title="編輯紀錄"
                                  onClick={() => toggleHistory(d)}
                                  className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                                >
                                  <Clock size={11} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/equipment/${d.id}/edit`}
                                onClick={e => e.stopPropagation()}
                                title="編輯設備"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                              >
                                <Pencil size={12} />
                                編輯
                              </Link>
                              <Link
                                href={`/service-requests/new?equipment_id=${d.id}`}
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                              >
                                <Wrench size={12} />
                                叫修
                              </Link>
                              <button
                                type="button"
                                title="刪除這台設備"
                                onClick={e => { e.stopPropagation(); deleteDevice(d) }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {historyOpenId === d.id && (
                          <tr className="bg-blue-50/40">
                            <td colSpan={7} className="px-4 py-2.5 pl-8">
                              {historyLoading === d.id ? (
                                <p className="text-xs text-gray-400">載入編輯紀錄中…</p>
                              ) : history.length === 0 ? (
                                <p className="text-xs text-gray-400">目前還沒有編輯紀錄</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {history.map(h => (
                                    <div key={h.id} className="text-xs text-gray-600 flex flex-wrap items-center gap-x-2">
                                      <Clock size={11} className="text-gray-400 shrink-0" />
                                      <span className="text-gray-400">{new Date(h.changed_at).toLocaleString('zh-TW', { hour12: false })}</span>
                                      {h.changed_by && <span className="text-gray-400">・{h.changed_by}</span>}
                                      <span>
                                        追蹤日期：{h.old_date ?? '未設定'} → {h.new_date ?? '未設定'}
                                      </span>
                                      {(h.old_notes ?? '') !== (h.new_notes ?? '') && (
                                        <span>備註：{h.old_notes || '（空）'} → {h.new_notes || '（空）'}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
