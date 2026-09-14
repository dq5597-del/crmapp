'use client'

import { useEffect, useState } from 'react'
import { ScrollText, Plus, Pen, Trash2, X, ArrowUp, ArrowDown } from 'lucide-react'

/**
 * 核決權限與流程引擎（權責表）
 * 權責表直接決定表單、金額、折讓及逐級簽核路徑，是 Workflow 唯一的規則來源。
 * 編輯規則＝停用舊版另存新版；停用不刪除，歷史簽核仍會保留。
 */

type Step = {
  step_name: string
  approver_type: 'user' | 'role' | 'direct_manager'
  approver_user_id: string
  approver_role: string
  due_hours: string
}

type FormState = {
  id: string
  doc_type: string
  name: string
  priority: string
  amount_gte: string
  amount_lt: string
  discount_gte: string
  discount_lt: string
  requester_department: string
  is_active: boolean
  effective_from: string
  effective_to: string
  steps: Step[]
}

const EMPTY_STEP: Step = {
  step_name: '', approver_type: 'direct_manager', approver_user_id: '', approver_role: '', due_hours: '',
}

const EMPTY_FORM: FormState = {
  id: '', doc_type: '', name: '', priority: '100',
  amount_gte: '', amount_lt: '', discount_gte: '', discount_lt: '',
  requester_department: '', is_active: true,
  effective_from: new Date().toISOString().slice(0, 10), effective_to: '',
  steps: [{ ...EMPTY_STEP }],
}

const APPROVER_LABEL: Record<string, string> = {
  direct_manager: '直屬主管', role: '指定角色', user: '指定人員',
}

const money = (v: unknown) => `NT$${Math.round(Number(v ?? 0)).toLocaleString()}`

export default function AuthorityMatrix() {
  const [flows, setFlows] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [docTypes, setDocTypes] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const res = await fetch('/api/approvals/authority').then(r => r.json()).catch(() => null)
    if (!res?.ok) {
      setError(res?.error ?? '讀取權責表失敗')
      setLoading(false)
      return
    }
    setFlows(res.data ?? [])
    setPeople(res.people ?? [])
    setDocTypes(res.document_types ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm({ ...EMPTY_FORM, doc_type: docTypes[0]?.value ?? '', steps: [{ ...EMPTY_STEP }] })
    setFormOpen(true)
  }

  function openEdit(flow: any) {
    setForm({
      id: flow.id,
      doc_type: flow.doc_type,
      name: flow.name ?? '',
      priority: String(flow.priority ?? 100),
      amount_gte: flow.amount_gte ?? '',
      amount_lt: flow.amount_lt ?? '',
      discount_gte: flow.discount_gte ?? '',
      discount_lt: flow.discount_lt ?? '',
      requester_department: flow.requester_department ?? '',
      is_active: flow.is_active,
      effective_from: flow.effective_from ?? '',
      effective_to: flow.effective_to ?? '',
      steps: (flow.steps ?? []).map((s: any) => ({
        step_name: s.step_name ?? '',
        approver_type: s.approver_type,
        approver_user_id: s.approver_user_id ?? '',
        approver_role: s.approver_role ?? '',
        due_hours: s.due_hours != null ? String(s.due_hours) : '',
      })),
    })
    setFormOpen(true)
  }

  function patchStep(index: number, patch: Partial<Step>) {
    setForm(f => ({ ...f, steps: f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }))
  }

  function moveStep(index: number, delta: number) {
    const target = index + delta
    setForm(f => {
      if (target < 0 || target >= f.steps.length) return f
      const next = [...f.steps]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...f, steps: next }
    })
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/approvals/authority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        steps: form.steps.map(s => ({
          ...s,
          due_hours: s.due_hours === '' ? null : Number(s.due_hours),
        })),
      }),
    }).then(r => r.json()).catch(() => null)
    setSaving(false)
    if (!res?.ok) return alert(res?.error ?? '儲存失敗')
    setFormOpen(false)
    await load()
  }

  async function disable(flow: any) {
    if (!confirm(`確定停用權責規則「${flow.name}」？歷史簽核仍會保留。`)) return
    const res = await fetch(`/api/approvals/authority?id=${flow.id}`, { method: 'DELETE' })
      .then(r => r.json()).catch(() => null)
    if (!res?.ok) return alert(res?.error ?? '刪除失敗')
    await load()
  }

  const labelOf = (docType: string) => docTypes.find(d => d.value === docType)?.label ?? docType

  function conditionText(flow: any) {
    const parts: string[] = []
    if (flow.amount_gte != null || flow.amount_lt != null) {
      parts.push(`金額 ${flow.amount_gte != null ? money(flow.amount_gte) : '不限下限'} ～ ${flow.amount_lt != null ? money(flow.amount_lt) : '不限上限'}`)
    }
    if (flow.discount_gte != null || flow.discount_lt != null) {
      parts.push(`折讓 ${flow.discount_gte ?? '不限下限'}% ～ ${flow.discount_lt ?? '不限上限'}%`)
    }
    if (flow.requester_department) parts.push(`申請部門：${flow.requester_department}`)
    return parts.length ? parts.join('　·　') : '全部'
  }

  return <div className="p-4 md:p-6 max-w-5xl mx-auto">
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div>
        <div className="flex items-center gap-2">
          <ScrollText size={21} className="text-rose-600" />
          <h1 className="text-xl font-bold">核決權限與流程引擎</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">權責表直接決定表單、金額、折讓及逐級簽核路徑</p>
      </div>
      <button onClick={openNew}
        className="ml-auto flex items-center gap-1.5 bg-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
        <Plus size={16} />新增權責規則
      </button>
    </div>

    {error
      ? <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">{error}</div>
      : loading
      ? <div className="py-16 text-center text-gray-400">載入中…</div>
      : flows.length === 0
      ? <div className="py-16 text-center text-gray-400">尚未設定權責規則</div>
      : <div className="space-y-3">
          {flows.map(flow => <section key={flow.id}
            className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700">{labelOf(flow.doc_type)}</span>
              <h2 className="font-semibold text-gray-900">{flow.name}</h2>
              <span className="text-xs text-gray-400">第 {flow.version_no} 版 · 優先序 {flow.priority}</span>
              <span className={`text-xs px-2 py-0.5 rounded-lg ${
                flow.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {flow.is_active ? '啟用' : '停用'}
              </span>
              <div className="ml-auto flex shrink-0">
                <button onClick={() => openEdit(flow)} className="p-2 text-gray-400 hover:text-blue-600"><Pen size={15} /></button>
                <button onClick={() => disable(flow)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-2">{conditionText(flow)}</p>
            <p className="text-xs text-gray-400 mt-1">
              生效日 {flow.effective_from}
              {flow.effective_to ? ` ～ ${flow.effective_to}` : '（持續有效）'}
            </p>

            <div className="flex flex-wrap gap-2 mt-3">
              {(flow.steps ?? []).map((s: any) => <span key={s.id}
                className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                第 {s.step_order} 關 · {s.step_name} · {
                  s.approver_type === 'user'
                    ? people.find(p => p.id === s.approver_user_id)?.full_name ?? '指定人員'
                    : s.approver_type === 'role' ? `角色：${s.approver_role}` : '直屬主管'
                }{s.due_hours ? ` · ${s.due_hours} 小時` : ''}
              </span>)}
            </div>
          </section>)}
        </div>}

    {formOpen && <div onClick={() => setFormOpen(false)}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex">
          <h2 className="font-semibold">{form.id ? '編輯權責規則' : '新增權責規則'}</h2>
          <button onClick={() => setFormOpen(false)} className="ml-auto"><X size={18} /></button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="表單類別">
            <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} className="input">
              <option value="">請選擇</option>
              {docTypes.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="規則名稱">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="金額下限（含）">
            <input type="number" value={form.amount_gte}
              onChange={e => setForm({ ...form, amount_gte: e.target.value })} placeholder="留空＝不限下限" className="input" />
          </Field>
          <Field label="金額上限（不含）">
            <input type="number" value={form.amount_lt}
              onChange={e => setForm({ ...form, amount_lt: e.target.value })} placeholder="留空＝不限上限" className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="折讓下限">
            <input type="number" value={form.discount_gte}
              onChange={e => setForm({ ...form, discount_gte: e.target.value })} placeholder="留空＝不限下限" className="input" />
          </Field>
          <Field label="折讓上限">
            <input type="number" value={form.discount_lt}
              onChange={e => setForm({ ...form, discount_lt: e.target.value })} placeholder="留空＝不限上限" className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="申請部門">
            <input value={form.requester_department}
              onChange={e => setForm({ ...form, requester_department: e.target.value })} placeholder="留空＝全部" className="input" />
          </Field>
          <Field label="生效日">
            <input type="date" value={form.effective_from}
              onChange={e => setForm({ ...form, effective_from: e.target.value })} className="input" />
          </Field>
          <Field label="失效日（留空＝持續有效）">
            <input type="date" value={form.effective_to}
              onChange={e => setForm({ ...form, effective_to: e.target.value })} className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="優先序">
            <input type="number" value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value })} className="input" />
          </Field>
          <label className="flex items-end gap-2 text-sm pb-2">
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })} />啟用規則
          </label>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center mb-3">
            <h3 className="font-semibold text-sm">簽核關卡</h3>
            <button onClick={() => setForm(f => ({ ...f, steps: [...f.steps, { ...EMPTY_STEP }] }))}
              className="ml-auto text-sm text-rose-600">＋ 新增關卡</button>
          </div>

          <div className="space-y-3">
            {form.steps.map((step, i) => <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">第 {i + 1} 關</span>
                <div className="ml-auto flex">
                  <button onClick={() => moveStep(i, -1)} className="p-1.5 text-gray-400 hover:text-gray-700" title="上移"><ArrowUp size={14} /></button>
                  <button onClick={() => moveStep(i, 1)} className="p-1.5 text-gray-400 hover:text-gray-700" title="下移"><ArrowDown size={14} /></button>
                  <button onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, x) => x !== i) }))}
                    className="p-1.5 text-gray-400 hover:text-red-600" title="刪除關卡"><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="關名稱">
                  <input value={step.step_name} onChange={e => patchStep(i, { step_name: e.target.value })} className="input" />
                </Field>
                <Field label="簽核來源">
                  <select value={step.approver_type}
                    onChange={e => patchStep(i, { approver_type: e.target.value as Step['approver_type'] })} className="input">
                    <option value="direct_manager">直屬主管</option>
                    <option value="role">指定角色</option>
                    <option value="user">指定人員</option>
                  </select>
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {step.approver_type === 'user' && <Field label="人員">
                  <select value={step.approver_user_id}
                    onChange={e => patchStep(i, { approver_user_id: e.target.value })} className="input">
                    <option value="">請選擇</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `（${p.title}）` : ''}</option>)}
                  </select>
                </Field>}
                {step.approver_type === 'role' && <Field label="角色">
                  <input value={step.approver_role} onChange={e => patchStep(i, { approver_role: e.target.value })} className="input" />
                </Field>}
                <Field label="期限（小時）">
                  <input type="number" value={step.due_hours}
                    onChange={e => patchStep(i, { due_hours: e.target.value })} placeholder="留空＝不限" className="input" />
                </Field>
              </div>
            </div>)}
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="bg-rose-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? '儲存中…' : '儲存規則'}
          </button>
        </div>
      </div>
    </div>}

    <style jsx>{`
      .input {
        width: 100%;
        border: 1px solid #e5e7eb;
        border-radius: 0.75rem;
        padding: 0.625rem 0.75rem;
        font-size: 0.875rem;
        outline: none;
      }
      .input:focus { box-shadow: 0 0 0 2px #f43f5e; }
    `}</style>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block">
    <span className="block text-xs font-medium text-gray-600 mb-1.5">{label}</span>
    {children}
  </label>
}
