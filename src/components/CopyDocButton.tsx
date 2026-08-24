'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'

/**
 * 通用「複製單據」按鈕。
 * 呼叫 /api/docs/[type]/[id]/duplicate，成功後導向新單。
 * type: sales-orders | purchase-orders | service-requests | projects
 */
export default function CopyDocButton({ type, id, label = '複製', title, gotoPath, compact = false }: {
  type: 'sales-orders' | 'purchase-orders' | 'service-requests' | 'projects'
  id: string
  label?: string
  title?: string
  /** 複製後要導向的路徑（預設 /{type}/{newId}） */
  gotoPath?: (newId: string) => string
  compact?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/docs/${type}/${id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '複製失敗')
      router.push(gotoPath ? gotoPath(data.id) : `/${type}/${data.id}`)
      router.refresh()
    } catch (err: any) {
      alert(err.message ?? '複製失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button onClick={handleCopy} disabled={loading} title={title ?? '複製'}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-50">
        <Copy size={15} />
      </button>
    )
  }

  return (
    <button onClick={handleCopy} disabled={loading} title={title ?? '複製（日期改今天、單號重新產生）'}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 transition-colors">
      <Copy size={13} />
      {loading ? '複製中…' : label}
    </button>
  )
}
