'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Equipment } from '@/types'
import { Plus, Search, HardDrive, ChevronRight, Wrench, ShieldCheck, ShieldAlert, ShieldX, Pencil, HardHat, Crown, Trash2 } from 'lucide-react'
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

function batchWarranty(b: Batch): { key: WarrantyKey; label: string } {
  if (b.devices.length === 1) return { key: warrantyKey(b.devices[0].warranty_expiry), label: warrantyLabel(b.devices[0]) }
  const counts: Record<WarrantyKey, number> = { good: 0, warn: 0, danger: 0 }
  b.devices.forEach(d => { counts[warrantyKey(d.warranty_expiry)]++ })
  const priority: WarrantyKey = counts.danger > 0 ? 'danger' : counts.warn > 0 ? 'warn' : 'good'
  return { key: priority, label: `${WARRANTY_LABEL[priority]}（${counts[priority]}/${b.devices.length}）` }
}

export default function EquipmentPage() {
  const supabase = createClient()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [leaderMap, setLeaderMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | WarrantyKey>('all')
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

  useEffect(() => { fetchEquipment() }, [])

  async function fetchEquipment() {
    setLoading(true)
    const [{ data: eq }, { data: stats }] = await Promise.all([
      supabase
        .from('equipment')
        .select('*, client:clients(company_name), project:projects(project_name, project_code), equipment_work_logs(work_log:project_work_logs(name, rate_type, work_date))')
        .order('installed_date', { ascending: false }),
      supabase.from('v_equipment_service_stats').select('*'),
    ])
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
      const matchesFilter = filter === 'all' || warrantyKey(e.warranty_expiry) === filter
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
    equipment.forEach(e => { c[warrantyKey(e.warranty_expiry)]++ })
    return c
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

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
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
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {b.project_id
                          ? <Link href={`/clients?tab=projects`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">{b.project_name}</Link>
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
                      return (
                        <tr key={d.id} className="bg-gray-50/60">
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
