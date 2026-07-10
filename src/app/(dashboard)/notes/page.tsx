'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Search, Trash2, Edit2, X, Save, Share2, Copy, Check, Pin, StickyNote } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  pinned: boolean
  is_public: boolean
  share_token: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export default function NotesPage() {
  const supabase = createClient()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Note | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { fetchNotes() }, [])

  async function fetchNotes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) {
      setErrorMsg('尚未啟用筆記功能：請先到 Supabase SQL Editor 執行 supabase/schema_notes.sql')
      setLoading(false)
      return
    }
    setErrorMsg(null)
    setNotes(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ title: '', content: '' })
    setShowForm(true)
  }

  function openEdit(n: Note) {
    setEditing(n)
    setForm({ title: n.title, content: n.content })
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim() && !form.content.trim()) { alert('請輸入標題或內容'); return }
    setSaving(true)
    if (editing) {
      await supabase.from('notes').update({
        title: form.title.trim() || '未命名筆記',
        content: form.content,
      }).eq('id', editing.id)
    } else {
      const { data: userRes } = await supabase.auth.getUser()
      let createdByName: string | null = null
      if (userRes?.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', userRes.user.id)
          .single()
        createdByName = profile?.full_name ?? userRes.user.email ?? null
      }
      await supabase.from('notes').insert({
        title: form.title.trim() || '未命名筆記',
        content: form.content,
        created_by: userRes?.user?.id ?? null,
        created_by_name: createdByName,
      })
    }
    setSaving(false)
    setShowForm(false)
    fetchNotes()
  }

  async function remove(id: string) {
    if (!confirm('確定刪除這則筆記？')) return
    await supabase.from('notes').delete().eq('id', id)
    fetchNotes()
  }

  async function togglePin(n: Note) {
    await supabase.from('notes').update({ pinned: !n.pinned }).eq('id', n.id)
    fetchNotes()
  }

  async function toggleShare(n: Note) {
    const nextPublic = !n.is_public
    await supabase.from('notes').update({ is_public: nextPublic }).eq('id', n.id)
    fetchNotes()
    if (nextPublic) {
      await copyShareLink({ ...n, is_public: true })
    }
  }

  async function copyShareLink(n: Note) {
    if (!n.share_token) return
    const url = `${window.location.origin}/n/${n.share_token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(n.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      alert(`分享連結：${url}`)
    }
  }

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <StickyNote size={18} className="text-gray-600" />
            <h1 className="text-xl font-bold text-gray-900">業務筆記</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 則 · 團隊共用筆記本，可分享連結給外部人員</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition min-h-[44px]">
          <Plus size={16} />新增筆記
        </button>
      </div>

      {errorMsg ? (
        <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-xl text-sm py-4 px-4">{errorMsg}</p>
      ) : (
        <>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜尋標題或內容..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">載入中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">尚無符合的筆記</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(n => (
                <div key={n.id} className={`bg-white border rounded-2xl p-4 hover:shadow-md transition-all ${n.pinned ? 'border-amber-300' : 'border-gray-100 hover:border-blue-300'}`}>
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {n.pinned && <Pin size={13} className="text-amber-500 shrink-0" />}
                        <h3 className="font-semibold text-gray-900 truncate">{n.title}</h3>
                      </div>
                      {n.created_by_name && (
                        <span className="text-xs text-gray-400 mt-0.5 inline-block">{n.created_by_name}</span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => togglePin(n)} title={n.pinned ? '取消釘選' : '釘選'} className={`p-1.5 rounded-lg hover:bg-amber-50 ${n.pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}><Pin size={15} /></button>
                      <button onClick={() => openEdit(n)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit2 size={15} /></button>
                      <button onClick={() => remove(n.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  {n.content && <p className="text-sm text-gray-500 line-clamp-4 whitespace-pre-wrap">{n.content}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">更新於 {new Date(n.updated_at).toLocaleDateString('zh-TW')}</p>
                    {n.is_public ? (
                      <button onClick={() => copyShareLink(n)} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                        {copiedId === n.id ? <><Check size={12} />已複製連結</> : <><Share2 size={12} />已分享，複製連結</>}
                      </button>
                    ) : (
                      <button onClick={() => toggleShare(n)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 font-medium">
                        <Share2 size={12} />產生分享連結
                      </button>
                    )}
                  </div>
                  {n.is_public && (
                    <button onClick={() => toggleShare(n)} className="text-xs text-gray-300 hover:text-red-500 mt-1.5">取消分享</button>
                  )}
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
              <h2 className="font-semibold text-gray-900">{editing ? '編輯筆記' : '新增筆記'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">標題</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="筆記標題"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">內容</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={8}
                placeholder="輸入筆記內容..."
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 min-h-[44px]">
                <Save size={15} />{saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
