'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { MessageSquare, Plus, Send, Paperclip, X, Navigation, Users, Video } from 'lucide-react'

type RosterUser = { id: string; full_name: string | null; role: string }
type Thread = { id: string; title: string | null; is_group: boolean; created_by: string | null; updated_at: string }
type Msg = {
  id: string; thread_id: string; sender_id: string | null; body: string | null
  address: string | null; attachment_url: string | null; attachment_name: string | null
  attachment_type: string | null; created_at: string
}

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function MessagesPage() {
  const supabase = createClient()
  const [me, setMe] = useState<string>('')
  const [roster, setRoster] = useState<RosterUser[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [membersByThread, setMembersByThread] = useState<Record<string, string[]>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])

  const [body, setBody] = useState('')
  const [address, setAddress] = useState('')
  const [att, setAtt] = useState<{ url: string; name: string; type: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [newOpen, setNewOpen] = useState(false)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [groupTitle, setGroupTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const nameById = (id: string | null) => (id ? (roster.find(r => r.id === id)?.full_name || id.slice(0, 6)) : '系統')

  const loadThreads = useCallback(async () => {
    const { data: ts } = await supabase.from('chat_threads').select('*').order('updated_at', { ascending: false })
    setThreads((ts ?? []) as Thread[])
    const ids = (ts ?? []).map((t: any) => t.id)
    if (ids.length) {
      const { data: ms } = await supabase.from('chat_members').select('thread_id, user_id').in('thread_id', ids)
      const map: Record<string, string[]> = {}
      ;(ms ?? []).forEach((m: any) => { (map[m.thread_id] ??= []).push(m.user_id) })
      setMembersByThread(map)
    }
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setMe(user.id)
      const { data: r } = await supabase.rpc('account_roster')
      setRoster((r ?? []) as RosterUser[])
      await loadThreads()
    })()
  }, [loadThreads])

  const loadMsgs = useCallback(async (tid: string) => {
    const { data } = await supabase.from('chat_messages').select('*').eq('thread_id', tid).order('created_at', { ascending: true })
    setMsgs((data ?? []) as Msg[])
    await supabase.from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('thread_id', tid).eq('user_id', me)
  }, [me])

  useEffect(() => { if (activeId) loadMsgs(activeId) }, [activeId, loadMsgs])

  function threadName(t: Thread): string {
    if (t.is_group) return t.title || '群組'
    const others = (membersByThread[t.id] ?? []).filter(u => u !== me)
    return others.map(u => nameById(u)).join('、') || '（無成員）'
  }

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const path = `${activeId ?? 'tmp'}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('chat-files').upload(path, file, { upsert: false })
      if (error) { alert('上傳失敗：' + error.message); return }
      const { data } = supabase.storage.from('chat-files').getPublicUrl(path)
      setAtt({ url: data.publicUrl, name: file.name, type: file.type })
    } finally { setUploading(false) }
  }

  async function send() {
    if (!activeId) return
    if (!body.trim() && !address.trim() && !att) return
    setSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      thread_id: activeId, sender_id: me,
      body: body.trim() || null, address: address.trim() || null,
      attachment_url: att?.url ?? null, attachment_name: att?.name ?? null, attachment_type: att?.type ?? null,
    })
    setSending(false)
    if (error) { alert('送出失敗：' + error.message); return }
    setBody(''); setAddress(''); setAtt(null)
    loadMsgs(activeId); loadThreads()
  }

  // 發起 Jitsi 視訊/語音通話：產生房間、把連結貼進對話、自己先開視窗
  async function startCall() {
    if (!activeId) return
    const room = 'avcrm-' + Math.random().toString(36).slice(2, 10)
    const url = 'https://meet.jit.si/' + room
    await supabase.from('chat_messages').insert({
      thread_id: activeId, sender_id: me,
      body: '📹 發起視訊通話，點連結加入：\n' + url,
    })
    window.open(url, '_blank')
    loadMsgs(activeId); loadThreads()
  }

  function linkify(text: string) {
    return text.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
      /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline break-all font-medium">{p.includes('meet.jit.si') ? '📹 加入通話' : p}</a>
        : <span key={i}>{p}</span>
    )
  }

  async function createThread() {
    const members = Array.from(pick)
    if (members.length === 0) { alert('請至少選一位收件人'); return }
    setCreating(true)
    const isGroup = members.length > 1
    const { data: t, error } = await supabase.from('chat_threads')
      .insert({ title: isGroup ? (groupTitle.trim() || '群組') : null, is_group: isGroup, created_by: me })
      .select('id').single()
    if (error || !t) { setCreating(false); alert('建立失敗：' + (error?.message ?? '')); return }
    const rows = Array.from(new Set([...members, me])).map(uid => ({ thread_id: t.id, user_id: uid }))
    await supabase.from('chat_members').insert(rows)
    setCreating(false)
    setNewOpen(false); setPick(new Set()); setGroupTitle('')
    await loadThreads()
    setActiveId(t.id)
  }

  const active = threads.find(t => t.id === activeId) || null

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <MessageSquare className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-900">訊息</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[70vh]">
        {/* 對話清單 */}
        <div className="bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">對話</span>
            <button onClick={() => setNewOpen(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <Plus size={15} /> 新對話
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">尚無對話</p>
            ) : threads.map(t => (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${activeId === t.id ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                  {t.is_group && <Users size={13} className="text-gray-400" />}
                  {threadName(t)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 對話內容 */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">選一個對話，或按「新對話」</div>
          ) : (
            <>
              <div className="p-3 border-b flex items-center justify-between">
                <span className="font-semibold text-gray-800 text-sm">{threadName(active)}</span>
                <button onClick={startCall} title="發起視訊／語音通話"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg">
                  <Video size={15} /> 通話
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgs.map(m => {
                  const mine = m.sender_id === me
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                        {!mine && <div className="text-xs text-gray-500 mb-0.5">{nameById(m.sender_id)}</div>}
                        {m.body && <div className="whitespace-pre-wrap">{linkify(m.body)}</div>}
                        {m.address && (
                          <a href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(m.address)}
                            target="_blank" rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 mt-1 text-xs underline ${mine ? 'text-blue-100' : 'text-blue-600'}`}>
                            <Navigation size={12} /> {m.address}
                          </a>
                        )}
                        {m.attachment_url && (
                          m.attachment_type?.startsWith('image/') ? (
                            <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
                              <img src={m.attachment_url} alt={m.attachment_name ?? ''} className="max-h-48 rounded-lg" />
                            </a>
                          ) : (
                            <a href={m.attachment_url} target="_blank" rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 mt-1 text-xs underline ${mine ? 'text-blue-100' : 'text-blue-600'}`}>
                              <Paperclip size={12} /> {m.attachment_name ?? '附件'}
                            </a>
                          )
                        )}
                        <div className={`text-[10px] mt-1 ${mine ? 'text-blue-200' : 'text-gray-400'}`}>
                          {new Date(m.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 寫訊息 */}
              <div className="border-t p-3 space-y-2">
                {att && (
                  <div className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2 py-1.5">
                    <Paperclip size={13} /> <span className="flex-1 truncate">{att.name}</span>
                    <button onClick={() => setAtt(null)} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
                  </div>
                )}
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="地址（選填，會附導航連結）" className={inp} />
                <div className="flex items-end gap-2">
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="輸入訊息…" className={inp + ' resize-none flex-1'} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} title="附加照片／檔案"
                    className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0">
                    <Paperclip size={16} />
                  </button>
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
                  <button onClick={send} disabled={sending || uploading}
                    className="p-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shrink-0">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 新對話 */}
      {newOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold">新對話</h3>
              <button onClick={() => setNewOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">選擇收件人（勾多人＝群組）</label>
                <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-50">
                  {roster.filter(u => u.id !== me).map(u => (
                    <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={pick.has(u.id)}
                        onChange={e => setPick(prev => { const n = new Set(prev); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n })}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-gray-700">{u.full_name || u.id.slice(0, 6)}</span>
                    </label>
                  ))}
                </div>
              </div>
              {pick.size > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">群組名稱</label>
                  <input value={groupTitle} onChange={e => setGroupTitle(e.target.value)} placeholder="例：台東延平案專案群" className={inp} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setNewOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={createThread} disabled={creating} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">{creating ? '建立中…' : '建立'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
