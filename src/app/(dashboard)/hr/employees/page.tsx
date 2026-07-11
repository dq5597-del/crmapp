'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Users, Plus, Search, Edit2, Trash2, X, Eye, EyeOff, Printer} from 'lucide-react'

const STATUS = ['在職', '留停', '離職'] as const
const STATUS_COLORS: Record<string, string> = {
  '在職': 'bg-green-100 text-green-700',
  '留停': 'bg-amber-100 text-amber-700',
  '離職': 'bg-gray-100 text-gray-500',
}
const EMP_TYPES = ['正職', '兼職', '工讀', '約聘'] as const
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const EMPTY: any = {
  employee_no: '', full_name: '', id_number: '', gender: '', birth_date: '',
  phone: '', email: '', address: '', department: '', title: '',
  employment_type: '正職', hire_date: '', resign_date: '', status: '在職',
  bank_name: '', bank_account: '', base_salary: '',
  labor_insurance_no: '', health_insurance_no: '',
  emergency_contact: '', emergency_phone: '', emergency_relation: '', notes: '',
}

export default function HrEmployeesPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [statusFilter, setStatusFilter] = useState('全部')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showSensitive, setShowSensitive] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase.from('hr_employees').select('*').order('created_at', { ascending: false })
    if (error) { console.error(error); setDenied(true) }
    setRows(data ?? [])
    setLoading(false)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { 全部: rows.length }
    STATUS.forEach(s => { c[s] = rows.filter(r => r.status === s).length })
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== '全部' && r.status !== statusFilter) return false
      if (!kw) return true
      return [r.full_name, r.employee_no, r.department, r.title, r.phone]
        .some(v => (v ?? '').toLowerCase().includes(kw))
    })
  }, [rows, statusFilter, search])

  function openNew() { setEditingId(null); setForm(EMPTY); setModalOpen(true) }
  function openEdit(r: any) {
    setEditingId(r.id)
    setForm({
      ...EMPTY, ...r,
      birth_date: r.birth_date ?? '', hire_date: r.hire_date ?? '', resign_date: r.resign_date ?? '',
      base_salary: r.base_salary != null ? String(r.base_salary) : '',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.full_name?.trim()) { alert('請填姓名'); return }
    setSaving(true)
    const payload: any = { ...form }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.user_id
    payload.full_name = payload.full_name.trim()
    payload.base_salary = payload.base_salary ? Number(payload.base_salary) : null
    for (const k of ['birth_date', 'hire_date', 'resign_date']) payload[k] = payload[k] || null
    for (const k of Object.keys(payload)) if (payload[k] === '') payload[k] = null

    const { error } = editingId
      ? await supabase.from('hr_employees').update(payload).eq('id', editingId)
      : await supabase.from('hr_employees').insert(payload)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setModalOpen(false); fetchData()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除員工「${r.full_name}」？此動作無法復原。`)) return
    const { error } = await supabase.from('hr_employees').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  const mask = (v?: string | null) => {
    if (!v) return '—'
    if (showSensitive) return v
    return v.length <= 4 ? '••••' : v.slice(0, 3) + '••••' + v.slice(-2)
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取人資資料。可能原因：<br />
          1. 尚未執行 <code>supabase/schema_hr.sql</code>（資料表未建立）<br />
          2. 你的角色不是「管理員」或「主管」（人資資料僅限這兩種角色存取）
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">員工資料</h1>
          <span className="text-sm text-gray-400">共 {rows.length} 人</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSensitive(v => !v)}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm text-gray-600">
            {showSensitive ? <EyeOff size={15} /> : <Eye size={15} />} {showSensitive ? '隱藏敏感資料' : '顯示敏感資料'}
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增員工
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['全部', ...STATUS] as string[]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s} <span className="opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋姓名、工號、部門、職稱、電話…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">沒有符合的員工</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">工號</th>
                  <th className="px-4">姓名</th>
                  <th className="px-4">部門 / 職稱</th>
                  <th className="px-4">身分</th>
                  <th className="px-4">到職日</th>
                  <th className="px-4">電話</th>
                  <th className="px-4 text-right">月薪</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 text-gray-600">{r.employee_no ?? '—'}</td>
                    <td className="px-4 font-medium text-gray-900">{r.full_name}</td>
                    <td className="px-4 text-gray-600">{[r.department, r.title].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 text-gray-600">{r.employment_type ?? '—'}</td>
                    <td className="px-4 text-gray-600 whitespace-nowrap">{r.hire_date ? formatDate(r.hire_date) : '—'}</td>
                    <td className="px-4 text-gray-600">{r.phone ?? '—'}</td>
                    <td className="px-4 text-right text-gray-700">
                      {r.base_salary != null ? (showSensitive ? `NT$${Number(r.base_salary).toLocaleString()}` : '••••••') : '—'}
                    </td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} title="編輯" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Edit2 size={15} /></button>
                        <button onClick={() => window.open(`/hr/employees/${r.id}/print`, '_blank')} title="列印資料卡／分享 PDF" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={15} /></button>
                        <button onClick={() => remove(r)} title="刪除" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
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
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold">{editingId ? '編輯員工' : '新增員工'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              <section>
                <div className="text-xs font-semibold text-gray-500 mb-2">基本資料</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="工號"><input value={form.employee_no ?? ''} onChange={e => setForm({ ...form, employee_no: e.target.value })} className={inp} /></F>
                  <F label="姓名 *"><input value={form.full_name ?? ''} onChange={e => setForm({ ...form, full_name: e.target.value })} className={inp} /></F>
                  <F label="身分證字號"><input value={form.id_number ?? ''} onChange={e => setForm({ ...form, id_number: e.target.value.toUpperCase() })} className={inp} /></F>
                  <F label="性別">
                    <select value={form.gender ?? ''} onChange={e => setForm({ ...form, gender: e.target.value })} className={inp}>
                      <option value="">—</option><option>男</option><option>女</option><option>其他</option>
                    </select>
                  </F>
                  <F label="生日"><input type="date" value={form.birth_date ?? ''} onChange={e => setForm({ ...form, birth_date: e.target.value })} className={inp} /></F>
                  <F label="電話"><input value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} className={inp} /></F>
                  <F label="Email"><input value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} className={inp} /></F>
                  <div className="sm:col-span-2">
                    <F label="地址"><input value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} className={inp} /></F>
                  </div>
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold text-gray-500 mb-2">任職資料</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="部門"><input value={form.department ?? ''} onChange={e => setForm({ ...form, department: e.target.value })} className={inp} /></F>
                  <F label="職稱"><input value={form.title ?? ''} onChange={e => setForm({ ...form, title: e.target.value })} className={inp} /></F>
                  <F label="身分">
                    <select value={form.employment_type ?? '正職'} onChange={e => setForm({ ...form, employment_type: e.target.value })} className={inp}>
                      {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </F>
                  <F label="到職日"><input type="date" value={form.hire_date ?? ''} onChange={e => setForm({ ...form, hire_date: e.target.value })} className={inp} /></F>
                  <F label="離職日"><input type="date" value={form.resign_date ?? ''} onChange={e => setForm({ ...form, resign_date: e.target.value })} className={inp} /></F>
                  <F label="狀態">
                    <select value={form.status ?? '在職'} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                      {STATUS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </F>
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold text-amber-600 mb-2">薪資 / 保險（敏感資料）</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="月薪"><input type="number" value={form.base_salary ?? ''} onChange={e => setForm({ ...form, base_salary: e.target.value })} className={inp} /></F>
                  <F label="勞保證號"><input value={form.labor_insurance_no ?? ''} onChange={e => setForm({ ...form, labor_insurance_no: e.target.value })} className={inp} /></F>
                  <F label="健保證號"><input value={form.health_insurance_no ?? ''} onChange={e => setForm({ ...form, health_insurance_no: e.target.value })} className={inp} /></F>
                  <F label="銀行名稱"><input value={form.bank_name ?? ''} onChange={e => setForm({ ...form, bank_name: e.target.value })} className={inp} /></F>
                  <div className="sm:col-span-2">
                    <F label="銀行帳戶"><input value={form.bank_account ?? ''} onChange={e => setForm({ ...form, bank_account: e.target.value })} className={inp} /></F>
                  </div>
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold text-gray-500 mb-2">緊急聯絡人</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="姓名"><input value={form.emergency_contact ?? ''} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} className={inp} /></F>
                  <F label="電話"><input value={form.emergency_phone ?? ''} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} className={inp} /></F>
                  <F label="關係"><input value={form.emergency_relation ?? ''} onChange={e => setForm({ ...form, emergency_relation: e.target.value })} className={inp} placeholder="配偶／父母…" /></F>
                </div>
              </section>

              <F label="備註"><textarea rows={2} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} /></F>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">
                {saving ? '儲存中…' : (editingId ? '儲存' : '建立員工')}
              </button>
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
