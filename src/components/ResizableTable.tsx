'use client'

/**
 * 表格欄寬微調（2026-07 新增）— 報價單/銷貨單/訂購單品項表共用
 * - 表頭欄位右緣可左右拖曳調整寬度，拖動時即時生效
 * - 每張表、每個使用者各自記住自己的欄寬（存瀏覽器 localStorage）
 * - 「欄寬重設」可一鍵恢復預設
 */

import { useState, useEffect } from 'react'
import { RotateCcw } from 'lucide-react'

export function useColWidths(tableKey: string, defaults: Record<string, number>) {
  const LS = 'gh-colw-' + tableKey
  const [widths, setWidths] = useState<Record<string, number>>(defaults)

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS) ?? 'null')
      if (s) setWidths({ ...defaults, ...s })
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey])

  function startResize(col: string, e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    e.stopPropagation()
    const getX = (ev: any) => ev.touches ? ev.touches[0].clientX : ev.clientX
    const startX = getX(e as any)
    const startW = widths[col] ?? 100
    const onMove = (ev: any) => {
      const w = Math.max(48, Math.round(startW + getX(ev) - startX))
      setWidths(prev => ({ ...prev, [col]: w }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      setWidths(prev => { localStorage.setItem(LS, JSON.stringify(prev)); return prev })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
  }

  function reset() {
    localStorage.removeItem(LS)
    setWidths(defaults)
  }

  return { widths, startResize, reset }
}

export function ResizableTH({ col, widths, startResize, className = '', children }: {
  col: string
  widths: Record<string, number>
  startResize: (col: string, e: React.MouseEvent | React.TouchEvent) => void
  className?: string
  children?: React.ReactNode
}) {
  return (
    <th className={className + ' relative select-none'} style={{ width: widths[col], minWidth: widths[col] }}>
      {children}
      <span
        onMouseDown={e => startResize(col, e)}
        onTouchStart={e => startResize(col, e)}
        title="左右拖曳調整欄寬"
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60"
      />
    </th>
  )
}

export function ColWidthReset({ onReset }: { onReset: () => void }) {
  return (
    <button type="button" onClick={onReset} title="恢復預設欄寬"
      className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
      <RotateCcw size={11} /> 欄寬重設
    </button>
  )
}
