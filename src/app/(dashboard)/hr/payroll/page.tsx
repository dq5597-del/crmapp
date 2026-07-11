'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Wallet, Plus, Edit2, Trash2, X, Printer, Settings2, RefreshCw } from 'lucide-react'

const STATUS = ['草稿', '已確認', '已發放'] as const
const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已確認': 'bg-blue-100 text-blue-700',
  '已發放': 'bg-green-100 text-green-700',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const num = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$${Math.round(num(v)).toLocaleString()}`

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function HrPayrollPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [cfg, setCfg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [period, setPeriod] = useState(thisMonth())
  const [generating, setGenerating] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfgForm, setCfgForm] = useState<any>({})

  useEffect(() => { fetchData() }, [period])

  async function fetchData() {
    setLoading(true)
    const [pRes, eRes, cRes] = await Promise.all([
      supabase.from('hr_payrolls').select('*, hr_employees(full_name, employee_no)')
        .eq('period', period).order('created_at'),
      supabase.from('hr_employees').select('*').eq('status', '在職').order('full_name'),
      supabase.from('hr_payroll_settings').select('*').limit(1).maybeSingle(),
    ])
    if (pRes.error) { console.error(pRes.error); setDenied(true) }
    setRows(pRes.data ?? [])
    setEmps(eRes.data ?? [])
    setCfg(cRes.data ?? null)
    setLoading(false)
  }

  const totals = useMemo(() => ({
    gross: rows.reduce((s, r) => s + num(r.gross_pay), 0),
    deduct: rows.reduce((s, r) => s + num(r.total_deduction), 0),
    net: rows.reduce((s, r) => s + num(r.net_pay), 0),
    employer: rows.reduce((s, r) => s + num(r.employer_labor) + num(r.employer_health) + num(r.employer_pension), 0),
  }), [rows])

  /** 依費率自動試算（可在表單中覆寫任何數字） */
  function calc(f: any) {
    const c = cfg ?? {}
    const ins = num(f.insurance_salary)
    const dep = num(f.dependents)

    const laborRate = num(c.labor_rate) + num(c.employment_rate)
    const labor = ins * laborRate * num(c.labor_employee_share)
    const health = ins * num(c.health_rate) * num(c.health_employee_share) * (1 + dep)
    const empLabor = ins * laborRate * num(c.labor_employer_share)
    const empHealth = ins * num(c.health_rate) * num(c.health_employer_share) * (1 + dep)
    const empPension = ins * num(c.pension_rate)

    const hourly = num(f.base_salary) / (num(c.monthly_hours) || 240)
    const otPay = hourly * num(c.overtime_multiplier) * num(f.overtime_hours)

    return {
      labor_insurance: Math.round(labor),
      health_insurance: Math.round(health),
      employer_labor: Math.round(empLabor),
      employer_health: Math.round(empHealth),
      employer_pension: Math.round(empPension),
      overtime_pay: Math.round(otPay),
    }
  }

  function totalsOf(f: any) {
    const gross = num(f.base_salary) + num(f.overtime_pay) + num(f.allowance) + num(f.bonus) + num(f.other_add)
    const deduct = num(f.labor_insurance) + num(f.health_insurance) + num(f.leave_deduction) + num(f.tax) + num(f.other_deduct)
    return { gross_pay: Math.round(gross), total_deduction: Math.round(deduct), net_pay: Math.round(gross - deduct) }
  }

  /** 批次產生當月薪資（已存在者略過） */
  async function generate() {
    if (!cfg) { alert('尚未載入費率設定'); return }
    const exists = new Set(rows.map(r => r.employee_id))
    const targets = emps.filter(e => !exists.has(e.id))
    if (targets.length === 0) { alert('本月所有在職員工都已有薪資單'); return }
    if (!confirm(`將為 ${targets.length} 位在職員工產生 ${period} 的薪資單草稿，確定嗎？`)) return

    setGenerating(true)
    // 取當月加班時數
    const [y, m] = period.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    const { data: att } = await supabase.from('hr_attendance')
      .select('employee_id, overtime_hours')
      .gte('work_date', `${period}-01`).lte('work_date', `${period}-${String(last).padStart(2, '0')}`)
    const otMap: Record<string, number> = {}
    ;(att ?? []).forEach((a: any) => { otMap[a.employee_id] = (otMap[a.employee_id] ?? 0) + num(a.overtime_hours) })

    const payloads = targets.map(e => {
      const base: any = {
        employee_id: e.id,
        period,
        insurance_salary: num(e.base_salary),
        dependents: 0,
        base_salary: num(e.base_salary),
        overtime_hours: otMap[e.id] ?? 0,
        allowance: 0, bonus: 0, other_add: 0,
        leave_deduction: 0, tax: 0, other_deduct: 0,
        status: '草稿',
      }
      const c = calc(base)
      const withCalc = { ...base, ...c }
      return { ...withCalc, ...totalsOf(withCalc) }
    })

    const { error } = await supabase.from('hr_payrolls').insert(payloads)
    setGenerating(false)
    if (error) { alert('產生失敗：' + error.message); return }
    fetchData()
  }

  function openEdit(r: any) {
    setEditingId(r.id)
    setForm({ ...r })
    setModalOpen(true)
  }

  function openNew() {
    setEditingId(null)
    setForm({
      employee_id: '', period,
      insurance_salary: 0, dependents: 0,
      base_salary: 0, overtime_hours: 0, overtime_pay: 0,
      allowance: 0, bonus: 0, other_add: 0,
      labor_insurance: 0, health_insurance: 0, leave_deduction: 0, tax: 0, other_deduct: 0,
      employer_labor: 0, employer_health: 0, employer_pension: 0,
      status: '草稿',
    })
    setModalOpen(true)
  }

  /** 選員工時自動帶入底薪與投保薪資 */
  function onPickEmployee(id: string) {
    const e = emps.find(x => x.id === id)
    const next = { ...form, employee_id: id, base_salary: num(e?.base_salary), insurance_salary: num(e?.base_salary) }
    setForm({ ...next, ...calc(next) })
  }

  function recalc() {
    setForm((f: any) => ({ ...f, ...calc(f) }))
  }

  async function save() {
    if (!form.employee_id) { alert('請選擇員工'); return }
    setSaving(true)
    const f = { ...form, ...totalsOf(form) }
    const payload: any = { ...f }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.hr_employees
    payload.period = period
    const { error } = editingId
      ? await supabase.from('hr_payrolls').update(payload).eq('id', editingId)
      : await supabase.from('hr_payrolls').insert(payload)
    setSaving(false)
    if (error) {
      alert(/duplicate|unique/i.test(error.message)
        ? '這位員工本月已有薪資單，請改用編輯。'
        : '儲存失敗：' + error.message)
      return
    }
    setModalOpen(false); fetchData()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除 ${r.hr_employees?.full_name ?? ''} 的 ${period} 薪資單？`)) return
    const { error } = await supabase.from('hr_payrolls').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  async function setStatus(r: any, status: string) {
    const patch: any = { status }
    if (status === '已發放' && !r.pay_date) patch.pay_date = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('hr_payrolls').update(patch).eq('id', r.id)
    if (error) { alert('更新失敗：' + error.message); return }
    fetchData()
  }

  function openCfg() { setCfgForm({ ...(cfg ?? {}) }); setCfgOpen(true) }
  async function saveCfg() {
    if (!cfg?.id) { alert('尚無費率設定列，請先執行 schema_hr_payroll.sql'); return }
    const payload: any = { ...cfgForm }
    delete payload.id; delete payload.updated_at
    const { error } = await supabase.from('hr_payroll_settings').update(payload).eq('id', cfg.id)
    if (error) { alert('儲存失敗：' + error.message); return }
    setCfgOpen(false); fetchData()
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取薪資資料。可能原因：<br />
          1. 尚未執行 <code>supabase/schema_hr_payroll.sql</code>（資料表未建立）<br />
          2. 你的角色不是「管理員」或「主管」
        </div>
      </div>
    )
  }

  const live = { ...form, ...totalsOf(form) }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">薪資管理</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
          <button onClick={openCfg} className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm text-gray-600">
            <Settings2 size={15} /> 費率設定
          </button>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
            <RefreshCw size={15} /> {generating ? '產生中…' : '產生本月薪資'}
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Kpi label="應發合計" value={money(totals.gross)} />
        <Kpi label="應扣合計" value={money(totals.deduct)} color="text-amber-600" />
        <Kpi label="實發合計" value={money(totals.net)} color="text-green-700" />
        <Kpi label="雇主負擔（勞健保+勞退）" value={money(totals.employer)} color="text-purple-700" />
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-gray-400">本月尚無薪資單，可按「產生本月薪資」批次建立草稿</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">員工</th>
                  <th className="px-4 text-right">底薪</th>
                  <th className="px-4 text-right">加班</th>
                  <th className="px-4 text-right">應發</th>
                  <th className="px-4 text-right">勞保</th>
                  <th className="px-4 text-right">健保</th>
                  <th className="px-4 text-right">應扣</th>
                  <th className="px-4 text-right">實發</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 font-medium text-gray-900">{r.hr_employees?.full_name ?? '—'}</td>
                    <td className="px-4 text-right text-gray-700">{money(r.base_salary)}</td>
                    <td className="px-4 text-right text-gray-600">{money(r.overtime_pay)}</td>
                    <td className="px-4 text-right text-gray-900 font-medium">{money(r.gross_pay)}</td>
                    <td className="px-4 text-right text-amber-700">{money(r.labor_insurance)}</td>
                    <td className="px-4 text-right text-amber-700">{money(r.health_insurance)}</td>
                    <td className="px-4 text-right text-amber-700">{money(r.total_deduction)}</td>
                    <td className="px-4 text-right text-green-700 font-semibold">{money(r.net_pay)}</td>
                    <td className="px-4">
                      <select value={r.status} onChange={e => setStatus(r, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium border-0 ${STATUS_COLORS[r.status]}`}>
                        {STATUS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => window.open(`/hr/payroll/${r.id}/print`, '_blank')} title="薪資單"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={15} /></button>
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

      {/* 薪資單編輯 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold">{editingId ? '編輯薪資單' : '新增薪資單'}（{period}）</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <F label="員工 *">
                  {editingId ? (
                    <input value={form.hr_employees?.full_name ?? ''} readOnly className={inp + ' bg-gray-100'} />
                  ) : (
                    <select value={form.employee_id} onChange={e => onPickEmployee(e.target.value)} className={inp}>
                      <option value="">— 選擇員工 —</option>
                      {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                    </select>
                  )}
                </F>
                <F label="投保薪資"><input type="number" value={form.insurance_salary ?? 0} onChange={e => setForm({ ...form, insurance_salary: e.target.value })} className={inp} /></F>
                <F label="健保眷屬人數"><input type="number" value={form.dependents ?? 0} onChange={e => setForm({ ...form, dependents: e.target.value })} className={inp} /></F>
              </div>

              <div className="flex justify-end">
                <button onClick={recalc} className="flex items-center gap-1.5 text-sm border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">
                  <RefreshCw size={14} /> 依費率重新試算勞健保／加班費
                </button>
              </div>

              <section>
                <div className="text-xs font-semibold text-green-700 mb-2">應發項目</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <F label="底薪"><input type="number" value={form.base_salary ?? 0} onChange={e => setForm({ ...form, base_salary: e.target.value })} className={inp} /></F>
                  <F label="加班時數"><input type="number" step="0.5" value={form.overtime_hours ?? 0} onChange={e => setForm({ ...form, overtime_hours: e.target.value })} className={inp} /></F>
                  <F label="加班費"><input type="number" value={form.overtime_pay ?? 0} onChange={e => setForm({ ...form, overtime_pay: e.target.value })} className={inp} /></F>
                  <F label="津貼"><input type="number" value={form.allowance ?? 0} onChange={e => setForm({ ...form, allowance: e.target.value })} className={inp} /></F>
                  <F label="獎金"><input type="number" value={form.bonus ?? 0} onChange={e => setForm({ ...form, bonus: e.target.value })} className={inp} /></F>
                  <F label="其他加項"><input type="number" value={form.other_add ?? 0} onChange={e => setForm({ ...form, other_add: e.target.value })} className={inp} /></F>
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold text-amber-600 mb-2">應扣項目（員工負擔）</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <F label="勞保+就保"><input type="number" value={form.labor_insurance ?? 0} onChange={e => setForm({ ...form, labor_insurance: e.target.value })} className={inp} /></F>
                  <F label="健保"><input type="number" value={form.health_insurance ?? 0} onChange={e => setForm({ ...form, health_insurance: e.target.value })} className={inp} /></F>
                  <F label="請假扣款"><input type="number" value={form.leave_deduction ?? 0} onChange={e => setForm({ ...form, leave_deduction: e.target.value })} className={inp} /></F>
                  <F label="代扣所得稅"><input type="number" value={form.tax ?? 0} onChange={e => setForm({ ...form, tax: e.target.value })} className={inp} /></F>
                  <F label="其他扣項"><input type="number" value={form.other_deduct ?? 0} onChange={e => setForm({ ...form, other_deduct: e.target.value })} className={inp} /></F>
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold text-purple-700 mb-2">雇主負擔（公司成本，不從薪水扣）</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <F label="雇主勞保"><input type="number" value={form.employer_labor ?? 0} onChange={e => setForm({ ...form, employer_labor: e.target.value })} className={inp} /></F>
                  <F label="雇主健保"><input type="number" value={form.employer_health ?? 0} onChange={e => setForm({ ...form, employer_health: e.target.value })} className={inp} /></F>
                  <F label="勞退提繳"><input type="number" value={form.employer_pension ?? 0} onChange={e => setForm({ ...form, employer_pension: e.target.value })} className={inp} /></F>
                </div>
              </section>

              <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap gap-6 text-sm">
                <div><span className="text-gray-500">應發合計 </span><b className="text-gray-900">{money(live.gross_pay)}</b></div>
                <div><span className="text-gray-500">應扣合計 </span><b className="text-amber-700">{money(live.total_deduction)}</b></div>
                <div><span className="text-gray-500">實發金額 </span><b className="text-green-700 text-base">{money(live.net_pay)}</b></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <F label="狀態">
                  <select value={form.status ?? '草稿'} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                    {STATUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </F>
                <F label="發放日"><input type="date" value={form.pay_date ?? ''} onChange={e => setForm({ ...form, pay_date: e.target.value })} className={inp} /></F>
                <F label="備註"><input value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} /></F>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 費率設定 */}
      {cfgOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold">費率設定</h3>
              <button onClick={() => setCfgOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-400">以小數輸入（例：12% 填 0.12）。請依當年度勞保局／健保署公告調整。</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <F label="勞保費率"><input type="number" step="0.0001" value={cfgForm.labor_rate ?? ''} onChange={e => setCfgForm({ ...cfgForm, labor_rate: e.target.value })} className={inp} /></F>
                <F label="就業保險費率"><input type="number" step="0.0001" value={cfgForm.employment_rate ?? ''} onChange={e => setCfgForm({ ...cfgForm, employment_rate: e.target.value })} className={inp} /></F>
                <F label="勞保員工負擔比例"><input type="number" step="0.0001" value={cfgForm.labor_employee_share ?? ''} onChange={e => setCfgForm({ ...cfgForm, labor_employee_share: e.target.value })} className={inp} /></F>
                <F label="勞保雇主負擔比例"><input type="number" step="0.0001" value={cfgForm.labor_employer_share ?? ''} onChange={e => setCfgForm({ ...cfgForm, labor_employer_share: e.target.value })} className={inp} /></F>
                <F label="健保費率"><input type="number" step="0.0001" value={cfgForm.health_rate ?? ''} onChange={e => setCfgForm({ ...cfgForm, health_rate: e.target.value })} className={inp} /></F>
                <F label="健保本人負擔比例"><input type="number" step="0.0001" value={cfgForm.health_employee_share ?? ''} onChange={e => setCfgForm({ ...cfgForm, health_employee_share: e.target.value })} className={inp} /></F>
                <F label="健保雇主負擔比例"><input type="number" step="0.0001" value={cfgForm.health_employer_share ?? ''} onChange={e => setCfgForm({ ...cfgForm, health_employer_share: e.target.value })} className={inp} /></F>
                <F label="勞退雇主提繳率"><input type="number" step="0.0001" value={cfgForm.pension_rate ?? ''} onChange={e => setCfgForm({ ...cfgForm, pension_rate: e.target.value })} className={inp} /></F>
                <F label="加班費倍率"><input type="number" step="0.01" value={cfgForm.overtime_multiplier ?? ''} onChange={e => setCfgForm({ ...cfgForm, overtime_multiplier: e.target.value })} className={inp} /></F>
                <F label="月工時基數"><input type="number" value={cfgForm.monthly_hours ?? ''} onChange={e => setCfgForm({ ...cfgForm, monthly_hours: e.target.value })} className={inp} /></F>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setCfgOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={saveCfg} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">儲存費率</button>
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
      <div className={`text-xl font-bold ${color}`}>{value}</div>
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
