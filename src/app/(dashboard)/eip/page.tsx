'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { BookText, Plus, Search, Pin, Pen, Trash2, FileText, X, CircleCheck } from 'lucide-react'

/**
 * 公告制度專區（EIP）
 * 公司公告、管理制度、工作規則與 SOP 的唯一正式來源。
 * 文件改版時 version_no 會遞增，閱讀回條綁定版本，改版後需重新確認閱讀。
 */

const CATEGORIES = ['公司公告', '人事公告', '管理制度', '作業規章', 'SOP／教材', '表單文件', '其他']

type FormState = {
  title: string
  category: string
  summary: string
  content: string
  attachment_url: string
  status: string
  effective_date: string
  expires_at: string
  is_pinned: boolean
  requires_ack: boolean
  audience_type: string
  audience_value: string
}

const EMPTY_FORM: FormState = {
  title: '', category: '公司公告', summary: '', content: '', attachment_url: '',
  status: 'draft', effective_date: '', expires_at: '',
  is_pinned: false, requires_ack: false, audience_type: 'all', audience_value: '',
}

export default function EipCenter() {
  const supabase = useMemo(() => createClient(), [])
  const { isAdmin, role, permOf } = usePermissions()
  const perm = permOf('eip')
  // 能維護制度文件的人：管理員、主管、HR。一般同仁只讀取與確認閱讀。
  const canManage = isAdmin || ['manager', 'hr'].includes(role)

  const [docs, setDocs] = useState<any[]>([])
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const [readCounts, setReadCounts] = useState<Record<string, number>>({})
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('全部')
  const [viewing, setViewing] = useState<any>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [docsRes, receiptRes] = await Promise.all([
      supabase.from('eip_documents').select('*')
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false }),
      supabase.from('eip_read_receipts').select('document_id, version_no').eq('user_id', user.id),
    ])

    if (docsRes.error) {
      setError('EIP 尚未完成資料庫初始化，請先執行最新 Supabase migration。')
      setLoading(false)
      return
    }

    setDocs(docsRes.data ?? [])
    setAcked(new Set((receiptRes.data ?? []).map((r: any) => `${r.document_id}:${r.version_no}`)))

    // 管理者才需要已讀人數統計，一般同仁不必多打一次 query。
    if (canManage) {
      const { data } = await supabase.from('eip_read_receipts').select('document_id')
      const counts: Record<string, number> = {}
      for (const row of data ?? []) counts[row.document_id] = (counts[row.document_id] ?? 0) + 1
      setReadCounts(counts)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [canManage])

  const filtered = docs.filter(d =>
    (category === '全部' || d.category === category) &&
    `${d.title} ${d.summary ?? ''} ${d.content ?? ''}`.toLowerCase()
      .includes(keyword.trim().toLowerCase())
  )

  async function save() {
    if (!form.title.trim()) return alert('請輸入標題')
    if (form.audience_type !== 'all' && !form.audience_value.trim()) {
      return alert('請填寫適用角色或部門')
    }
    setSaving(true)
    const payload: Record<string, any> = {
      title: form.title.trim(),
      category: form.category,
      summary: form.summary.trim() || null,
      content: form.content.trim() || null,
      attachment_url: form.attachment_url.trim() || null,
      status: form.status,
      effective_date: form.effective_date || null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_pinned: !!form.is_pinned,
      requires_ack: !!form.requires_ack,
      audience_type: form.audience_type,
      audience_value: form.audience_type === 'all' ? null : form.audience_value.trim(),
      ...(editingId ? {} : { created_by: userId }),
    }
    const res = editingId
      ? await supabase.from('eip_documents').update(payload).eq('id', editingId)
      : await supabase.from('eip_documents').insert(payload)
    setSaving(false)
    if (res.error) return alert('儲存失敗：' + res.error.message)
    setFormOpen(false)
    await load()
  }

  async function acknowledge(doc: any) {
    const { error } = await supabase.from('eip_read_receipts').upsert({
      document_id: doc.id,
      user_id: userId,
      version_no: doc.version_no,
      acknowledged_at: new Date().toISOString(),
    }, { onConflict: 'document_id,user_id,version_no' })
    if (error) return alert('確認失敗：' + error.message)
    setAcked(prev => new Set(prev).add(`${doc.id}:${doc.version_no}`))
  }

  async function remove(doc: any) {
    if (!confirm(`確定刪除「${doc.title}」？歷史版本與已讀紀錄也會一併刪除。`)) return
    const { error } = await supabase.from('eip_documents').delete().eq('id', doc.id)
    if (error) return alert('刪除失敗：' + error.message)
    if (viewing?.id === doc.id) setViewing(null)
    await load()
  }

  function openEdit(doc: any) {
    setEditingId(doc.id)
    setForm({
      title: doc.title,
      category: doc.category,
      summary: doc.summary ?? '',
      content: doc.content ?? '',
      attachment_url: doc.attachment_url ?? '',
      status: doc.status,
      effective_date: doc.effective_date ?? '',
      expires_at: doc.expires_at?.slice(0, 16) ?? '',
      is_pinned: doc.is_pinned,
      requires_ack: doc.requires_ack,
      audience_type: doc.audience_type,
      audience_value: doc.audience_value ?? '',
    })
    setFormOpen(true)
  }

  return <div className="p-4 md:p-6 max-w-6xl mx-auto">
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div>
        <div className="flex items-center gap-2">
          <BookText size={21} className="text-blue-600" />
          <h1 className="text-xl font-bold">公告制度專區</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">公司公告、管理制度、工作規則與 SOP 的唯一正式來源</p>
      </div>
      {canManage && perm.can_create && <button
        onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true) }}
        className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium"
      ><Plus size={16} />新增文件</button>}
    </div>

    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-3 text-gray-400" />
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜尋公告、規章或內容…"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm"
        />
      </div>
      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
      >
        <option>全部</option>
        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
      </select>
    </div>

    {error
      ? <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">{error}</div>
      : loading
      ? <div className="py-16 text-center text-gray-400">載入中…</div>
      : filtered.length === 0
      ? <div className="py-16 text-center text-gray-400">目前沒有符合的公告或制度</div>
      : <div className="grid md:grid-cols-2 gap-3">
          {filtered.map(doc => {
            const isAcked = acked.has(`${doc.id}:${doc.version_no}`)
            return <article key={doc.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start gap-2">
                {doc.is_pinned && <Pin size={15} className="text-amber-500 mt-1 shrink-0" />}
                <button onClick={() => setViewing(doc)} className="text-left min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-gray-900">{doc.title}</h2>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">{doc.category}</span>
                    {canManage && <span className={`text-xs px-2 py-0.5 rounded-lg ${
                      doc.status === 'published' ? 'bg-green-100 text-green-700'
                      : doc.status === 'draft' ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-500'}`}>
                      {doc.status === 'published' ? '已發布' : doc.status === 'draft' ? '草稿' : '已下架'}
                    </span>}
                  </div>
                  {doc.summary && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{doc.summary}</p>}
                  <p className="text-xs text-gray-400 mt-3">
                    第 {doc.version_no} 版
                    {doc.effective_date ? ` · ${doc.effective_date} 生效` : ''}
                    {doc.requires_ack ? ` · ${isAcked ? '已確認閱讀' : '待確認閱讀'}` : ''}
                    {canManage && doc.requires_ack ? ` · ${readCounts[doc.id] ?? 0} 人已讀` : ''}
                  </p>
                </button>
                {canManage && <div className="flex shrink-0">
                  {perm.can_edit && <button onClick={() => openEdit(doc)}
                    className="p-2 text-gray-400 hover:text-blue-600"><Pen size={15} /></button>}
                  {(isAdmin || perm.can_delete) && <button onClick={() => remove(doc)}
                    className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
                </div>}
              </div>
            </article>
          })}
        </div>}

    {viewing && <div onClick={() => setViewing(null)}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-start gap-3">
          <FileText className="text-blue-600 shrink-0" size={20} />
          <div className="flex-1">
            <h2 className="text-lg font-bold">{viewing.title}</h2>
            <p className="text-xs text-gray-400 mt-1">{viewing.category} · 第 {viewing.version_no} 版</p>
          </div>
          <button onClick={() => setViewing(null)}><X size={18} /></button>
        </div>
        {viewing.summary && <p className="mt-4 bg-blue-50 text-blue-900 rounded-xl p-3 text-sm">{viewing.summary}</p>}
        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-700">{viewing.content || '無內文'}</div>
        {viewing.attachment_url && <a href={viewing.attachment_url} target="_blank" rel="noreferrer"
          className="inline-block mt-4 text-sm text-blue-600 hover:underline">開啟附件</a>}
        {viewing.requires_ack && viewing.status === 'published' && <div className="mt-6 border-t pt-4">
          {acked.has(`${viewing.id}:${viewing.version_no}`)
            ? <span className="flex items-center gap-2 text-sm text-green-700">
                <CircleCheck size={17} />你已確認閱讀本版本
              </span>
            : <button onClick={() => acknowledge(viewing)}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
                <CircleCheck size={17} />確認我已閱讀並了解
              </button>}
        </div>}
      </div>
    </div>}

    {formOpen && <div onClick={() => setFormOpen(false)}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex">
          <h2 className="font-semibold">{editingId ? '編輯文件' : '新增文件'}</h2>
          <button onClick={() => setFormOpen(false)} className="ml-auto"><X size={18} /></button>
        </div>

        <Field label="標題">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="分類">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="狀態">
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input">
              <option value="draft">草稿</option>
              <option value="published">發布</option>
              <option value="archived">下架</option>
            </select>
          </Field>
        </div>

        <Field label="摘要">
          <textarea rows={2} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} className="input" />
        </Field>
        <Field label="內容">
          <textarea rows={8} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="input" />
        </Field>
        <Field label="附件連結">
          <input value={form.attachment_url} onChange={e => setForm({ ...form, attachment_url: e.target.value })}
            placeholder="https://…" className="input" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="生效日">
            <input type="date" value={form.effective_date}
              onChange={e => setForm({ ...form, effective_date: e.target.value })} className="input" />
          </Field>
          <Field label="下架時間">
            <input type="datetime-local" value={form.expires_at}
              onChange={e => setForm({ ...form, expires_at: e.target.value })} className="input" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="公告對象">
            <select value={form.audience_type}
              onChange={e => setForm({ ...form, audience_type: e.target.value })} className="input">
              <option value="all">全體同仁</option>
              <option value="role">指定角色</option>
              <option value="department">指定部門</option>
            </select>
          </Field>
          {form.audience_type !== 'all' && <Field label={form.audience_type === 'role' ? '角色代碼' : '部門名稱'}>
            <input value={form.audience_value}
              onChange={e => setForm({ ...form, audience_value: e.target.value })} className="input" />
          </Field>}
        </div>

        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_pinned}
              onChange={e => setForm({ ...form, is_pinned: e.target.checked })} />置頂
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.requires_ack}
              onChange={e => setForm({ ...form, requires_ack: e.target.checked })} />要求閱讀確認
          </label>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
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
      .input:focus { box-shadow: 0 0 0 2px #3b82f6; }
    `}</style>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block">
    <span className="block text-xs font-medium text-gray-600 mb-1.5">{label}</span>
    {children}
  </label>
}
