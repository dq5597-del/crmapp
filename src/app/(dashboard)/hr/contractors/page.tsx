'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { HardHat, Plus, Search, Edit2, Trash2, X, Eye, EyeOff } from 'lucide-react'

const KINDS = ['協力廠商', '臨時工'] as const
const KIND_COLORS: Record<string, string> = {
  '協力廠商': 'bg-purple-100 text-purple-700',
  '臨時工': 'bg-orange-100 text-orange-700',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const EMPTY: any = {
  kind: '臨時工', name: '', company_name: '', tax_id: '',
  contact_name: '', phone: '', email: '', address: '',
  skill: '', day_rate: '', id_number: '', bank_name: '', bank_account: '',
  is_active: true, notes: '',
}

export default function HrContractorsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [kindFilter, setKindFilter] = useState('全部')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showSensitive, setShowSensitive] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase.from('hr_contractors').select('*').order('created_at', { ascending: false })
    if (error) { console.error(error); setDenied(true) }
    setRows(data ?? [])
    setLoading(false)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { 全部: rows.length }
    KINDS.forEach(k => { c[k] = rows.filter(r => r.kind === k).length })
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return rows.filter(r => {
      if (kindFilter !== '全部' && r.kind !== kindFilter) return false
      if (!kw) return true
      return [r.name, r.company_name, r.skill, r.contact_name, r.phone]
        .some(v => (v ?? '').toLowerCase().includes(kw))
    })
  }, [rows, kindFilter, search])

  function openNew() { setEditingId(null); setForm(EMPTY); setModalOpen(true) }
  function openEdit(r: any) {
    setEditingId(r.id)
    setForm({ ...EMPTY, ...r, day_rate: r.day_rate != null ? String(r.day_rate) : '' })
    setModalOpen(true)
  }

  async function save() {
    if (!form.name?.trim()) { alert('請填名稱'); return }
    setSaving(true)
    const payload: any = { ...form }
    delete payload.id; delete payload.created_at; delete payload.updated_at
    payload.name = payload.name.trim()
    payload.day_rate = payload.day_rate ? Number(payload.day_rate) : null
    for (const k of Object.keys(payload)) if (payload[k] === '') payload[k] = null
    payload.is_active = !!form.is_active

    const { error } = editingId
      ? await supabase.from('hr_contractors').update(payload).eq('id', editingId)
      : await supabase.from('hr_contractors').insert(payload)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setModalOpen(false); fetchData()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除「${r.name}」？此動作無法復原。`)) return
    const { error } = await supabase.from('hr_contractors').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取資料。可能原因：<br />
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
          <HardHat className="text-orange-500" size={22} />
          <h1 className="text-xl font-bold text-gray-900">協力廠商 / 臨時工</h1>
          <span className="text-sm text-gray-400">共 {rows.length} 筆</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSensitive(v => !v)}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm text-gray-600">
            {showSensitive ? <EyeOff size={15} /> : <Eye size={15} />} {showSensitive ? '隱藏敏感資料' : '顯示敏感資料'}
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['全部', ...KINDS] as string[]).map(k => (
          <button key={k} onClick={() => setKindFilter(k)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${kindFilter === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {k} <span className="opacity-70">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋名稱、公司、工種、聯絡人、電話…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">沒有符合的資料</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">類別</th>
                  <th className="px-4">名稱</th>
                  <th className="px-4">公司 / 統編</th>
                  <th className="px-4">工種 / 專長</th>
                  <th className="px-4">聯絡人 / 電話</th>
                  <th className="px-4 text-right">日薪</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${KIND_COLORS[r.kind] ?? 'bg-gray-100 text-gray-600'}`}>{r.kind}</span>
                    </td>
                    <td className="px-4 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 text-gray-600">{[r.company_name, r.tax_id].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 text-gray-600">{r.skill ?? '—'}</td>
                    <td className="px-4 text-gray-600">{[r.contact_name, r.phone].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 text-right text-gray-700">
                      {r.day_rate != null ? (showSensitive ? `NT$${Number(r.day_rate).toLocaleString()}` : '••••') : '—'}
                    </td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {r.is_active ? '合作中' : '已停用'}
                      </span>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} title="編輯" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Edit2 size={15} /></button>
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
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold">{editingId ? '編輯' : '新增協力廠商 / 臨時工'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <F label="類別 *">
                  <select value={form.kind ?? '臨時工'} onChange={e => setForm({ ...form, kind: e.target.value })} className={inp}>
                    {KINDS.map(k => <option key={k}>{k}</option>)}
                  </select>
                </F>
                <F label="名稱 *"><input value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="個人姓名或公司名" /></F>
                <F label="工種 / 專長"><input value={form.skill ?? ''} onChange={e => setForm({ ...form, skill: e.target.value })} className={inp} placeholder="音響安裝、木工…" /></F>
                <F label="公司名稱"><input value={form.company_name ?? ''} onChange={e => setForm({ ...form, company_name: e.target.value })} className={inp} /></F>
                <F label="統一編號"><input value={form.tax_id ?? ''} onChange={e => setForm({ ...form, tax_id: e.target.value })} className={inp} /></F>
                <F label="日薪 / 工資"><input type="number" value={form.day_rate ?? ''} onChange={e => setForm({ ...form, day_rate: e.target.value })} className={inp} /></F>
                <F label="聯絡人"><input value={form.contact_name ?? ''} onChange={e => setForm({ ...form, contact_name: e.target.value })} className={inp} /></F>
                <F label="電話"><input value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} className={inp} /></F>
                <F label="Email"><input value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} className={inp} /></F>
                <div className="sm:col-span-3">
                  <F label="地址"><input value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} className={inp} /></F>
                </div>
              </div>

              <section>
                <div className="text-xs font-semibold text-amber-600 mb-2">報稅 / 匯款（敏感資料）</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <F label="身分證字號"><input value={form.id_number ?? ''} onChange={e => setForm({ ...form, id_number: e.target.value.toUpperCase() })} className={inp} /></F>
                  <F label="銀行名稱"><input value={form.bank_name ?? ''} onChange={e => setForm({ ...form, bank_name: e.target.value })} className={inp} /></F>
                  <F label="銀行帳戶"><input value={form.bank_account ?? ''} onChange={e => setForm({ ...form, bank_account: e.target.value })} className={inp} /></F>
                </div>
              </section>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                合作中（取消勾選＝停用）
              </label>

              <F label="備註"><textarea rows={2} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} /></F>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">
                {saving ? '儲存中…' : (editingId ? '儲存' : '建立')}
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
