'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Search, Trash2, Edit2, X, Save, Link as LinkIcon, Library } from 'lucide-react'

interface KBArticle {
  id: string
  title: string
  category: string | null
  content: string | null
  file_url: string | null
  created_at: string
  updated_at: string
}

const CATEGORY_OPTIONS = ['全部', '業務流程', '產品知識', '維修技術', '系統操作', '其他']

export default function KnowledgeBasePage() {
  const supabase = createClient()
  const [articles, setArticles] = useState<KBArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [editing, setEditing] = useState<KBArticle | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', category: '業務流程', content: '', file_url: '' })

  useEffect(() => { fetchArticles() }, [])

  async function fetchArticles() {
    setLoading(true)
    const { data, error } = await supabase.from('knowledge_base').select('*').order('updated_at', { ascending: false })
    if (error) {
      setErrorMsg('尚未啟用 SOP／教材庫功能：請先到 Supabase SQL Editor 執行 supabase/schema_knowledge_base.sql')
      setLoading(false)
      return
    }
    setArticles(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ title: '', category: '業務流程', content: '', file_url: '' })
    setShowForm(true)
  }

  function openEdit(a: KBArticle) {
    setEditing(a)
    setForm({ title: a.title, category: a.category ?? '業務流程', content: a.content ?? '', file_url: a.file_url ?? '' })
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) { alert('請輸入標題'); return }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      category: form.category,
      content: form.content || null,
      file_url: form.file_url || null,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('knowledge_base').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('knowledge_base').insert(payload)
    }
    setSaving(false)
    setShowForm(false)
    fetchArticles()
  }

  async function remove(id: string) {
    if (!confirm('確定刪除這篇文件？')) return
    await supabase.from('knowledge_base').delete().eq('id', id)
    fetchArticles()
  }

  const filtered = articles.filter(a => {
    if (categoryFilter !== '全部' && a.category !== categoryFilter) return false
    return a.title.toLowerCase().includes(search.toLowerCase()) || (a.content ?? '').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Library size={18} className="text-gray-600" />
            <h1 className="text-xl font-bold text-gray-900">SOP／教材庫</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 篇 · 供全體同仁共用的標準作業程序與教材</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition">
          <Plus size={16} />新增文件
        </button>
      </div>

      {errorMsg ? (
        <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-xl text-sm py-4 px-4">{errorMsg}</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜尋標題或內容..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_OPTIONS.map(c => (
                <button key={c} onClick={() => setCategoryFilter(c)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition ${categoryFilter === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">載入中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">尚無符合的文件</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(a => (
                <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{a.title}</h3>
                      {a.category && <span className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 inline-block mt-1">{a.category}</span>}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit2 size={15} /></button>
                      <button onClick={() => remove(a.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  {a.content && <p className="text-sm text-gray-500 line-clamp-3 whitespace-pre-wrap">{a.content}</p>}
                  {a.file_url && (
                    <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-2">
                      <LinkIcon size={12} />附件連結
                    </a>
                  )}
                  <p className="text-xs text-gray-400 mt-2">更新於 {new Date(a.updated_at).toLocaleDateString('zh-TW')}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 新增／編輯表單 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editing ? '編輯文件' : '新增文件'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">標題</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">分類</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORY_OPTIONS.filter(c => c !== '全部').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">內容</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={6}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">附件連結（選填）</label>
              <input value={form.file_url} onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))} placeholder="https://..."
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
                <Save size={15} />{saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
