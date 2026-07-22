'use client'

/**
 * 人資戰情室（2026-07 新增）
 * 人員總覽、本月活動量（行程/報價/銷貨）、角色分佈
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { UserCog, Users, Activity, Clock, MapPin, Plus, Trash2 } from 'lucide-react'

const num = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$${Math.round(num(v)).toLocaleString()}`

const ROLE_LABEL: Record<string, string> = { admin: '管理員', manager: '主管', user: '一般人員' }
// 組織職稱（決定各戰情室可見範圍）
const TITLES = ['董事長', 'CEO', '總經理', '經理', '主任', '會計主管', '會計', '技術主管', '總工程師', '資深工程師', '工程師', '員工']

export default function HrDashboard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [workTime, setWorkTime] = useState({ start: '09:00', end: '18:00' })
  const [savingTime, setSavingTime] = useState(false)
  const [branches, setBranches] = useState<any[]>([])
  const [newBranch, setNewBranch] = useState('')
  // 新增使用者（帳號＋人員一體）
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'user', branch_id: '', title: '員工', manager_id: '' })
  const [creatingUser, setCreatingUser] = useState(false)

  useEffect(() => {
    (async () => {
      const ymStart = new Date().toISOString().slice(0, 7) + '-01'
      const [sp, sch, q, so, st, br] = await Promise.all([
        supabase.from('user_profiles').select('*'),
        supabase.from('schedules').select('id, created_by, status, schedule_date').gte('schedule_date', ymStart),
        supabase.from('quotes').select('salesperson_id, total_amount, created_at').gte('created_at', ymStart),
        supabase.from('sales_orders').select('salesperson_id, total_amount, status, created_at').gte('created_at', ymStart),
        supabase.from('system_settings').select('work_start_time, work_end_time').limit(1).maybeSingle(),
        supabase.from('branches').select('*').order('name'),
      ])
      setPeople(sp.data ?? []); setSchedules(sch.data ?? [])
      setQuotes(q.data ?? []); setSalesOrders(so.data ?? [])
      const s = st.data as any
      if (s) setWorkTime({ start: s.work_start_time ?? '09:00', end: s.work_end_time ?? '18:00' })
      setBranches(br.data ?? [])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const view = useMemo(() => {
    const active = people.filter(p => p.is_active !== false)
    const roleCount = new Map<string, number>()
    for (const p of people) {
      const r = ROLE_LABEL[p.role] ?? p.role ?? '未設定'
      roleCount.set(r, (roleCount.get(r) ?? 0) + 1)
    }
    const rows = people.map(p => {
      const sch = schedules.filter(s => s.created_by === p.id)
      const done = sch.filter(s => ['已完成', '延誤完成'].includes(s.status)).length
      const q = quotes.filter(x => x.salesperson_id === p.id)
      const so = salesOrders.filter(x => x.salesperson_id === p.id && x.status !== '作廢')
      return {
        id: p.id, name: p.full_name ?? '—', role: ROLE_LABEL[p.role] ?? p.role ?? '—',
        active: p.is_active !== false,
        schCnt: sch.length, schDone: done,
        quoteCnt: q.length,
        soAmt: so.reduce((s, x) => s + num(x.total_amount), 0),
      }
    }).sort((a, b) => b.schCnt - a.schCnt)
    return { total: people.length, activeCnt: active.length, roleCount: [...roleCount.entries()], rows }
  }, [people, schedules, quotes, salesOrders])

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <UserCog size={22} className="text-indigo-600" />
        <h1 className="text-xl font-bold text-gray-900">人資戰情室</h1>
        <span className="text-sm text-gray-400">人員・活動量・角色</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-gray-400 mb-1">總人數</div>
          <div className="text-xl font-bold">{view.total} 人</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs text-gray-400 mb-1">啟用中</div>
          <div className="text-xl font-bold text-green-700">{view.activeCnt} 人</div>
        </div>
        {view.roleCount.slice(0, 2).map(([role, cnt]) => (
          <div key={role} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-xs text-gray-400 mb-1">{role}</div>
            <div className="text-xl font-bold">{cnt} 人</div>
          </div>
        ))}
      </div>

      {/* 通訊處管理（人員分區，打卡紀錄依此分組） */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
          <Users size={16} className="text-indigo-500" /> 通訊處管理
          <span className="text-xs text-gray-400 font-normal">人員指派通訊處後，CEO/主管戰情室的打卡紀錄會依通訊處分組</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {branches.map(b => (
            <span key={b.id} className="text-xs px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">
              {b.name}（{people.filter(p => p.branch_id === b.id).length} 人）
            </span>
          ))}
          {branches.length === 0 && <span className="text-xs text-gray-400">尚無通訊處，於右側新增</span>}
          <div className="flex gap-1.5 ml-auto">
            <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="通訊處名稱，例：花蓮通訊處"
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 w-44" />
            <button type="button"
              onClick={async () => {
                const name = newBranch.trim()
                if (!name) return
                if (branches.some(b => b.name === name)) { alert('此通訊處已存在'); return }
                const { data, error } = await supabase.from('branches').insert({ name }).select().single()
                if (error) { alert('新增失敗：' + error.message); return }
                setBranches(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')))
                setNewBranch('')
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium">＋ 新增</button>
          </div>
        </div>
      </div>

      {/* 新增使用者：帳號與人員一體，建立後即可登入 */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
          <UserCog size={16} className="text-indigo-500" /> 新增使用者
          <span className="text-xs text-gray-400 font-normal">帳號＝人員：在這裡建立後，對方即可用 Email＋密碼登入（需管理員身分）</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">姓名 *</span>
            <input value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">登入 Email *</span>
            <input value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="name@company.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">臨時密碼 *（至少 8 碼）</span>
            <input value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">角色</span>
            <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="user">一般人員</option>
              <option value="sales">業務</option>
              <option value="tech">技術</option>
              <option value="accountant">會計</option>
              <option value="hr">人資</option>
              <option value="manager">主管</option>
              <option value="admin">管理員</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">通訊處</span>
            <select value={newUser.branch_id} onChange={e => setNewUser(p => ({ ...p, branch_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— 未分配 —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">職稱（決定戰情室層級）</span>
            <select value={newUser.title} onChange={e => setNewUser(p => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">上級主管（群組歸屬）</span>
            <select value={newUser.manager_id} onChange={e => setNewUser(p => ({ ...p, manager_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— 無 —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `（${p.title}）` : ''}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end mt-3">
          <button type="button" disabled={creatingUser}
            onClick={async () => {
              if (!newUser.full_name.trim() || !newUser.email.trim() || newUser.password.length < 8) {
                alert('請填姓名、Email，密碼至少 8 碼'); return
              }
              setCreatingUser(true)
              try {
                const { data: { session } } = await supabase.auth.getSession()
                const res = await fetch('/api/admin/users', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
                  body: JSON.stringify({ ...newUser, branch_id: newUser.branch_id || null, manager_id: newUser.manager_id || null }),
                })
                const data = await res.json()
                if (!res.ok) { alert(data.error ?? '建立失敗'); setCreatingUser(false); return }
                alert(`✅ 已建立使用者「${newUser.full_name}」\n登入帳號：${newUser.email}\n臨時密碼：${newUser.password}\n請轉告對方登入後自行修改密碼。`)
                setPeople(prev => [...prev, { ...data.user, branch_id: newUser.branch_id || null }])
                setNewUser({ full_name: '', email: '', password: '', role: 'user', branch_id: '', title: '員工', manager_id: '' })
              } catch (e: any) { alert('建立失敗：' + e.message) }
              setCreatingUser(false)
            }}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
            {creatingUser ? '建立中…' : '建立帳號'}
          </button>
        </div>
      </div>

      {/* 上下班時間設定（打卡遲到判定依此） */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
          <Clock size={16} className="text-indigo-500" /> 上下班時間設定
          <span className="text-xs text-gray-400 font-normal">打卡晚於上班時間即標示遲到（紅字）</span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">上班時間</span>
            <input type="time" value={workTime.start} onChange={e => setWorkTime(p => ({ ...p, start: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">下班時間</span>
            <input type="time" value={workTime.end} onChange={e => setWorkTime(p => ({ ...p, end: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <button type="button" disabled={savingTime}
            onClick={async () => {
              setSavingTime(true)
              const { error } = await supabase.from('system_settings')
                .update({ work_start_time: workTime.start, work_end_time: workTime.end })
                .not('id', 'is', null)
              alert(error ? '儲存失敗：' + error.message : '✅ 已儲存上下班時間')
              setSavingTime(false)
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
            {savingTime ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
          <Activity size={16} className="text-indigo-500" /> 本月人員活動量
          <span className="text-xs text-gray-400 font-normal">（行程・報價・銷貨）</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-3">姓名</th>
                <th className="px-3">職稱</th>
                <th className="px-3">上級主管</th>
                <th className="px-3">通訊處</th>
                <th className="px-3">角色</th>
                <th className="px-3 text-center">狀態</th>
                <th className="px-3 text-right">行程數</th>
                <th className="px-3 text-right">行程完成</th>
                <th className="px-3 text-right">報價筆數</th>
                <th className="px-3 text-right">銷貨金額</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 px-3 font-medium text-gray-900 flex items-center gap-2"><Users size={13} className="text-gray-300" /> {r.name}</td>
                  <td className="px-3">
                    <select value={people.find(p => p.id === r.id)?.title ?? '員工'}
                      onChange={async e => {
                        const title = e.target.value
                        const { error } = await supabase.from('user_profiles').update({ title }).eq('id', r.id)
                        if (error) { alert('更新失敗：' + error.message); return }
                        setPeople(prev => prev.map(p => p.id === r.id ? { ...p, title } : p))
                      }}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                      {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3">
                    <select value={people.find(p => p.id === r.id)?.manager_id ?? ''}
                      onChange={async e => {
                        const manager_id = e.target.value || null
                        if (manager_id === r.id) { alert('不能指定自己為上級'); return }
                        const { error } = await supabase.from('user_profiles').update({ manager_id }).eq('id', r.id)
                        if (error) { alert('更新失敗：' + error.message); return }
                        setPeople(prev => prev.map(p => p.id === r.id ? { ...p, manager_id } : p))
                      }}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                      <option value="">— 無 —</option>
                      {people.filter(p => p.id !== r.id).map(p => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `（${p.title}）` : ''}</option>)}
                    </select>
                  </td>
                  <td className="px-3">
                    <select value={people.find(p => p.id === r.id)?.branch_id ?? ''}
                      onChange={async e => {
                        const branch_id = e.target.value || null
                        const { error } = await supabase.from('user_profiles').update({ branch_id }).eq('id', r.id)
                        if (error) { alert('指派失敗：' + error.message); return }
                        setPeople(prev => prev.map(p => p.id === r.id ? { ...p, branch_id } : p))
                      }}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
                      <option value="">— 未分配 —</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 text-gray-600">{r.role}</td>
                  <td className="px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{r.active ? '啟用' : '停用'}</span>
                  </td>
                  <td className="px-3 text-right">{r.schCnt}</td>
                  <td className="px-3 text-right text-green-700">{r.schDone}</td>
                  <td className="px-3 text-right">{r.quoteCnt}</td>
                  <td className="px-3 text-right font-semibold text-blue-700">{money(r.soAmt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
