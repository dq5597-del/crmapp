'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileSignature, Check, X, Ban, ChevronDown, ChevronUp } from 'lucide-react'
import ApprovalTimeline, { ApprovalRecord } from './ApprovalTimeline'

/**
 * 通用簽核列 — 掛在任何單據詳情頁
 *
 * <ApprovalBar docType="payable" docId={id} onChanged={fetchAll} onState={setApprovalStatus} />
 *
 * 狀態行為：
 *  - 無簽呈（null）      → 顯示「送出簽核」
 *  - pending（非簽核人） → 顯示簽核中 + 下一關；送簽人可撤簽
 *  - pending（簽核人）   → 顯示同意 / 退回（意見 Modal）
 *  - approved / rejected / cancelled → 顯示結果 badge
 * 簽核系統未初始化（SQL 未執行）時顯示提示，不影響頁面其他功能。
 */

type ApprovalState = {
  instance: {
    id: string
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    submitted_at: string | null
    amount: number | null
  }
  records: ApprovalRecord[]
  next_approver: string | null
  i_can_approve: boolean
  i_am_submitter: boolean
} | null

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: '簽核中',  cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: '已核准',  cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '已退回',  cls: 'bg-red-100 text-red-700' },
  cancelled: { label: '已撤簽',  cls: 'bg-gray-100 text-gray-500' },
}

export default function ApprovalBar({
  docType,
  docId,
  onChanged,
  onState,
}: {
  docType: string
  docId: string
  /** 簽核狀態改變後回呼（讓頁面重抓單據資料） */
  onChanged?: () => void
  /** 回報目前簽核狀態給父頁（null = 尚未送簽），可用於鎖定編輯/付款 */
  onState?: (status: string | null) => void
}) {
  const [state, setState] = useState<ApprovalState>(null)
  const [loaded, setLoaded] = useState(false)
  const [setupHint, setSetupHint] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [modal, setModal] = useState<null | 'approve' | 'reject'>(null)
  const [comment, setComment] = useState('')

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/approvals?doc_type=${docType}&doc_id=${docId}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        // 資料表尚未建立等情形 → 顯示初始化提示
        if (res.status === 500) setSetupHint(true)
        setLoaded(true)
        return
      }
      setState(json.data)
      onState?.(json.data?.instance?.status ?? null)
      setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [docType, docId])

  useEffect(() => { fetchState() }, [fetchState])

  async function submit() {
    if (!confirm('送出簽核後，單據在核准前不可修改，確定送出？')) return
    setBusy(true)
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_type: docType, doc_id: docId }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok || !json.ok) { alert(json.error ?? '送簽失敗'); return }
    if (json.data?.auto_approved) alert('此單未達簽核門檻，已自動核准')
    await fetchState()
    onChanged?.()
  }

  async function act(action: 'approve' | 'reject' | 'cancel', actionComment?: string) {
    if (!state?.instance) return
    setBusy(true)
    const res = await fetch(`/api/approvals/${state.instance.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, comment: actionComment ?? '' }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok || !json.ok) { alert(json.error ?? '操作失敗'); return }
    setModal(null)
    setComment('')
    await fetchState()
    onChanged?.()
  }

  if (!loaded) return null

  if (setupHint) {
    return (
      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
        簽核功能尚未啟用 — 請先在 Supabase SQL Editor 執行 <span className="font-mono">supabase/schema_approvals.sql</span>
      </div>
    )
  }

  const instance = state?.instance
  const badge = instance ? STATUS_BADGE[instance.status] : null
  const lastReject = instance?.status === 'rejected'
    ? [...(state?.records ?? [])].reverse().find(r => r.action === 'reject')
    : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      {/* 主列 */}
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <FileSignature size={16} className="text-gray-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-900">簽呈</span>

        {!instance && (
          <>
            <span className="text-xs px-2.5 py-1 rounded-lg font-medium bg-gray-100 text-gray-500">未送簽</span>
            <div className="flex-1" />
            <button
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {busy ? '送出中...' : '送出簽核'}
            </button>
          </>
        )}

        {instance && badge && (
          <>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${badge.cls}`}>{badge.label}</span>
            {instance.status === 'pending' && state?.next_approver && (
              <span className="text-xs text-gray-500">下一關：{state.next_approver}</span>
            )}
            <div className="flex-1" />

            {/* 動作按鈕 */}
            {instance.status === 'pending' && state?.i_can_approve && (
              <div className="flex gap-2">
                <button
                  onClick={() => setModal('reject')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-60"
                >
                  <X size={14} /> 退回
                </button>
                <button
                  onClick={() => setModal('approve')}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  <Check size={14} /> 同意
                </button>
              </div>
            )}
            {instance.status === 'pending' && !state?.i_can_approve && state?.i_am_submitter && (
              <button
                onClick={() => { if (confirm('確定撤回此簽呈？')) act('cancel') }}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <Ban size={14} /> 撤簽
              </button>
            )}
            {(instance.status === 'rejected' || instance.status === 'cancelled') && (
              <button
                onClick={submit}
                disabled={busy}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
              >
                重新送簽
              </button>
            )}

            {/* 歷程展開 */}
            {(state?.records?.length ?? 0) > 0 && (
              <button
                onClick={() => setShowTimeline(v => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                歷程 {showTimeline ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </>
        )}
      </div>

      {/* 退回意見提示 */}
      {lastReject?.comment && (
        <div className="mx-5 mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          退回意見：{lastReject.comment}
        </div>
      )}

      {/* 簽核歷程 */}
      {showTimeline && state && (
        <div className="px-5 pb-4 border-t border-gray-50 pt-4">
          <ApprovalTimeline
            records={state.records}
            pendingApprover={instance?.status === 'pending' ? state.next_approver : null}
          />
        </div>
      )}

      {/* 意見 Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-gray-900">
              {modal === 'approve' ? '同意簽核' : '退回簽呈'}
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              placeholder={modal === 'approve' ? '簽核意見（選填）' : '退回原因（必填）'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModal(null); setComment('') }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">
                取消
              </button>
              <button
                onClick={() => {
                  if (modal === 'reject' && !comment.trim()) { alert('退回時請填寫原因'); return }
                  act(modal, comment)
                }}
                disabled={busy}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 ${modal === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {busy ? '處理中...' : modal === 'approve' ? '確認同意' : '確認退回'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
