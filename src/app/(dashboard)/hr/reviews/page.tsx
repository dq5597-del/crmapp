'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Award, Plus, Edit2, Trash2, X } from 'lucide-react'

const TYPES = ['年度考評', '半年考評', '季考評', '試用期考評'] as const
const STATUS = ['草稿', '已完成'] as const
const GRADE_COLORS: Record<string, string> = {
  S: 'bg-purple-100 text-purple-700',
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-600',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const num = (v: any) => Number(v ?? 0) || 0

const DIMS = [
  { key: 'financial', label: '財務構面', hint: '營收 / 毛利 / 成本達成', color: 'text-blue-700' },
  { key: 'customer',  label: '顧客構面', hint: '客戶滿意度 / 回購 / 新客開發', color: 'text-green-700' },
  { key: 'process',   label: '內部流程', hint: '交期 / 品質 / 錯誤率', color: 'text-amber-700' },
  { key: 'learning',  label: '學習與成長', hint: '技能 / 證照 / 知識分享', color: 'text-purple-700' },
] as const

function gradeOf(score: number) {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

export default function HrReviewsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [emps, setEmps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [year])

  async function fetchData() {
    setLoading(true)
    const [rRes, eRes] = await Promise.all([
      supabase.from('hr_reviews').select('*, hr_employees(full_name, department, title)')
        .like('period', `${year}%`).order('created_at', { ascending: false }),
      supabase.from('hr_employees').select('id, full_name, base_salary').eq('status', '在職').order('full_name'),
    ])
    if (rRes.error) { console.error(rRes.error); setDenied(true) }
    setRows(rRes.data ?? [])
    setEmps(eRes.data ?? [])
    setLoading(false)
  }

  const avg = useMemo(() => {
    if (!rows.length) return 0
    return Math.round(rows.reduce((s, r) => s + num(r.total_score), 0) / rows.length * 10) / 10
  }, [rows])

  /** 加權總分 */
  function totalOf(f: any) {
    const wSum = DIMS.reduce((s, d) => s + num(f[`weight_${d.key}`]), 0) || 100
    const t = DIMS.reduce((s, d) => s + num(f[`score_${d.key}`]) * num(f[`weight_${d.key}`]), 0) / wSum
    return Math.round(t * 10) / 10
  }

  function openNew() {
    setEditingId(null)
    setForm({
      employee_id: '', period: `${year}`, review_type: '年度考評',
      reviewer: '', review_date: new Date().toISOString().slice(0, 10),
      score_financial: 0, score_customer: 0, score_process: 0, score_learning: 0,
      weight_financial: 30, weight_customer: 30, weight_process: 20, weight_learning: 20,
      goals: '', strengths: '', improvements: '', employee_comment: '',
      status: '草稿',
    })
    setOpen(true)
  }

  function openEdit(r: any) {
    setEditingId(r.id); setForm({ ...r }); setOpen(true)
  }

  async function save() {
    if (!form.employee_id) { alert('請選擇員工'); return }
    if (!form.period) { alert('請填寫考評期間'); return }
    setSaving(true)
    const total = totalOf(form)
    const payload: any = { ...form, total_score: total, grade: gradeOf(total) }
    delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.hr_employees
    const { error } = editingId
      ? await supabase.from('hr_reviews').update(payload).eq('id', editingId)
      : await supabase.from('hr_reviews').insert(payload)
    setSaving(false)
    if (error) {
      alert(/duplicate|unique/i.test(error.message)
        ? '這位員工在同一期間、同一考評類型已有紀錄，請改用編輯。'
        : '儲存失敗：' + error.message)
      return
    }
    setOpen(false); fetchData()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除 ${r.hr_employees?.full_name ?? ''} 的 ${r.period} 考評？`)) return
    const { error } = await supabase.from('hr_reviews').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取考評資料。可能原因：<br />
          1. 尚未執行 <code>supabase/schema_hr_review.sql</code><br />
          2. 你的角色不是「管理員」或「主管」
        </div>
      </div>
    )
  }

  const liveTotal = totalOf(form)
  const wSum = DIMS.reduce((s, d) => s + num(form[`weight_${d.key}`]), 0)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Award className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">績效考評</h1>
          <span className="text-xs text-gray-400 ml-1 hidden sm:inline">平衡計分卡四構面</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
            {[0, 1, 2, 3].map(i => {
              const y = String(new Date().getFullYear() - i)
              return <option key={y} value={y}>{y} 年</option>
            })}
          </select>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增考評
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Kpi label="考評筆數" value={String(rows.length)} />
        <Kpi label="平均總分" value={rows.length ? String(avg) : '—'} color="text-blue-700" />
        <Kpi label="A 級以上" value={String(rows.filter(r => ['S', 'A'].includes(r.grade)).length)} color="text-green-700" />
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-gray-400">{year} 年尚無考評紀錄</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">員工</th>
                  <th className="px-4">期間</th>
                  <th className="px-4">類型</th>
                  <th className="px-3 text-right">財務</th>
                  <th className="px-3 text-right">顧客</th>
                  <th className="px-3 text-right">流程</th>
                  <th className="px-3 text-right">學習</th>
                  <th className="px-4 text-right">總分</th>
                  <th className="px-4">等第</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 font-medium text-gray-900">{r.hr_employees?.full_name ?? '—'}</td>
                    <td className="px-4 text-gray-600">{r.period}</td>
                    <td className="px-4 text-gray-600">{r.review_type}</td>
                    <td className="px-3 text-right text-gray-700">{num(r.score_financial)}</td>
                    <td className="px-3 text-right text-gray-700">{num(r.score_customer)}</td>
                    <td className="px-3 text-right text-gray-700">{num(r.score_process)}</td>
                    <td className="px-3 text-right text-gray-700">{num(r.score_learning)}</td>
                    <td className="px-4 text-right font-semibold text-gray-900">{num(r.total_score)}</td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-1 rounded-lg font-bold ${GRADE_COLORS[r.grade] ?? 'bg-gray-100 text-gray-500'}`}>
                        {r.grade ?? '—'}
                      </span>
                    </td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-1 rounded-lg ${r.status === '已完成' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.status}
                      </span>
                    </td>
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

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold">{editingId ? '編輯考評' : '新增考評'}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                <F label="考評期間 *">
                  <input value={form.period ?? ''} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="2026 或 2026-H1" className={inp} />
                </F>
                <F label="考評類型">
                  <select value={form.review_type ?? '年度考評'} onChange={e => setForm({ ...form, review_type: e.target.value })} className={inp}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </F>
                <F label="考評主管">
                  <input value={form.reviewer ?? ''} onChange={e => setForm({ ...form, reviewer: e.target.value })} className={inp} />
                </F>
              </div>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">平衡計分卡四構面（分數 0–100，權重合計建議 100）</div>
                  <div className={`text-xs ${wSum === 100 ? 'text-gray-400' : 'text-amber-600'}`}>權重合計 {wSum}</div>
                </div>
                <div className="space-y-2">
                  {DIMS.map(d => (
                    <div key={d.key} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl px-3 py-2">
                      <div className="col-span-12 sm:col-span-5">
                        <div className={`text-sm font-medium ${d.color}`}>{d.label}</div>
                        <div className="text-xs text-gray-400">{d.hint}</div>
                      </div>
                      <div className="col-span-6 sm:col-span-4">
                        <input type="range" min={0} max={100} value={num(form[`score_${d.key}`])}
                          onChange={e => setForm({ ...form, [`score_${d.key}`]: e.target.value })}
                          className="w-full" />
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <input type="number" min={0} max={100} value={form[`score_${d.key}`] ?? 0}
                          onChange={e => setForm({ ...form, [`score_${d.key}`]: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm text-center" />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <div className="flex items-center gap-1">
                          <input type="number" value={form[`weight_${d.key}`] ?? 0}
                            onChange={e => setForm({ ...form, [`weight_${d.key}`]: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-200 rounded-lg text-sm text-center" />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">加權總分</span>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gray-900">{liveTotal}</span>
                  <span className={`text-sm px-2.5 py-1 rounded-lg font-bold ${GRADE_COLORS[gradeOf(liveTotal)]}`}>{gradeOf(liveTotal)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="下期目標（MBO）">
                  <textarea rows={3} value={form.goals ?? ''} onChange={e => setForm({ ...form, goals: e.target.value })} className={inp} />
                </F>
                <F label="優勢">
                  <textarea rows={3} value={form.strengths ?? ''} onChange={e => setForm({ ...form, strengths: e.target.value })} className={inp} />
                </F>
                <F label="待改善">
                  <textarea rows={3} value={form.improvements ?? ''} onChange={e => setForm({ ...form, improvements: e.target.value })} className={inp} />
                </F>
                <F label="員工自評／回覆">
                  <textarea rows={3} value={form.employee_comment ?? ''} onChange={e => setForm({ ...form, employee_comment: e.target.value })} className={inp} />
                </F>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="考評日期">
                  <input type="date" value={form.review_date ?? ''} onChange={e => setForm({ ...form, review_date: e.target.value })} className={inp} />
                </F>
                <F label="狀態">
                  <select value={form.status ?? '草稿'} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                    {STATUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </F>
              </div>
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
