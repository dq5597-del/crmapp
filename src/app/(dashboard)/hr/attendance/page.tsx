'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { CalendarCheck, Plus, Edit2, Trash2, X } from 'lucide-react'

const STATUS = ['正常', '遲到', '早退', '請假', '出差', '曠職', '休假'] as const
const STATUS_COLORS: Record<string, string> = {
  '正常': 'bg-green-100 text-green-700',
  '遲到': 'bg-amber-100 text-amber-700',
  '早退': 'bg-amber-100 text-amber-700',
  '請假': 'bg-blue-100 text-blue-700',
  '出差': 'bg-purple-100 text-purple-700',
  '曠職': 'bg-red-100 text-red-700',
  '休假': 'bg-gray-100 text-gray-500',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY: any = {
  employee_id: '', work_date: '', clock_in: '', clock_out: '',
  work_hours: '', overtime_hours: '', status: '正常', notes: '',
}

export default function HrAttendancePage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [month, setMonth] = useState(thisMonth())
  const [empFilter, setEmpFilter] = useState('全部')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [month])

  async function fetchData() {
    setLoading(true)
    const from = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const to = new Date(y, m, 0)
    const toStr = `${month}-${String(to.getDate()).padStart(2, '0')}`

    const [aRes, eRes] = await Promise.all([
      supabase.from('hr_attendance').select('*, hr_employees(full_name, employee_no)')
        .gte('work_date', from).lte('work_date', toStr).order('work_date', { ascending: false }),
      supabase.from('hr_employees').select('id, full_name, employee_no').eq('status', '在職').order('full_name'),
    ])
    if (aRes.error) { console.error(aRes.error); setDenied(true) }
    setRows(aRes.data ?? [])
    setEmps(eRes.data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(
    () => rows.filter(r => empFilter === '全部' || r.employee_id === empFilter),
    [rows, empFilter],
  )

  // 統計：出勤天數 / 遲到 / 加班時數
  const stats = useMemo(() => {
    const present = filtered.filter(r => ['正常', '遲到', '早退', '出差'].includes(r.status)).length
    const late = filtered.filter(r => r.status === '遲到').length
    const absent = filtered.filter(r => r.status === '曠職').length
    const ot = filtered.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0)
    return { present, late, absent, ot }
  }, [filtered])

  function openNew() {
    setEditingId(null)
    setForm({ ...EMPTY, work_date: `${month}-01` })
    setModalOpen(true)
  }
  function openEdit(r: any) {
    setEditingId(r.id)
    setForm({
      ...EMPTY, ...r,
      clock_in: r.clock_in ?? '', clock_out: r.clock_out ?? '',
      work_hours: r.work_hours != null ? String(r.work_hours) : '',
      overtime_hours: r.overtime_hours != null ? String(r.overtime_hours) : '',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.employee_id) { alert('請選擇員工'); return }
    if (!form.work_date) { alert('請選擇日期'); return }
    setSaving(true)
    const payload: any = {
      employee_id: form.employee_id,
      work_date: form.work_date,
      clock_in: form.clock_in || null,
      clock_out: form.clock_out || null,
      work_hours: form.work_hours ? Number(form.work_hours) : null,
      overtime_hours: form.overtime_hours ? Number(form.overtime_hours) : 0,
      status: form.status,
      notes: form.notes || null,
    }
    const { error } = editingId
      ? await supabase.from('hr_attendance').update(payload).eq('id', editingId)
      : await supabase.from('hr_attendance').insert(payload)
    setSaving(false)
    if (error) {
      alert(/duplicate|unique/i.test(error.message)
        ? '這位員工在該日期已有出勤紀錄，請改用編輯。'
        : '儲存失敗：' + error.message)
      return
    }
    setModalOpen(false); fetchData()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除 ${r.hr_employees?.full_name ?? ''} ${r.work_date} 的出勤紀錄？`)) return
    const { error } = await supabase.from('hr_attendance').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取出勤資料。可能原因：<br />
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
          <CalendarCheck className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">出勤紀錄</h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增出勤
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi label="出勤天數" value={stats.present} />
        <Kpi label="遲到次數" value={stats.late} color="text-amber-600" />
        <Kpi label="曠職次數" value={stats.absent} color="text-red-600" />
        <Kpi label="加班時數" value={stats.ot} color="text-purple-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          月份
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          員工
          <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm min-w-[140px]">
            <option value="全部">全部</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">本月沒有出勤紀錄</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">日期</th>
                  <th className="px-4">員工</th>
                  <th className="px-4">上班</th>
                  <th className="px-4">下班</th>
                  <th className="px-4 text-right">工時</th>
                  <th className="px-4 text-right">加班</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4">備註</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.work_date}</td>
                    <td className="px-4 font-medium text-gray-900">{r.hr_employees?.full_name ?? '—'}</td>
                    <td className="px-4 text-gray-600">{r.clock_in ?? '—'}</td>
                    <td className="px-4 text-gray-600">{r.clock_out ?? '—'}</td>
                    <td className="px-4 text-right text-gray-700">{r.work_hours ?? '—'}</td>
                    <td className="px-4 text-right text-purple-700">{Number(r.overtime_hours ?? 0) || '—'}</td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 text-gray-500 max-w-[200px] truncate">{r.notes ?? '—'}</td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
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

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">{editingId ? '編輯出勤' : '新增出勤'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="員工 *">
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className={inp}>
                  <option value="">— 選擇員工 —</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.employee_no ? `（${e.employee_no}）` : ''}</option>)}
                </select>
              </F>
              <F label="日期 *"><input type="date" value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })} className={inp} /></F>
              <F label="上班時間"><input type="time" value={form.clock_in} onChange={e => setForm({ ...form, clock_in: e.target.value })} className={inp} /></F>
              <F label="下班時間"><input type="time" value={form.clock_out} onChange={e => setForm({ ...form, clock_out: e.target.value })} className={inp} /></F>
              <F label="工作時數"><input type="number" step="0.5" value={form.work_hours} onChange={e => setForm({ ...form, work_hours: e.target.value })} className={inp} placeholder="8" /></F>
              <F label="加班時數"><input type="number" step="0.5" value={form.overtime_hours} onChange={e => setForm({ ...form, overtime_hours: e.target.value })} className={inp} placeholder="0" /></F>
              <F label="狀態">
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                  {STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </F>
              <div className="sm:col-span-2">
                <F label="備註"><input value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} /></F>
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
    </div>
  )
}

function Kpi({ label, value, color = 'text-gray-900' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
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
