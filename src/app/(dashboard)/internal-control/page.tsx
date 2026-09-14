'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { ShieldCheck, Plus, Pen, Trash2, X, CircleCheck } from 'lucide-react'

/**
 * 管理循環／內部控制
 * 風險、控制措施、自行檢查與缺失改善的共同台帳。
 * 一筆控制項目可有多次檢查紀錄；檢查結果為「無效／部分有效」時填改善措施與期限，
 * 完成改善後蓋 closed_at，待改善計數才會減少。
 */

const CYCLES = [
  '管理循環', '人資循環', '銷售及收款循環', '採購及付款循環', '生產循環',
  '薪工循環', '融資循環', '固定資產循環', '投資循環',
]

const RESULTS = ['有效', '部分有效', '無效'] as const

type FormState = {
  code: string
  name: string
  cycle: string
  risk_description: string
  control_activity: string
  control_frequency: string
  evidence_required: string
  owner_id: string
  department: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  code: '', name: '', cycle: '管理循環', risk_description: '', control_activity: '',
  control_frequency: '每月', evidence_required: '', owner_id: '', department: '', is_active: true,
}

export default function InternalControl() {
  const supabase = useMemo(() => createClient(), [])
  const { isAdmin, permOf } = usePermissions()
  const perm = permOf('internal-control')

  const [items, setItems] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cycle, setCycle] = useState('全部')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [reviewing, setReviewing] = useState<any>(null)
  const [reviewForm, setReviewForm] = useState({
    review_date: new Date().toISOString().slice(0, 10),
    result: '有效' as typeof RESULTS[number],
    finding: '',
    evidence_url: '',
    corrective_action: '',
    due_date: '',
  })

  async function load() {
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const [itemRes, reviewRes, peopleRes] = await Promise.all([
      supabase.from('internal_control_items').select('*').order('code'),
      supabase.from('internal_control_reviews').select('*').order('review_date', { ascending: false }),
      supabase.from('user_profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])

    if (itemRes.error) {
      setError('內部控制尚未完成資料庫初始化，請先執行最新 Supabase migration。')
      setLoading(false)
      return
    }
    setItems(itemRes.data ?? [])
    setReviews(reviewRes.data ?? [])
    setPeople(peopleRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i => cycle === '全部' || i.cycle === cycle)
  // 待改善＝已填改善措施但尚未結案。
  const openFindings = items.filter(i => i.corrective_action && !i.closed_at).length
  const latestReview = (controlId: string) => reviews.find(r => r.control_id === controlId)
  const nameOf = (id: string | null) => people.find(p => p.id === id)?.full_name ?? '未指派'

  async function save() {
    if (!form.code.trim() || !form.name.trim() || !form.risk_description.trim() || !form.control_activity.trim()) {
      return alert('請填代碼、名稱、風險與控制措施')
    }
    setSaving(true)
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      cycle: form.cycle,
      risk_description: form.risk_description.trim(),
      control_activity: form.control_activity.trim(),
      control_frequency: form.control_frequency.trim() || null,
      evidence_required: form.evidence_required.trim() || null,
      owner_id: form.owner_id || null,
      department: form.department.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
      ...(editingId ? {} : { created_by: userId }),
    }
    const res = editingId
      ? await supabase.from('internal_control_items').update(payload).eq('id', editingId)
      : await supabase.from('internal_control_items').insert(payload)
    setSaving(false)
    if (res.error) return alert('儲存失敗：' + res.error.message)
    setFormOpen(false)
    await load()
  }

  async function submitReview() {
    if (!reviewing) return
    const { error: reviewErr } = await supabase.from('internal_control_reviews').insert({
      control_id: reviewing.id,
      review_date: reviewForm.review_date,
      result: reviewForm.result,
      finding: reviewForm.finding.trim() || null,
      evidence_url: reviewForm.evidence_url.trim() || null,
      reviewed_by: userId,
    })
    if (reviewErr) return alert('儲存失敗：' + reviewErr.message)

    // 檢查結果不是「有效」才需要開改善追蹤；結果為有效就把舊的改善項結掉。
    const needsFix = reviewForm.result !== '有效'
    const { error: itemErr } = await supabase.from('internal_control_items').update(
      needsFix
        ? {
            corrective_action: reviewForm.corrective_action.trim() || null,
            due_date: reviewForm.due_date || null,
            closed_at: null,
            updated_at: new Date().toISOString(),
          }
        : { closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ).eq('id', reviewing.id)
    if (itemErr) return alert('儲存失敗：' + itemErr.message)

    setReviewing(null)
    await load()
  }

  async function closeFinding(item: any) {
    const { error } = await supabase.from('internal_control_items')
      .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) return alert('儲存失敗：' + error.message)
    await load()
  }

  async function remove(item: any) {
    if (!confirm(`確定刪除控制項目「${item.code} ${item.name}」？`)) return
    const { error } = await supabase.from('internal_control_items').delete().eq('id', item.id)
    if (error) return alert('刪除失敗：' + error.message)
    await load()
  }

  function openEdit(item: any) {
    setEditingId(item.id)
    setForm({
      code: item.code,
      name: item.name,
      cycle: item.cycle,
      risk_description: item.risk_description ?? '',
      control_activity: item.control_activity ?? '',
      control_frequency: item.control_frequency ?? '',
      evidence_required: item.evidence_required ?? '',
      owner_id: item.owner_id ?? '',
      department: item.department ?? '',
      is_active: item.is_active,
    })
    setFormOpen(true)
  }

  function openReview(item: any) {
    setReviewing(item)
    setReviewForm({
      review_date: new Date().toISOString().slice(0, 10),
      result: '有效',
      finding: '',
      evidence_url: '',
      corrective_action: item.corrective_action ?? '',
      due_date: item.due_date ?? '',
    })
  }

  return <div className="p-4 md:p-6 max-w-6xl mx-auto">
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={21} className="text-emerald-600" />
          <h1 className="text-xl font-bold">管理循環／內部控制</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">風險、控制措施、自行檢查與缺失改善的共同台帳</p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="text-right">
          <div className="text-xs text-gray-400">待改善</div>
          <div className={`text-lg font-bold ${openFindings ? 'text-amber-600' : 'text-gray-900'}`}>
            {openFindings} <span className="text-xs font-normal text-gray-400">項</span>
          </div>
        </div>
        {perm.can_create && <button
          onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true) }}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} />新增控制項目
        </button>}
      </div>
    </div>

    <div className="flex flex-wrap gap-1.5 mb-4">
      {['全部', ...CYCLES].map(c => <button key={c} onClick={() => setCycle(c)}
        className={`text-xs px-3 py-1.5 rounded-lg border ${
          cycle === c ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
        }`}>{c}</button>)}
    </div>

    {error
      ? <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">{error}</div>
      : loading
      ? <div className="py-16 text-center text-gray-400">載入中…</div>
      : filtered.length === 0
      ? <div className="py-16 text-center text-gray-400">尚無內控項目</div>
      : <div className="space-y-3">
          {filtered.map(item => {
            const last = latestReview(item.id)
            const openFix = item.corrective_action && !item.closed_at
            return <section key={item.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700">{item.cycle}</span>
                <span className="font-mono text-xs text-gray-400">{item.code}</span>
                <h2 className="font-semibold text-gray-900">{item.name}</h2>
                {!item.is_active && <span className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500">停用</span>}
                <div className="ml-auto flex shrink-0">
                  {perm.can_create && <button onClick={() => openReview(item)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white">執行檢查</button>}
                  {perm.can_edit && <button onClick={() => openEdit(item)}
                    className="p-2 text-gray-400 hover:text-blue-600" title="編輯"><Pen size={15} /></button>}
                  {(isAdmin || perm.can_delete) && <button onClick={() => remove(item)}
                    className="p-2 text-gray-400 hover:text-red-600" title="刪除控制項目"><Trash2 size={15} /></button>}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
                <div><span className="text-gray-400 text-xs">風險　</span>{item.risk_description || '未填寫'}</div>
                <div><span className="text-gray-400 text-xs">控制措施　</span>{item.control_activity || '未填寫'}</div>
                <div><span className="text-gray-400 text-xs">執行頻率　</span>{item.control_frequency || '未設定頻率'}</div>
                <div><span className="text-gray-400 text-xs">必要佐證　</span>{item.evidence_required || '未填寫'}</div>
                <div><span className="text-gray-400 text-xs">改善負責人　</span>{nameOf(item.owner_id)}</div>
                <div><span className="text-gray-400 text-xs">責任部門　</span>{item.department || '全公司'}</div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t text-xs">
                <span className="text-gray-500">
                  最近檢查：{last ? `${last.review_date} · ${last.result}` : '尚未檢查'}
                </span>
                {last?.finding && <span className="text-amber-700">缺失：{last.finding}</span>}
                {last?.evidence_url && <a href={last.evidence_url} target="_blank" rel="noreferrer"
                  className="text-blue-600 hover:underline">佐證連結</a>}
                {openFix && <>
                  <span className="text-amber-700">
                    改善：{item.corrective_action}{item.due_date ? `（期限 ${item.due_date}）` : ''}
                  </span>
                  <button onClick={() => closeFinding(item)}
                    className="flex items-center gap-1 text-emerald-700 hover:underline">
                    <CircleCheck size={13} />標記改善完成
                  </button>
                </>}
              </div>
            </section>
          })}
        </div>}

    {formOpen && <div onClick={() => setFormOpen(false)}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex">
          <h2 className="font-semibold">{editingId ? '編輯控制項目' : '新增控制項目'}</h2>
          <button onClick={() => setFormOpen(false)} className="ml-auto"><X size={18} /></button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="控制代碼">
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="input" />
          </Field>
          <Field label="控制名稱">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" />
          </Field>
          <Field label="作業循環">
            <select value={form.cycle} onChange={e => setForm({ ...form, cycle: e.target.value })} className="input">
              {CYCLES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <Field label="風險說明">
          <textarea rows={2} value={form.risk_description}
            onChange={e => setForm({ ...form, risk_description: e.target.value })} className="input" />
        </Field>
        <Field label="控制措施">
          <textarea rows={3} value={form.control_activity}
            onChange={e => setForm({ ...form, control_activity: e.target.value })} className="input" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="執行頻率">
            <input value={form.control_frequency}
              onChange={e => setForm({ ...form, control_frequency: e.target.value })} placeholder="每月" className="input" />
          </Field>
          <Field label="必要佐證">
            <input value={form.evidence_required}
              onChange={e => setForm({ ...form, evidence_required: e.target.value })} className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="改善負責人">
            <select value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })} className="input">
              <option value="">請選擇</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>
          <Field label="責任部門">
            <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="全公司" className="input" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active}
            onChange={e => setForm({ ...form, is_active: e.target.checked })} />有效
        </label>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>}

    {reviewing && <div onClick={() => setReviewing(null)}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex">
          <h2 className="font-semibold">內控檢查 · {reviewing.code} {reviewing.name}</h2>
          <button onClick={() => setReviewing(null)} className="ml-auto"><X size={18} /></button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="檢查日期">
            <input type="date" value={reviewForm.review_date}
              onChange={e => setReviewForm({ ...reviewForm, review_date: e.target.value })} className="input" />
          </Field>
          <Field label="檢查結果">
            <select value={reviewForm.result}
              onChange={e => setReviewForm({ ...reviewForm, result: e.target.value as typeof RESULTS[number] })}
              className="input">
              {RESULTS.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>

        <Field label="發現缺失">
          <textarea rows={2} value={reviewForm.finding}
            onChange={e => setReviewForm({ ...reviewForm, finding: e.target.value })} className="input" />
        </Field>
        <Field label="佐證連結">
          <input value={reviewForm.evidence_url}
            onChange={e => setReviewForm({ ...reviewForm, evidence_url: e.target.value })}
            placeholder="https://…" className="input" />
        </Field>

        {reviewForm.result !== '有效' && <div className="grid sm:grid-cols-2 gap-3">
          <Field label="改善措施">
            <input value={reviewForm.corrective_action}
              onChange={e => setReviewForm({ ...reviewForm, corrective_action: e.target.value })} className="input" />
          </Field>
          <Field label="改善期限">
            <input type="date" value={reviewForm.due_date}
              onChange={e => setReviewForm({ ...reviewForm, due_date: e.target.value })} className="input" />
          </Field>
        </div>}

        <div className="flex justify-end">
          <button onClick={submitReview}
            className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium">完成檢查</button>
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
      .input:focus { box-shadow: 0 0 0 2px #10b981; }
    `}</style>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block">
    <span className="block text-xs font-medium text-gray-600 mb-1.5">{label}</span>
    {children}
  </label>
}
