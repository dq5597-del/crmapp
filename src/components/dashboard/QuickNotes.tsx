'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { StickyNote, Plus, Pin, Check, ArrowRight } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  pinned: boolean
  created_by_name: string | null
  updated_at: string
}

const RECENT_LIMIT = 5

export default function QuickNotes() {
  const supabase = createClient()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { fetchNotes() }, [])

  async function fetchNotes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, content, pinned, created_by_name, updated_at')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(RECENT_LIMIT)
    if (error) {
      setAvailable(false)
      setLoading(false)
      return
    }
    setAvailable(true)
    setNotes(data ?? [])
    setLoading(false)
  }

  async function addNote() {
    if (!draft.trim()) return
    setAdding(true)
    const firstLine = draft.trim().split('\n')[0].slice(0, 24)
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
      title: firstLine || '未命名筆記',
      content: draft.trim(),
      created_by: userRes?.user?.id ?? null,
      created_by_name: createdByName,
    })
    setDraft('')
    setAdding(false)
    fetchNotes()
  }

  function startEdit(n: Note) {
    setEditingId(n.id)
    setEditDraft(n.content)
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    await supabase.from('notes').update({ content: editDraft }).eq('id', id)
    setSavingEdit(false)
    setEditingId(null)
    fetchNotes()
  }

  if (!available && !loading) return null // 尚未執行 schema_notes.sql 時不顯示，避免造成困擾

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StickyNote size={16} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900">快速筆記</h2>
        </div>
        <Link href="/notes" className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600">
          查看全部 <ArrowRight size={12} />
        </Link>
      </div>

      {/* 快速新增 */}
      <div className="flex gap-2 mb-4">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote() }
          }}
          placeholder="輸入新筆記...（Ctrl/⌘+Enter 快速新增）"
          rows={2}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={addNote}
          disabled={adding || !draft.trim()}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40 min-h-[44px] sm:min-h-0"
        >
          <Plus size={15} />
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-3">載入中...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-3">尚無筆記，開始寫下第一則吧</p>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className="border border-gray-100 rounded-xl px-3.5 py-2.5">
              {editingId === n.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 px-2 py-1">取消</button>
                    <button
                      onClick={() => saveEdit(n.id)}
                      disabled={savingEdit}
                      className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      <Check size={12} />儲存
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => startEdit(n)} className="w-full text-left">
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <Pin size={11} className="text-amber-500 shrink-0" />}
                    <span className="text-sm font-medium text-gray-900 truncate">{n.title}</span>
                  </div>
                  {n.content && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {n.created_by_name ? `${n.created_by_name} · ` : ''}點一下可編輯
                  </p>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
