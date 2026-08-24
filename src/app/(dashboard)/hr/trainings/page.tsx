'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { GraduationCap, Plus, Edit2, Trash2, X } from 'lucide-react'

const CATEGORIES = ['內訓', '外訓', '線上課程', '研討會', '證照'] as const
const STATUS = ['規劃中', '進行中', '已完成', '未通過'] as const
const STATUS_COLORS: Record<string, string> = {
  '規劃中': 'bg-gray-100 text-gray-600',
  '進行中': 'bg-blue-100 text-blue-700',
  '已完成': 'bg-green-100 text-green-700',
  '未通過': 'bg-red-100 text-red-600',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const num = (v: any) => Number(v ?? 0) || 0

/** 證照到期天數（null 代表沒有到期日） */
function daysToExpiry(d?: string | null) {
  if (!d) return null
  const diff = new Date(d + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()
  return Math.round(diff / 86400000)
}

export default function HrTrainingsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [filter, setFilter] = useState<string>('全部')
  const [q, setQ] = useState('')

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [tRes, eRes] = await Promise.all([
      supabase.from('hr_trainings').select('*, hr_employees(full_name, department)')
        .order('start_date', { ascending: false, nullsFirst: false }),
      supabase.from('hr_employees').select('id, full_name').eq('status', '在職').order('full_name'),
    ])
    if (tRes.error) { console.error(tRes.error); setDenied(true) }
    setRows(tRes.data ?? [])
    setEmps(eRes.data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filter !== '全部' && r.category !== filter) return false
    if (q) {
      const s = `${r.title ?? ''} ${r.provider ?? ''} ${r.hr_employees?.full_name ?? ''}`.toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  }), [rows, filter, q])

  const expiring = useMemo(() => rows.filter(r => {
    const d = daysToExpiry(r.cert_expiry_date)
    return d !== null && d <= 60
  }), [rows])

  const stats = useMemo(() => ({
    hours: rows.filter(r => r.status === '已完成').reduce((s, r) => s + num(r.hours), 0),
    cost: rows.reduce((s, r) => s + num(r.cost), 0),
    certs: rows.filter(r => r.category === '證照' && r.status === '已完成').length,
  }), [rows])

  function openNew() {
    setEditingId(null)
    setForm({
      employee_id: '', title: '', category: '外訓', provider: '',
      start_date: '', end_date: '', hours: 0, cost: 0,
      score: '', status: '規劃中',
      certificate_no: '', cert_issue_date: '', cert_expiry_date: '', notes: '',
    })
    setOpen(true)
  }

  function openEdit(r: any) { setEditingId(r.id); setForm({ ...r }); setOpen(true) }

  async function save() {
    if (!form.employee_id) { alert('請選擇員工'); return }
    if (!form.title?.trim()) { alert('請填寫課程／證照名稱'); return }
    setSaving(true)
    const payload: any = { ...form }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.hr_employees
    ;['start_date', 'end_date', 'cert_issue_date', 'cert_expiry_date'].forEach(k => {
      if (!payload[k]) payload[k] = null
    })
    const { error } = editingId
      ? await supabase.from('hr_trainings').update(payload).eq('id', editingId)
      : await supabase.from('hr_trainings').insert(payload)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setOpen(false); fetchData()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除「${r.title}」？`)) return
    const { error } = await supabase.from('hr_trainings').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取教育訓練資料。可能原因：<br />
          1. 尚未執行 <code>supabase/schema_hr_review.sql</code><br />
          2. 你的角色不是「管理員」或「主管」
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">教育訓練與證照</h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增
        </button>
      </div>

      {expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 mb-4 text-sm">
          <b>證照到期提醒（60 天內）</b>
          <ul className="mt-1 space-y-0.5">
            {expiring.map(r => {
              const d = daysToExpiry(r.cert_expiry_date)!
              return (
                <li key={r.id}>
                  {r.hr_employees?.full_name ?? '—'}／{r.title} — {r.cert_expiry_date}
                  <span className={d < 0 ? 'text-red-600 font-semibold' : 'font-semibold'}>
                    {d < 0 ? `（已過期 ${-d} 天）` : `（剩 ${d} 天）`}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi label="累計完訓時數" value={`${stats.hours} 小時`} />
        <Kpi label="訓練費用合計" value={`NT$${Math.round(stats.cost).toLocaleString()}`} color="text-amber-600" />
        <Kpi label="已取得證照" value={`${stats.certs} 張`} color="text-green-700" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['全部', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-xl text-sm border ${filter === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {c}
          </button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋課程／機構／員工"
          className="ml-auto px-3 py-1.5 border border-gray-200 rounded-xl text-sm w-56" />
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">沒有符合的紀錄</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">員工</th>
                  <th className="px-4">課程／證照</th>
                  <th className="px-4">類別</th>
                  <th className="px-4">主辦／發證</th>
                  <th className="px-4">期間</th>
                  <th className="px-4 text-right">時數</th>
                  <th className="px-4 text-right">費用</th>
                  <th className="px-4">證照到期</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const d = daysToExpiry(r.cert_expiry_date)
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{r.hr_employees?.full_name ?? '—'}</td>
                      <td className="px-4 text-gray-900">{r.title}</td>
                      <td className="px-4 text-gray-600">{r.category}</td>
                      <td className="px-4 text-gray-600">{r.provider ?? '—'}</td>
                      <td className="px-4 text-gray-500 whitespace-nowrap">
                        {r.start_date ?? '—'}{r.end_date ? ` ~ ${r.end_date}` : ''}
                      </td>
                      <td className="px-4 text-right text-gray-700">{num(r.hours)}</td>
                      <td className="px-4 text-right text-gray-700">{num(r.cost) ? `NT$${Math.round(num(r.cost)).toLocaleString()}` : '—'}</td>
                      <td className="px-4 whitespace-nowrap">
                        {r.cert_expiry_date ? (
                          <span className={d !== null && d < 0 ? 'text-red-600 font-semibold' : d !== null && d <= 60 ? 'text-amber-600 font-semibold' : 'text-gray-600'}>
                            {r.cert_expiry_date}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4">
                        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Edit2 size={15} /></button>
                          <button onClick={() => remove(r)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold">{editingId ? '編輯訓練紀錄' : '新增訓練紀錄'}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="員工 *">
                  {editingId ? (
                    <input value={form.hr_employees?.full_name ?? ''} readOnly className={inp + ' bg-gray-100'} />
                  ) : (
                    <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className={inp}>
                      <option value="">— 選擇 —</option>
                      {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  )}
                </F>
                <F label="課程／證照名稱 *">
                  <input value={form.title ?? ''} onChange={e => setForm({ ...form, title: e.target.value })} className={inp} />
                </F>
                <F label="類別">
                  <select value={form.category ?? '外訓'} onChange={e => setForm({ ...form, category: e.target.value })} className={inp}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </F>
                <F label="主辦單位／發證機構">
                  <input value={form.provider ?? ''} onChange={e => setForm({ ...form, provider: e.target.value })} className={inp} />
                </F>
                <F label="開始日">
                  <input type="date" value={form.start_date ?? ''} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inp} />
                </F>
                <F label="結束日">
                  <input type="date" value={form.end_date ?? ''} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inp} />
                </F>
                <F label="時數">
                  <input type="number" step="0.5" value={form.hours ?? 0} onChange={e => setForm({ ...form, hours: e.target.value })} className={inp} />
                </F>
                <F label="費用">
                  <input type="number" value={form.cost ?? 0} onChange={e => setForm({ ...form, cost: e.target.value })} className={inp} />
                </F>
                <F label="成績／結訓評語">
                  <input value={form.score ?? ''} onChange={e => setForm({ ...form, score: e.target.value })} className={inp} />
                </F>
                <F label="狀態">
                  <select value={form.status ?? '規劃中'} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                    {STATUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </F>
              </div>

              <div className="border-t pt-4">
                <div className="text-xs font-semibold text-gray-700 mb-2">證照資訊（選填）</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="證照編號">
                    <input value={form.certificate_no ?? ''} onChange={e => setForm({ ...form, certificate_no: e.target.value })} className={inp} />
                  </F>
                  <F label="發證日">
                    <input type="date" value={form.cert_issue_date ?? ''} onChange={e => setForm({ ...form, cert_issue_date: e.target.value })} className={inp} />
                  </F>
                  <F label="到期日（會自動提醒）">
                    <input type="date" value={form.cert_expiry_date ?? ''} onChange={e => setForm({ ...form, cert_expiry_date: e.target.value })} className={inp} />
                  </F>
                </div>
              </div>

              <F label="備註">
                <textarea rows={2} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} />
              </F>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color = 'text-gray-900' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
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
