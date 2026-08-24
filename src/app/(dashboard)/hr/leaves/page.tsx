'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { CalendarOff, Plus, Edit2, Trash2, X, Check, Ban } from 'lucide-react'

const LEAVE_TYPES = ['特休', '事假', '病假', '公假', '婚假', '喪假', '產假', '陪產假', '生理假', '補休'] as const
const STATUS = ['待審核', '已核准', '已駁回', '已取消'] as const
const STATUS_COLORS: Record<string, string> = {
  '待審核': 'bg-amber-100 text-amber-700',
  '已核准': 'bg-green-100 text-green-700',
  '已駁回': 'bg-red-100 text-red-700',
  '已取消': 'bg-gray-100 text-gray-500',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const EMPTY: any = {
  employee_id: '', leave_type: '特休', start_date: '', end_date: '',
  hours: '8', reason: '', status: '待審核', notes: '',
}

export default function HrLeavesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [statusFilter, setStatusFilter] = useState('全部')
  const [year, setYear] = useState(new Date().getFullYear())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [balOpen, setBalOpen] = useState(false)
  const [balForm, setBalForm] = useState<Record<string, string>>({})

  useEffect(() => { fetchData() }, [year])

  async function fetchData() {
    setLoading(true)
    const [lRes, eRes, bRes] = await Promise.all([
      supabase.from('hr_leaves').select('*, hr_employees(full_name, employee_no)')
        .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
        .order('created_at', { ascending: false }),
      supabase.from('hr_employees').select('id, full_name, employee_no').eq('status', '在職').order('full_name'),
      supabase.from('hr_leave_balances').select('*').eq('year', year),
    ])
    if (lRes.error) { console.error(lRes.error); setDenied(true) }
    setRows(lRes.data ?? [])
    setEmps(eRes.data ?? [])
    setBalances(bRes.data ?? [])
    setLoading(false)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { 全部: rows.length }
    STATUS.forEach(s => { c[s] = rows.filter(r => r.status === s).length })
    return c
  }, [rows])

  const filtered = useMemo(
    () => rows.filter(r => statusFilter === '全部' || r.status === statusFilter),
    [rows, statusFilter],
  )

  // 特休：已用 = 已核准的特休時數加總
  const annualUsed = useMemo(() => {
    const m: Record<string, number> = {}
    rows.filter(r => r.leave_type === '特休' && r.status === '已核准')
      .forEach(r => { m[r.employee_id] = (m[r.employee_id] ?? 0) + Number(r.hours ?? 0) })
    return m
  }, [rows])

  const balOf = (empId: string) => Number(balances.find(b => b.employee_id === empId)?.annual_hours ?? 0)

  function openNew() { setEditingId(null); setForm(EMPTY); setModalOpen(true) }
  function openEdit(r: any) {
    setEditingId(r.id)
    setForm({ ...EMPTY, ...r, hours: String(r.hours ?? 8) })
    setModalOpen(true)
  }

  async function save() {
    if (!form.employee_id) { alert('請選擇員工'); return }
    if (!form.start_date || !form.end_date) { alert('請填起訖日期'); return }
    if (form.end_date < form.start_date) { alert('結束日期不可早於開始日期'); return }
    setSaving(true)
    const payload: any = {
      employee_id: form.employee_id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      hours: Number(form.hours) || 0,
      reason: form.reason || null,
      status: form.status,
      notes: form.notes || null,
    }
    const { error } = editingId
      ? await supabase.from('hr_leaves').update(payload).eq('id', editingId)
      : await supabase.from('hr_leaves').insert(payload)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setModalOpen(false); fetchData()
  }

  async function decide(r: any, approve: boolean) {
    let reject_reason: string | null = null
    if (!approve) {
      reject_reason = prompt('駁回原因（選填）') ?? ''
    } else {
      // 特休超額提醒
      if (r.leave_type === '特休') {
        const total = balOf(r.employee_id)
        const used = annualUsed[r.employee_id] ?? 0
        if (total > 0 && used + Number(r.hours) > total) {
          if (!confirm(`此員工特休將超額（額度 ${total} 小時，已用 ${used}，本次 ${r.hours}）。仍要核准嗎？`)) return
        }
      }
    }
    const { data: sess } = await supabase.auth.getSession()
    const { error } = await supabase.from('hr_leaves').update({
      status: approve ? '已核准' : '已駁回',
      approved_at: new Date().toISOString(),
      approver_id: sess.session?.user?.id ?? null,
      reject_reason: approve ? null : (reject_reason || null),
    }).eq('id', r.id)
    if (error) { alert('操作失敗：' + error.message); return }
    fetchData()
  }

  async function remove(r: any) {
    if (!confirm('確定刪除這筆請假紀錄？')) return
    const { error } = await supabase.from('hr_leaves').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  function openBalances() {
    const init: Record<string, string> = {}
    emps.forEach(e => { init[e.id] = String(balOf(e.id) || '') })
    setBalForm(init)
    setBalOpen(true)
  }

  async function saveBalances() {
    const rowsToSave = emps
      .filter(e => balForm[e.id] !== undefined && balForm[e.id] !== '')
      .map(e => ({ employee_id: e.id, year, annual_hours: Number(balForm[e.id]) || 0 }))
    if (rowsToSave.length === 0) { setBalOpen(false); return }
    const { error } = await supabase.from('hr_leave_balances')
      .upsert(rowsToSave, { onConflict: 'employee_id,year' })
    if (error) { alert('儲存失敗：' + error.message); return }
    setBalOpen(false); fetchData()
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取請假資料。可能原因：<br />
          1. 尚未執行 <code>supabase/schema_hr_attendance.sql</code>（資料表未建立）<br />
          2. 你的角色不是「管理員」或「主管」
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <CalendarOff className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">請假管理</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value) || year)}
            className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
          <button onClick={openBalances} className="border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm text-gray-600">
            設定特休額度
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增請假
          </button>
        </div>
      </div>

      {/* 特休餘額 */}
      {emps.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <div className="text-xs font-semibold text-gray-500 mb-2">{year} 年特休餘額（小時）</div>
          <div className="flex flex-wrap gap-2">
            {emps.map(e => {
              const total = balOf(e.id)
              const used = annualUsed[e.id] ?? 0
              const left = total - used
              return (
                <div key={e.id} className="border border-gray-100 rounded-xl px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800">{e.full_name}</span>
                  <span className="text-gray-400 mx-2">|</span>
                  <span className="text-gray-500">額度 {total || 0}</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <span className="text-gray-500">已用 {used}</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <span className={left < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>剩 {left}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['全部', ...STATUS] as string[]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s} <span className="opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">沒有符合的請假紀錄</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">員工</th>
                  <th className="px-4">假別</th>
                  <th className="px-4">起訖</th>
                  <th className="px-4 text-right">時數</th>
                  <th className="px-4">事由</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 font-medium text-gray-900">{r.hr_employees?.full_name ?? '—'}</td>
                    <td className="px-4 text-gray-700">{r.leave_type}</td>
                    <td className="px-4 text-gray-600 whitespace-nowrap">{r.start_date} ~ {r.end_date}</td>
                    <td className="px-4 text-right text-gray-700">{r.hours}</td>
                    <td className="px-4 text-gray-500 max-w-[200px] truncate">
                      {r.reason ?? '—'}
                      {r.status === '已駁回' && r.reject_reason && (
                        <div className="text-xs text-red-500">駁回：{r.reject_reason}</div>
                      )}
                    </td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === '待審核' && (
                          <>
                            <button onClick={() => decide(r, true)} title="核准"
                              className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><Check size={15} /></button>
                            <button onClick={() => decide(r, false)} title="駁回"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Ban size={15} /></button>
                          </>
                        )}
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Edit2 size={15} /></button>
                        <button onClick={() => remove(r)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/編輯請假 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId ? '編輯請假' : '新增請假'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="員工 *">
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className={inp}>
                  <option value="">— 選擇員工 —</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </F>
              <F label="假別">
                <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })} className={inp}>
                  {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </F>
              <F label="開始日期 *"><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inp} /></F>
              <F label="結束日期 *"><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inp} /></F>
              <F label="時數"><input type="number" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} className={inp} placeholder="8 = 一天" /></F>
              <F label="狀態">
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                  {STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </F>
              <div className="sm:col-span-2">
                <F label="請假事由"><textarea rows={2} value={form.reason ?? ''} onChange={e => setForm({ ...form, reason: e.target.value })} className={inp} /></F>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 設定特休額度 */}
      {balOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold">設定 {year} 年特休額度（小時）</h3>
              <button onClick={() => setBalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-xs text-gray-400 mb-2">以小時計；一天以 8 小時換算（例：特休 7 天 = 56 小時）。</p>
              {emps.map(e => (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-700">{e.full_name}</span>
                  <input type="number" step="0.5" value={balForm[e.id] ?? ''}
                    onChange={ev => setBalForm({ ...balForm, [e.id]: ev.target.value })}
                    className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="0" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setBalOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={saveBalances} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">儲存額度</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
