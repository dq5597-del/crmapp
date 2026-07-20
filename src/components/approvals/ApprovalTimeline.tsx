'use client'

import { Send, Check, X, Ban } from 'lucide-react'

/**
 * 簽核歷程時間軸（純顯示元件）
 * records 由 ApprovalBar 取得後傳入，由舊到新排列。
 */

export type ApprovalRecord = {
  id: string
  step_order: number
  action: 'submit' | 'approve' | 'reject' | 'cancel'
  actor_name: string
  comment: string | null
  created_at: string
}

const ACTION_META: Record<ApprovalRecord['action'], { label: string; icon: typeof Send; dot: string; text: string }> = {
  submit:  { label: '送簽', icon: Send,  dot: 'bg-blue-500',  text: 'text-blue-700' },
  approve: { label: '核准', icon: Check, dot: 'bg-green-500', text: 'text-green-700' },
  reject:  { label: '退回', icon: X,     dot: 'bg-red-500',   text: 'text-red-700' },
  cancel:  { label: '撤簽', icon: Ban,   dot: 'bg-gray-400',  text: 'text-gray-500' },
}

function fmt(dt: string) {
  const d = new Date(dt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ApprovalTimeline({
  records,
  pendingApprover,
}: {
  records: ApprovalRecord[]
  /** 簽核中時顯示等待節點，如「王經理」或「主管」 */
  pendingApprover?: string | null
}) {
  if (!records.length && !pendingApprover) return null

  return (
    <div className="space-y-0">
      {records.map((r, idx) => {
        const meta = ACTION_META[r.action]
        const Icon = meta.icon
        const isLast = idx === records.length - 1 && !pendingApprover
        return (
          <div key={r.id} className="flex gap-3">
            {/* 節點 + 連接線 */}
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full ${meta.dot} flex items-center justify-center shrink-0`}>
                <Icon size={13} className="text-white" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-0.5" />}
            </div>
            {/* 內容 */}
            <div className="pb-4 min-w-0">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className={`font-medium ${meta.text}`}>{meta.label}</span>
                <span className="text-gray-800">{r.actor_name}</span>
                <span className="text-xs text-gray-400">{fmt(r.created_at)}</span>
              </div>
              {r.comment && (
                <div className="mt-1 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                  {r.comment}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* 等待中的下一關 */}
      {pendingApprover && (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full border-2 border-dashed border-amber-400 bg-amber-50 shrink-0" />
          </div>
          <div className="text-sm text-amber-700 pt-0.5">
            待簽核：{pendingApprover}
          </div>
        </div>
      )}
    </div>
  )
}
