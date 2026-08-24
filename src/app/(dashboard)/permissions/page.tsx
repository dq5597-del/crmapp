'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { FEATURES, FEATURE_GROUPS, usePermissions } from '@/lib/permissions'
import { ShieldCheck, Save, Users, RotateCcw, Check, Minus } from 'lucide-react'

const ACTIONS = [
  { key: 'can_view',   label: '可看' },
  { key: 'can_create', label: '新增' },
  { key: 'can_edit',   label: '修改' },
  { key: 'can_delete', label: '刪除' },
  { key: 'can_cost',   label: '看成本' },
] as const

type Row = Record<string, boolean>

export default function PermissionsPage() {
  const supabase = createClient()
  const { isAdmin, ready } = usePermissions()

  const [tab, setTab] = useState<'role' | 'user'>('role')
  const [roles, setRoles] = useState<any[]>([])
  const [roleKey, setRoleKey] = useState('sales')
  const [matrix, setMatrix] = useState<Record<string, Row>>({})     // feature → actions
  const [users, setUsers] = useState<any[]>([])
  const [userId, setUserId] = useState('')
  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean | null>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [noTable, setNoTable] = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => { if (roleKey) loadRole(roleKey) }, [roleKey])
  useEffect(() => { if (userId) loadUser(userId) }, [userId])

  async function init() {
    setLoading(true)
    const [r, u] = await Promise.all([
      supabase.from('app_roles').select('*').order('sort_order'),
      supabase.from('user_profiles').select('id, full_name, email, role').order('full_name'),
    ])
    if (r.error) { setNoTable(true); setLoading(false); return }
    setRoles(r.data ?? [])
    setUsers(u.data ?? [])
    setLoading(false)
  }

  async function loadRole(key: string) {
    const { data } = await supabase.from('role_permissions').select('*').eq('role_key', key)
    const m: Record<string, Row> = {}
    FEATURES.forEach(f => {
      const row = (data ?? []).find((d: any) => d.feature_key === f.key)
      m[f.key] = {
        can_view: !!row?.can_view, can_create: !!row?.can_create,
        can_edit: !!row?.can_edit, can_delete: !!row?.can_delete, can_cost: !!row?.can_cost,
      }
    })
    setMatrix(m)
  }

  async function loadUser(uid: string) {
    const { data } = await supabase.from('user_permissions').select('*').eq('user_id', uid)
    const m: Record<string, Record<string, boolean | null>> = {}
    FEATURES.forEach(f => {
      const row = (data ?? []).find((d: any) => d.feature_key === f.key)
      m[f.key] = {
        can_view: row?.can_view ?? null, can_create: row?.can_create ?? null,
        can_edit: row?.can_edit ?? null, can_delete: row?.can_delete ?? null, can_cost: row?.can_cost ?? null,
      }
    })
    setOverrides(m)
  }

  function toggle(feature: string, action: string) {
    setMatrix(m => {
      const cur = { ...(m[feature] ?? {}) }
      const next = !cur[action]
      cur[action] = next
      // 勾了任何動作，自動勾「可看」；取消「可看」，全部取消
      if (action !== 'can_view' && next) cur.can_view = true
      if (action === 'can_view' && !next) {
        cur.can_create = false; cur.can_edit = false; cur.can_delete = false; cur.can_cost = false
      }
      return { ...m, [feature]: cur }
    })
  }

  /** 個人例外：三態循環 —— 繼承(null) → 開(true) → 關(false) → 繼承 */
  function cycle(feature: string, action: string) {
    setOverrides(o => {
      const cur = { ...(o[feature] ?? {}) }
      const v = cur[action]
      cur[action] = v === null || v === undefined ? true : v === true ? false : null
      return { ...o, [feature]: cur }
    })
  }

  function toggleRowAll(feature: string, on: boolean) {
    setMatrix(m => ({
      ...m,
      [feature]: {
        can_view: on, can_create: on, can_edit: on, can_delete: on, can_cost: on,
      },
    }))
  }

  async function saveRole() {
    setSaving(true); setMsg('')
    const rows = FEATURES.map(f => ({
      role_key: roleKey,
      feature_key: f.key,
      can_view: !!matrix[f.key]?.can_view,
      can_create: !!matrix[f.key]?.can_create,
      can_edit: !!matrix[f.key]?.can_edit,
      can_delete: !!matrix[f.key]?.can_delete,
      can_cost: !!matrix[f.key]?.can_cost,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role_key,feature_key' })
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setMsg('已儲存（使用者下次重新整理生效）')
    setTimeout(() => setMsg(''), 3000)
  }

  async function saveUser() {
    if (!userId) return
    setSaving(true); setMsg('')
    // 全部繼承的功能 → 刪除該列；有指定的 → upsert
    const toUpsert: any[] = []
    const toDelete: string[] = []
    FEATURES.forEach(f => {
      const o = overrides[f.key] ?? {}
      const allNull = ACTIONS.every(a => o[a.key] === null || o[a.key] === undefined)
      if (allNull) { toDelete.push(f.key); return }
      toUpsert.push({
        user_id: userId, feature_key: f.key,
        can_view: o.can_view ?? null, can_create: o.can_create ?? null,
        can_edit: o.can_edit ?? null, can_delete: o.can_delete ?? null, can_cost: o.can_cost ?? null,
        updated_at: new Date().toISOString(),
      })
    })
    if (toDelete.length) {
      await supabase.from('user_permissions').delete().eq('user_id', userId).in('feature_key', toDelete)
    }
    if (toUpsert.length) {
      const { error } = await supabase.from('user_permissions').upsert(toUpsert, { onConflict: 'user_id,feature_key' })
      if (error) { setSaving(false); alert('儲存失敗：' + error.message); return }
    }
    setSaving(false)
    setMsg('已儲存個人例外')
    setTimeout(() => setMsg(''), 3000)
  }

  const grouped = useMemo(() => FEATURE_GROUPS.map(g => ({
    group: g, items: FEATURES.filter(f => f.group === g),
  })).filter(g => g.items.length), [])

  if (!ready || loading) return <div className="p-10 text-center text-gray-400">載入中…</div>

  if (noTable) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          權限資料表尚未建立。請到 Supabase SQL Editor 執行 <code>supabase/schema_permissions.sql</code>。<br />
          （在建立完成前，所有登入者維持原本的完整權限，系統不會被鎖住。）
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5 text-sm">
          只有管理員能設定權限。
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-900">權限管理</h1>
        <a href="/settings" className="ml-auto text-sm text-blue-600 hover:underline">← 返回系統設定</a>
      </div>
      <p className="text-sm text-gray-500 mb-5">勾選每個角色可以使用的功能與動作。個人有特例時，再到「個人例外」單獨調整。</p>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setTab('role')}
          className={`px-4 py-2 rounded-xl text-sm ${tab === 'role' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          角色權限
        </button>
        <button onClick={() => setTab('user')}
          className={`px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 ${tab === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          <Users size={15} /> 個人例外
        </button>
        <div className="flex-1" />
        {msg && <span className="text-sm text-green-600">{msg}</span>}
        <button onClick={tab === 'role' ? saveRole : saveUser} disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
          <Save size={15} /> {saving ? '儲存中…' : '儲存'}
        </button>
      </div>

      {tab === 'role' ? (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {roles.map(r => (
            <button key={r.key} onClick={() => setRoleKey(r.key)}
              className={`px-3 py-1.5 rounded-xl text-sm border ${roleKey === r.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {r.name}
              {r.key === 'admin' && <span className="ml-1 text-[10px] opacity-70">全開</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <select value={userId} onChange={e => setUserId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm w-72">
            <option value="">— 選擇使用者 —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}（{u.role || '未設角色'}）
              </option>
            ))}
          </select>
          {userId && (
            <p className="text-xs text-gray-500 mt-2">
              三態切換：<span className="text-gray-400">灰＝沿用角色</span>、
              <span className="text-green-600">綠＝特別開放</span>、
              <span className="text-red-500">紅＝特別禁止</span>
            </p>
          )}
        </div>
      )}

      {roleKey === 'admin' && tab === 'role' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 mb-4">
          管理員永遠擁有全部權限（避免把自己鎖在外面），此角色不可修改。
        </div>
      )}

      {(tab === 'role' || userId) && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b bg-gray-50">
                  <th className="text-left py-2.5 px-4 w-64">功能</th>
                  {ACTIONS.map(a => <th key={a.key} className="px-3 text-center w-20">{a.label}</th>)}
                  {tab === 'role' && <th className="px-3 text-center w-24">整列</th>}
                </tr>
              </thead>
              <tbody>
                {grouped.map(g => (
                  <>
                    <tr key={g.group} className="bg-gray-50/60">
                      <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold text-gray-500">{g.group}</td>
                    </tr>
                    {g.items.map(f => (
                      <tr key={f.key} className="border-b last:border-0 hover:bg-gray-50/40">
                        <td className="py-2 px-4">
                          <div className="text-gray-900">{f.label}</div>
                          {f.costLabel && <div className="text-[11px] text-gray-400">看成本＝{f.costLabel}</div>}
                        </td>
                        {ACTIONS.map(a => {
                          const disabled = roleKey === 'admin' && tab === 'role'
                          if (tab === 'role') {
                            const on = !!matrix[f.key]?.[a.key]
                            const na = a.key === 'can_cost' && !f.costLabel
                            return (
                              <td key={a.key} className="px-3 text-center">
                                {na ? <span className="text-gray-200">—</span> : (
                                  <input type="checkbox" checked={disabled ? true : on} disabled={disabled}
                                    onChange={() => toggle(f.key, a.key)}
                                    className="w-4 h-4 accent-blue-600 disabled:opacity-40" />
                                )}
                              </td>
                            )
                          }
                          const v = overrides[f.key]?.[a.key]
                          const na = a.key === 'can_cost' && !f.costLabel
                          return (
                            <td key={a.key} className="px-3 text-center">
                              {na ? <span className="text-gray-200">—</span> : (
                                <button onClick={() => cycle(f.key, a.key)}
                                  className={`w-6 h-6 rounded-md border flex items-center justify-center mx-auto ${
                                    v === true ? 'bg-green-500 border-green-500 text-white'
                                    : v === false ? 'bg-red-500 border-red-500 text-white'
                                    : 'bg-gray-100 border-gray-200 text-gray-400'
                                  }`}>
                                  {v === true ? <Check size={13} /> : v === false ? <Minus size={13} /> : ''}
                                </button>
                              )}
                            </td>
                          )
                        })}
                        {tab === 'role' && (
                          <td className="px-3 text-center">
                            {roleKey !== 'admin' && (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => toggleRowAll(f.key, true)}
                                  className="text-xs px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50">全開</button>
                                <button onClick={() => toggleRowAll(f.key, false)}
                                  className="text-xs px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50">全關</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-5 text-sm text-amber-800 leading-relaxed">
        <b>安全性說明（請務必了解）：</b>此權限管理控制的是「介面上看得到什麼、能按什麼」。
        資料庫層的防護另外由 RLS 負責 —— 目前薪資、身分證、銀行帳戶等敏感資料已用 RLS 鎖住（僅管理員／主管），
        但其他一般資料表對所有登入者仍是可讀的。如果你的員工帳號會落到不信任的人手上，
        請告訴我，我可以把 RLS 也依角色收緊。
      </div>
    </div>
  )
}
