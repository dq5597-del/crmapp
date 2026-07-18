'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { MessageSquare, Trash2 } from 'lucide-react'

type Row = { id: string; name: string; preview: string; at: string | null; unread: boolean }

export default function MessagesWidget() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: roster } = await supabase.rpc('account_roster')
    const nameById: Record<string, string> = {}
    ;(roster ?? []).forEach((r: any) => { nameById[r.id] = r.full_name || r.id.slice(0, 6) })

    const { data: threads } = await supabase.from('chat_threads').select('*').order('updated_at', { ascending: false }).limit(8)
    const tids = (threads ?? []).map((t: any) => t.id)
    if (tids.length === 0) { setRows([]); return }

    const { data: mine } = await supabase.from('chat_members').select('thread_id, user_id, last_read_at').in('thread_id', tids)
    const membersByT: Record<string, string[]> = {}
    const lastReadByT: Record<string, string | null> = {}
    ;(mine ?? []).forEach((m: any) => {
      (membersByT[m.thread_id] ??= []).push(m.user_id)
      if (m.user_id === user.id) lastReadByT[m.thread_id] = m.last_read_at
    })

    const { data: msgs } = await supabase.from('chat_messages')
      .select('thread_id, sender_id, body, address, attachment_name, created_at')
      .in('thread_id', tids).order('created_at', { ascending: false })
    const lastByT: Record<string, any> = {}
    ;(msgs ?? []).forEach((m: any) => { if (!lastByT[m.thread_id]) lastByT[m.thread_id] = m })

    const out: Row[] = (threads ?? []).map((t: any) => {
      const last = lastByT[t.id]
      const others = (membersByT[t.id] ?? []).filter((u: string) => u !== user.id)
      const name = t.is_group ? (t.title || '群組') : (others.map((u: string) => nameById[u] || '?').join('、') || '對話')
      const lr = lastReadByT[t.id]
      const unread = !!last && last.sender_id !== user.id && (!lr || new Date(last.created_at) > new Date(lr))
      const preview = last ? (last.body || (last.attachment_name ? '📎 附件' : last.address ? '📍 地址' : '')) : '（尚無訊息）'
      return { id: t.id, name, preview, at: last?.created_at ?? null, unread }
    })
    setRows(out)
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 20000)
    return () => clearInterval(iv)
  }, [load])

  const unreadCount = rows.filter(r => r.unread).length

  const [deleting, setDeleting] = useState<string | null>(null)
  async function handleDelete(e: React.MouseEvent, r: Row) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`確定刪除與「${r.name}」的對話？對話內所有訊息將一併刪除，此動作無法復原。`)) return
    setDeleting(r.id)
    await supabase.from('chat_messages').delete().eq('thread_id', r.id)
    await supabase.from('chat_members').delete().eq('thread_id', r.id)
    const { error } = await supabase.from('chat_threads').delete().eq('id', r.id)
    setDeleting(null)
    if (error) { alert('刪除失敗：' + error.message); return }
    setRows(prev => prev.filter(x => x.id !== r.id))
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare size={17} className="text-blue-600" /> 訊息
          {unreadCount > 0 && <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">{unreadCount} 則未讀</span>}
        </h2>
        <Link href="/messages" className="text-sm text-blue-600 hover:underline">開啟訊息 →</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-3">
          尚無對話・<Link href="/messages" className="text-blue-600 hover:underline">去開始</Link>
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map(r => (
            <Link key={r.id} href={`/messages?t=${r.id}`}
              className="group flex items-center gap-2.5 py-2 border-t border-gray-50 text-sm hover:bg-gray-50 -mx-2 px-2 rounded">
              <span className={`w-2 h-2 rounded-full shrink-0 ${r.unread ? 'bg-red-500' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <span className={`font-medium ${r.unread ? 'text-gray-900' : 'text-gray-700'}`}>{r.name}</span>
                <span className="text-gray-400 ml-2">{r.preview}</span>
              </div>
              {r.at && (
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(r.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={e => handleDelete(e, r)}
                disabled={deleting === r.id}
                title="刪除此對話"
                className="shrink-0 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
