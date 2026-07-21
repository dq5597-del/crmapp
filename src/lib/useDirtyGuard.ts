'use client'

/**
 * 未存檔提醒（2026-07）— 各作業表單共用
 *
 * 用法：
 *   const guard = useDirtyGuard()
 *   <div {...guard.formProps}> ...表單內容... </div>   // 任何輸入都會標記「已修改」
 *   關閉按鈕：onClick={() => guard.guardClose(() => setOpen(false))}  // 有修改會先問
 *   存檔成功後：guard.markClean()
 *
 * 另外自動掛 beforeunload：直接關瀏覽器分頁/重新整理也會跳原生提醒。
 */

import { useRef, useEffect, useCallback } from 'react'

export function useDirtyGuard() {
  const dirtyRef = useRef(false)

  const markDirty = useCallback(() => { dirtyRef.current = true }, [])
  const markClean = useCallback(() => { dirtyRef.current = false }, [])

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const guardClose = useCallback((close: () => void) => {
    if (!dirtyRef.current || window.confirm('尚未存檔！確定要關閉嗎？\n未儲存的修改將會遺失。')) {
      dirtyRef.current = false
      close()
    }
  }, [])

  const formProps = { onInput: markDirty, onChange: markDirty }

  return { markDirty, markClean, guardClose, formProps, isDirty: () => dirtyRef.current }
}
