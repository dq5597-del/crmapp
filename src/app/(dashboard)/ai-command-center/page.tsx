'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { AGENT_PROFILES, MOCK_AI_WORK_ITEMS } from '@/lib/mock/ai-command-center-data'
import type { AIWorkItem, AIWorkStatus, RoleType } from '@/types/ai-command-center'

const ROLE_ORDER: RoleType[] = ['gemini', 'hermes', 'claude', 'xiaoji', 'codex']
const STATUS_ORDER: AIWorkStatus[] = ['backlog', 'in_progress', 'waiting_user', 'review', 'done', 'blocked']

const STATUS_LABEL: Record<AIWorkStatus, string> = {
  backlog: '待安排',
  in_progress: '進行中',
  waiting_user: '等待資料',
  review: '待驗收',
  done: '已完成',
  blocked: '卡關',
}

const STATUS_STYLE: Record<AIWorkStatus, string> = {
  backlog: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting_user: 'bg-amber-100 text-amber-800',
  review: 'bg-violet-100 text-violet-700',
  done: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-red-100 text-red-700',
}

const PRIORITY_LABEL = { low: '低', medium: '中', high: '高', urgent: '緊急' } as const

type QueryError = { code?: string; message?: string }

function isMissingTable(error: QueryError) {
  const message = error.message?.toLowerCase() ?? ''
  return ['42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
    || message.includes('ai_work_items') && (message.includes('not find') || message.includes('does not exist'))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export default function AICommandCenterPage() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<AIWorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | AIWorkStatus>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | RoleType>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    const { data, error } = await supabase
      .from('ai_work_items')
      .select('id,title,owner,status,progress,priority,blocker,user_input_needed,next_action,updated_at')
      .order('updated_at', { ascending: false })

    if (error) {
      if (isMissingTable(error)) {
        setItems(MOCK_AI_WORK_ITEMS)
        setPreview(true)
      } else {
        setItems([])
        setPreview(false)
        setErrorMessage(`無法讀取戰情室資料：${error.message}`)
      }
    } else {
      setItems((data ?? []) as AIWorkItem[])
      setPreview(false)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadItems() }, [loadItems])

  async function updateItem(id: string, changes: Partial<Pick<AIWorkItem, 'status' | 'progress'>>) {
    if (preview) return
    setSavingId(id)
    setErrorMessage(null)
    const { error } = await supabase.from('ai_work_items').update(changes).eq('id', id)
    if (error) setErrorMessage(`更新失敗：${error.message}`)
    else setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item))
    setSavingId(null)
  }

  const summary = useMemo(() => ({
    total: items.length,
    active: items.filter(item => item.status === 'in_progress' || item.status === 'review').length,
    waiting: items.filter(item => item.status === 'waiting_user').length,
    blocked: items.filter(item => item.status === 'blocked' || item.blocker).length,
    done: items.filter(item => item.status === 'done').length,
  }), [items])

  const filteredItems = useMemo(() => items.filter(item =>
    (statusFilter === 'all' || item.status === statusFilter)
    && (ownerFilter === 'all' || item.owner === ownerFilter)
  ), [items, ownerFilter, statusFilter])

  const waitingForUser = items.filter(item => item.user_input_needed)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
            <ShieldCheck size={17} /> 管理員專屬
          </div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">AI 團隊戰情室</h1>
          <p className="mt-2 text-sm text-slate-600">掌握五位 AI 成員的分工、進度、卡點與下一步。</p>
        </div>
        <button
          type="button"
          onClick={() => void loadItems()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 重新整理
        </button>
      </header>

      {preview && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Database className="mt-0.5 shrink-0" size={19} />
          <div><strong>目前顯示預覽資料。</strong> Supabase 尚未建立或公開 ai_work_items 資料表；套用 migration 後會自動改讀正式資料。</div>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} /><span>{errorMessage}</span>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: '全部工作', value: summary.total, icon: UsersRound, tone: 'text-slate-700 bg-slate-100' },
          { label: '執行／驗收', value: summary.active, icon: Clock3, tone: 'text-blue-700 bg-blue-100' },
          { label: '等待您提供', value: summary.waiting, icon: AlertTriangle, tone: 'text-amber-700 bg-amber-100' },
          { label: '有卡點', value: summary.blocked, icon: AlertTriangle, tone: 'text-red-700 bg-red-100' },
          { label: '已完成', value: summary.done, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-100' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-3 inline-flex rounded-lg p-2 ${card.tone}`}><card.icon size={18} /></div>
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
            <div className="text-xs text-slate-500">{card.label}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">團隊分工</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {ROLE_ORDER.map(role => {
            const profile = AGENT_PROFILES[role]
            const owned = items.filter(item => item.owner === role)
            const active = owned.filter(item => item.status !== 'done').length
            const progress = owned.length ? Math.round(owned.reduce((sum, item) => sum + item.progress, 0) / owned.length) : 0
            return (
              <article key={role} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><Bot size={20} /></div>
                  <span className="text-xs font-medium text-slate-500">{active} 件未完成</span>
                </div>
                <h3 className="font-semibold text-slate-900">{profile.displayName}</h3>
                <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{profile.responsibility}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${progress}%` }} /></div>
                <div className="mt-1 text-right text-xs text-slate-400">平均 {progress}%</div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">工作清單</h2>
            <div className="grid grid-cols-2 gap-2">
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | AIWorkStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="all">全部狀態</option>
                {STATUS_ORDER.map(status => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
              </select>
              <select value={ownerFilter} onChange={event => setOwnerFilter(event.target.value as 'all' | RoleType)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="all">全部成員</option>
                {ROLE_ORDER.map(role => <option key={role} value={role}>{AGENT_PROFILES[role].displayName}</option>)}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? <div className="p-8 text-center text-sm text-slate-500">正在載入工作資料…</div> : filteredItems.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">目前沒有符合條件的工作。</div> : filteredItems.map(item => (
              <article key={item.id} className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">優先：{PRIORITY_LABEL[item.priority]}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">負責：{AGENT_PROFILES[item.owner].displayName} · 更新 {formatTime(item.updated_at)}</p>
                  </div>
                  <select
                    value={item.status}
                    disabled={preview || savingId === item.id}
                    onChange={event => void updateItem(item.id, { status: event.target.value as AIWorkStatus })}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    aria-label={`更新 ${item.title} 狀態`}
                  >
                    {STATUS_ORDER.map(status => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${item.progress}%` }} /></div>
                  <span className="w-10 text-right text-sm font-medium text-slate-700">{item.progress}%</span>
                  <div className="flex gap-1">
                    <button type="button" disabled={preview || savingId === item.id || item.progress === 0} onClick={() => void updateItem(item.id, { progress: Math.max(0, item.progress - 10) })} className="h-8 w-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="進度減少 10%">−</button>
                    <button type="button" disabled={preview || savingId === item.id || item.progress === 100} onClick={() => void updateItem(item.id, { progress: Math.min(100, item.progress + 10) })} className="h-8 w-8 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="進度增加 10%">＋</button>
                  </div>
                </div>

                <div className="grid gap-2 text-sm md:grid-cols-2">
                  {item.next_action && <div className="rounded-lg bg-blue-50 p-3 text-blue-900"><span className="font-medium">下一步：</span>{item.next_action}</div>}
                  {item.blocker && <div className="rounded-lg bg-red-50 p-3 text-red-800"><span className="font-medium">卡點：</span>{item.blocker}</div>}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-amber-900"><AlertTriangle size={20} /><h2 className="font-semibold">需要您提供</h2></div>
          {waitingForUser.length === 0 ? (
            <p className="text-sm text-amber-800">目前沒有等待您提供的資料。</p>
          ) : (
            <div className="space-y-3">
              {waitingForUser.map(item => (
                <div key={item.id} className="rounded-lg border border-amber-200 bg-white p-3">
                  <div className="text-sm font-medium text-slate-900">{item.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.user_input_needed}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
