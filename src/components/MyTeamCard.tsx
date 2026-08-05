'use client'

/**
 * 戰情室內建：我的團隊成員（2026-08）
 * ------------------------------------------------------------------
 * 用途：讓主管自己綁定「誰是我底下的人」，不必每次都請人資代改。
 *       綁定結果寫入 user_profiles.manager_id，也就是全系統共用的組織樹，
 *       會同步影響戰情室可見範圍、交辦任務對象、報表歸屬。
 *
 * 規則（強制在資料庫端，見 sql/org_bind_subordinates.sql）：
 *   - 只能加入「目前沒有上級主管」的在職人員 → 避免主管之間互相搶人。
 *   - 已經掛在別人底下的人要調動，一律走人資戰情室。
 *   - 只能移除自己的「直屬」人員；移除後該員變成無上級，可被重新指派。
 *   - 不能把自己、或自己的上級鏈中任何人加進來（防止組織樹成環）。
 *   - 每筆異動寫入 org_change_log，可回溯。
 *
 * 前端只負責過濾候選名單與顯示，真正的把關在 RPC function。
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Users, UserPlus, UserMinus, History, ChevronDown, ChevronRight } from 'lucide-react'

type Person = {
  id: string
  full_name: string | null
  title: string | null
  manager_id: string | null
  branch_id: string | null
  is_active: boolean | null
}

export default function MyTeamCard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setUid(user?.id ?? null)
    const [sp, br, lg] = await Promise.all([
      supabase.from('user_profiles').select('id, full_name, title, manager_id, branch_id, is_active'),
      supabase.from('branches').select('id, name'),
      supabase.from('org_change_log').select('*').order('changed_at', { ascending: false }).limit(20),
    ])
    setPeople((sp.data ?? []) as Person[])
    setBranches(br.data ?? [])
    setLogs(lg.error ? [] : (lg.data ?? []))   // log 表尚未建立時不擋畫面
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: string | null) => people.find(p => p.id === id)?.full_name ?? '—'
  const branchOf = (id: string | null) => branches.find(b => b.id === id)?.name ?? '未分配通訊處'
  const active = useMemo(() => people.filter(p => p.is_active !== false), [people])

  /** 我的上級鏈（含自己）：這些人不能被加進我底下，否則組織樹會成環 */
  const ancestors = useMemo(() => {
    const s = new Set<string>()
    if (!uid) return s
    let cur: string | null = uid
    while (cur && !s.has(cur)) {
      s.add(cur)
      cur = people.find(p => p.id === cur)?.manager_id ?? null
    }
    return s
  }, [people, uid])

  /** 我的直屬人員 */
  const direct = useMemo(
    () => active.filter(p => p.manager_id === uid).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'zh-TW')),
    [active, uid]
  )

  /** 我的整條支線（含間接下屬），只做人數顯示 */
  const subtreeCount = useMemo(() => {
    if (!uid) return 0
    const ids = new Set<string>([uid])
    let grew = true
    while (grew) {
      grew = false
      for (const p of active) {
        if (!ids.has(p.id) && p.manager_id && ids.has(p.manager_id)) { ids.add(p.id); grew = true }
      }
    }
    return ids.size - 1
  }, [active, uid])

  /** 可加入的人：在職、目前無上級、不是我也不是我的上級 */
  const candidates = useMemo(
    () => active
      .filter(p => !p.manager_id && !ancestors.has(p.id))
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'zh-TW')),
    [active, ancestors]
  )

  async function bind() {
    if (!pick) { alert('請先選擇要加入的人員'); return }
    setBusy(true)
    const { error } = await supabase.rpc('bind_subordinate', { p_person: pick })
    if (error) alert('加入失敗：' + error.message)
    else { setPick(''); await load() }
    setBusy(false)
  }

  async function unbind(p: Person) {
    if (!confirm(`把「${p.full_name}」移出我的團隊？\n移除後該員會變成「無上級」，可由其他主管或人資重新指派。`)) return
    setBusy(true)
    const { error } = await supabase.rpc('unbind_subordinate', { p_person: p.id })
    if (error) alert('移除失敗：' + error.message)
    else await load()
    setBusy(false)
  }

  if (loading || !uid) return null

  const myLogs = logs.filter(l => l.changed_by === uid || l.new_manager_id === uid || l.old_manager_id === uid)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
      <div className="flex items-center gap-2 font-semibold text-gray-900 mb-1">
        <Users size={16} className="text-indigo-600" />
        我的團隊成員
        <span className="text-xs font-normal text-gray-400">
          直屬 {direct.length} 人{subtreeCount > direct.length ? `・整條支線 ${subtreeCount} 人` : ''}
        </span>
      </div>
      <div className="text-[11px] text-gray-400 mb-3">
        只能加入「目前沒有上級主管」的在職人員；已掛在別的主管底下的人要調動，請洽人資戰情室。
      </div>

      {/* 加入下屬 */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <select
          value={pick}
          onChange={e => setPick(e.target.value)}
          disabled={busy || candidates.length === 0}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">
            {candidates.length === 0 ? '— 目前沒有可加入的人員（所有人都已歸屬） —' : '— 選擇要加入的人員 —'}
          </option>
          {candidates.map(p => (
            <option key={p.id} value={p.id}>
              {p.full_name}{p.title ? `（${p.title}）` : ''}｜{branchOf(p.branch_id)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={bind}
          disabled={busy || !pick}
          className="flex items-center justify-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 shrink-0"
        >
          <UserPlus size={15} /> {busy ? '處理中…' : '加入團隊'}
        </button>
      </div>

      {/* 直屬清單 */}
      {direct.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
          目前沒有直屬人員，從上方選單加入即可
        </div>
      ) : (
        <div className="space-y-1.5">
          {direct.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm rounded-xl px-3 py-2 border border-gray-200 bg-white">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">{p.full_name}</span>
                {p.title && <span className="text-xs text-gray-500 ml-1.5">{p.title}</span>}
                <span className="text-xs text-gray-400 ml-2">{branchOf(p.branch_id)}</span>
              </div>
              <button
                type="button"
                onClick={() => unbind(p)}
                disabled={busy}
                title="移出我的團隊"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 shrink-0 disabled:opacity-50"
              >
                <UserMinus size={13} /> 移除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 異動紀錄 */}
      {myLogs.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowLog(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            {showLog ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <History size={13} /> 最近組織異動（{myLogs.length}）
          </button>
          {showLog && (
            <div className="mt-2 space-y-1">
              {myLogs.map(l => (
                <div key={l.id} className="text-[11px] text-gray-500">
                  {new Date(l.changed_at).toLocaleString('zh-TW', { hour12: false })}｜
                  <span className="text-gray-800">{nameOf(l.person_id)}</span>：
                  {nameOf(l.old_manager_id) === '—' ? '無上級' : nameOf(l.old_manager_id)}
                  {' → '}
                  {l.new_manager_id ? nameOf(l.new_manager_id) : '無上級'}
                  <span className="text-gray-400">（{nameOf(l.changed_by)} 操作）</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
