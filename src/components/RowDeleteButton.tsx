'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface RowDeleteButtonProps {
  /** 資料表名稱，如 'sales_orders' */
  table: string
  /** 要刪除的資料列 id */
  id: string
  /** 給使用者看的單據名稱，如 '銷貨單'、'客戶' */
  label?: string
  /** 自訂確認訊息（省略則用預設） */
  confirmMessage?: string
  /** 刪除成功後回呼，通常用來把該列從畫面上移除 */
  onDeleted?: (id: string) => void
  /** 只顯示垃圾桶圖示、不顯示文字 */
  iconOnly?: boolean
  /** 額外樣式 */
  className?: string
}

/**
 * 共用列表刪除按鈕。
 * - 先跳確認對話框。
 * - 直接刪除該列（自身擁有的子項目由資料庫外鍵 CASCADE 一併處理）。
 * - 若被其他單據關聯（外鍵約束 23503）→ 禁止刪除並提示先解除關聯。
 */
export default function RowDeleteButton({
  table,
  id,
  label = '這筆資料',
  confirmMessage,
  onDeleted,
  iconOnly = false,
  className = '',
}: RowDeleteButtonProps) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (busy) return
    if (!confirm(confirmMessage ?? `確定刪除此${label}？此動作無法復原。`)) return
    setBusy(true)
    try {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) {
        // 23503 = foreign_key_violation：被其他單據關聯，禁止刪除
        if (error.code === '23503') {
          alert(`此${label}已被其他單據關聯，無法刪除。\n請先解除相關關聯（如已轉單、已出貨、已建立應收／應付等）後再刪除。`)
        } else {
          alert('刪除失敗：' + error.message)
        }
        return
      }
      onDeleted?.(id)
    } catch (err: any) {
      alert('刪除失敗：' + (err?.message ?? ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      title={`刪除此${label}`}
      className={
        'ml-1.5 inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-50 transition-colors ' +
        className
      }
    >
      <Trash2 size={13} />
      {!iconOnly && (busy ? '刪除中…' : '刪除')}
    </button>
  )
}
