'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import {
  FolderKanban, Plus, Search, Printer, FileDown, Edit2, Trash2, X, ChevronDown
} from 'lucide-react'

const STATUS_OPTIONS = ['規劃中', '進行中', '施工中', '完工', '暫停', '取消'] as const
const STATUS_COLORS: Record<string, string> = {
  '規劃中': 'bg-purple-100 text-purple-700',
  '進行中': 'bg-blue-100 text-blue-700',
  '施工中': 'bg-orange-100 text-orange-700',
  '完工':   'bg-green-100 text-green-700',
  '暫停':   'bg-yellow-100 text-yellow-700',
  '取消':   'bg-gray-100 text-gray-600',
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type ProjForm = {
  client_id: string; project_name: string; scene_name: string; user_type: string
  status: string; start_date: string; end_date: string; budget: string
  description: string; notes: string
  main_function: string; equipment_needs: string; audio_needs: string; video_needs: string
  interaction_needs: string; control_needs: string; other_needs: string; venue_specs: string
}
const EMPTY: ProjForm = {
  client_id: '', project_name: '', scene_name: '', user_type: '',
  status: '規劃中', start_date: '', end_date: '', budget: '', description: '', notes: '',
  main_function: '', equipment_needs: '', audio_needs: '', video_needs: '',
  interaction_needs: '', control_needs: '', other_needs: '', venue_specs: '',
}

export default function ProjectsFolderPage() {
  const supabase = createClient()

  const [projects, setProjects] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('全部')
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProjForm>(EMPTY)
  const [clientSearch, setClientSearch] = useState('')
  const [clientListOpen, setClientListOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfMenu, setPdfMenu] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [pRes, cRes] = await Promise.all([
      supabase.from('projects').select('*, clients(company_name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company_name').order('company_name'),
    ])
    setProjects(pRes.data ?? [])
    setClients(cRes.data ?? [])
    setLoading(false)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { 全部: projects.length }
    STATUS_OPTIONS.forEach(s => { c[s] = projects.filter(p => p.status === s).length })
    return c
  }, [projects])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return projects.filter(p => {
      if (statusFilter !== '全部' && p.status !== statusFilter) return false
      if (!kw) return true
      const name = (p.project_name ?? '').toLowerCase()
      const client = (p.clients?.company_name ?? '').toLowerCase()
      return name.includes(kw) || client.includes(kw)
    })
  }, [projects, statusFilter, search])

  const filteredClients = useMemo(() => {
    const kw = clientSearch.trim().toLowerCase()
    if (!kw) return clients.slice(0, 30)
    return clients.filter(c => (c.company_name ?? '').toLowerCase().includes(kw)).slice(0, 30)
  }, [clients, clientSearch])

  function openNew() {
    setEditingId(null); setForm(EMPTY); setClientSearch(''); setModalOpen(true)
  }
  function openEdit(p: any) {
    setEditingId(p.id)
    setForm({
      client_id: p.client_id ?? '', project_name: p.project_name ?? '', scene_name: p.scene_name ?? '',
      user_type: p.user_type ?? '', status: p.status ?? '規劃中',
      start_date: p.start_date ?? '', end_date: p.end_date ?? '',
      budget: p.budget != null ? String(p.budget) : '', description: p.description ?? '', notes: p.notes ?? '',
      main_function: p.main_function ?? '', equipment_needs: p.equipment_needs ?? '', audio_needs: p.audio_needs ?? '',
      video_needs: p.video_needs ?? '', interaction_needs: p.interaction_needs ?? '', control_needs: p.control_needs ?? '',
      other_needs: p.other_needs ?? '', venue_specs: p.venue_specs ?? '',
    })
    setClientSearch(p.clients?.company_name ?? '')
    setModalOpen(true)
  }

  async function save() {
    if (!form.client_id) { alert('請選擇客戶'); return }
    if (!form.project_name.trim()) { alert('請填專案名稱'); return }
    setSaving(true)
    const payload = {
      client_id: form.client_id,
      project_name: form.project_name.trim(),
      scene_name: form.scene_name || null,
      user_type: form.user_type || null,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget: form.budget ? Number(form.budget) : null,
      description: form.description || null,
      notes: form.notes || null,
      main_function: form.main_function || null,
      equipment_needs: form.equipment_needs || null,
      audio_needs: form.audio_needs || null,
      video_needs: form.video_needs || null,
      interaction_needs: form.interaction_needs || null,
      control_needs: form.control_needs || null,
      other_needs: form.other_needs || null,
      venue_specs: form.venue_specs || null,
    }
    const { error } = editingId
      ? await supabase.from('projects').update(payload).eq('id', editingId)
      : await supabase.from('projects').insert(payload)
    setSaving(false)
    if (error) { alert('儲存失敗：' + error.message); return }
    setModalOpen(false); fetchData()
  }

  async function remove(p: any) {
    if (!confirm(`確定刪除專案「${p.project_name}」？此動作無法復原。`)) return
    const { error } = await supabase.from('projects').delete().eq('id', p.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchData()
  }

  const pdfDocs = (id: string) => [
    { href: `/projects/${id}/print`, label: '📄 專案總覽' },
    { href: `/projects/${id}/print/survey`, label: '📋 場勘報告' },
    { href: `/projects/${id}/print/diagram`, label: '🗺️ 標示圖／工程圖' },
    { href: `/projects/${id}/print/acceptance`, label: '✅ 驗收單' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FolderKanban className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">專案資料夾</h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增專案
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['全部', ...STATUS_OPTIONS] as string[]).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s} <span className="opacity-70">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋案名或客戶名稱…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* List */}
      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">沒有符合的專案</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">案名</th>
                  <th className="px-4">客戶</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4">施工／完工</th>
                  <th className="px-4 text-right">預算</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 font-medium text-gray-900">
                      {p.project_name}
                      {p.scene_name && <span className="text-gray-400 font-normal"> · {p.scene_name}</span>}
                    </td>
                    <td className="px-4 text-gray-600">{p.clients?.company_name ?? '—'}</td>
                    <td className="px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    </td>
                    <td className="px-4 text-gray-600 whitespace-nowrap">
                      {p.start_date ? formatDate(p.start_date) : '—'}{p.end_date ? ` ~ ${formatDate(p.end_date)}` : ''}
                    </td>
                    <td className="px-4 text-right text-gray-700">{p.budget != null ? `NT$${Number(p.budget).toLocaleString()}` : '—'}</td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} title="編輯" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Edit2 size={15} /></button>
                        <button onClick={() => window.open(`/projects/${p.id}/print`, '_blank')} title="列印總覽" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={15} /></button>
                        <div className="relative">
                          <button onClick={() => setPdfMenu(pdfMenu === p.id ? null : p.id)} title="列印/分享 PDF" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 flex items-center"><FileDown size={15} /><ChevronDown size={12} /></button>
                          {pdfMenu === p.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setPdfMenu(null)} />
                              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                                {pdfDocs(p.id).map(d => (
                                  <button key={d.href} onClick={() => { setPdfMenu(null); window.open(d.href, '_blank') }}
                                    className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">{d.label}</button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <button onClick={() => remove(p)} title="刪除" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold">{editingId ? '編輯專案' : '新增專案'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {/* 客戶（可搜尋） */}
              <div className="relative">
                <label className="block text-xs text-gray-500 mb-1">客戶 *</label>
                <input
                  value={clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setForm(f => ({ ...f, client_id: '' })); setClientListOpen(true) }}
                  onFocusCapture={() => setClientListOpen(true)}
                  placeholder="輸入客戶名稱搜尋…"
                  className={inp}
                />
                {form.client_id && <span className="absolute right-3 top-8 text-green-600 text-xs">✓ 已選</span>}
                {clientListOpen && !form.client_id && (
                  <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                    {filteredClients.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">找不到客戶</div>
                    ) : filteredClients.map(c => (
                      <button key={c.id} onClick={() => { setForm(f => ({ ...f, client_id: c.id })); setClientSearch(c.company_name); setClientListOpen(false) }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50">{c.company_name}</button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">專案名稱 *</label>
                <input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className={inp} placeholder="例：台東延平鄉公所新建案" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">場景／地點</label><input value={form.scene_name} onChange={e => setForm(f => ({ ...f, scene_name: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">使用單位</label><input value={form.user_type} onChange={e => setForm(f => ({ ...f, user_type: e.target.value }))} className={inp} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">專案狀態</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">預算</label><input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} className={inp} /></div>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">施工日期</label><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">完工日期</label><input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inp} /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">專案描述</label><textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inp} /></div>

              <div className="pt-1 border-t border-gray-100" />
              <div className="text-xs font-semibold text-gray-500">需求分析</div>
              <div><label className="block text-xs text-gray-500 mb-1">主要功能定位</label><input value={form.main_function} onChange={e => setForm(f => ({ ...f, main_function: e.target.value }))} className={inp} placeholder="例：多媒體簡報、活動直播、教學互動" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">設備需求</label><textarea rows={2} value={form.equipment_needs} onChange={e => setForm(f => ({ ...f, equipment_needs: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">音響需求</label><textarea rows={2} value={form.audio_needs} onChange={e => setForm(f => ({ ...f, audio_needs: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">影像需求</label><textarea rows={2} value={form.video_needs} onChange={e => setForm(f => ({ ...f, video_needs: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">互動需求</label><textarea rows={2} value={form.interaction_needs} onChange={e => setForm(f => ({ ...f, interaction_needs: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">控制需求</label><textarea rows={2} value={form.control_needs} onChange={e => setForm(f => ({ ...f, control_needs: e.target.value }))} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">其他需求</label><textarea rows={2} value={form.other_needs} onChange={e => setForm(f => ({ ...f, other_needs: e.target.value }))} className={inp} /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">場地規格</label><textarea rows={2} value={form.venue_specs} onChange={e => setForm(f => ({ ...f, venue_specs: e.target.value }))} className={inp} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inp} /></div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">{saving ? '儲存中…' : (editingId ? '儲存' : '建立專案')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
