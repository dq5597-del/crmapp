'use client'

/**
 * 表格欄寬微調（2026-07 新增）— 報價單/銷貨單/訂購單品項表共用
 * - 表頭欄位右緣可左右拖曳調整寬度，拖動時即時生效
 * - 每張表、每個使用者各自記住自己的欄寬（存瀏覽器 localStorage）
 * - 「欄寬重設」可一鍵恢復預設
 */

import { useState, useEffect } from 'react'
import { RotateCcw, Copy, Save } from 'lucide-react'

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
      {/* 欄寬拖曳把手：看得見的灰色短棒（hover 變藍），感應範圍 14px 跨在欄界兩側 */}
      <span
        onMouseDown={e => startResize(col, e)}
        onTouchStart={e => startResize(col, e)}
        title="左右拖曳調整欄寬"
        className="absolute -right-[7px] top-0 h-full w-[14px] cursor-col-resize z-10 flex items-center justify-center group"
      >
        <span className="w-[3px] h-3/5 rounded-full bg-gray-300 group-hover:bg-blue-500 group-active:bg-blue-600 transition-colors" />
      </span>
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

/** 三張單的欄寬儲存鍵與名稱（欄位相同，可互相套用） */
const TABLE_KEYS: Record<string, string> = {
  'quote-items': '報價單',
  'sales-order-items': '銷貨單',
  'purchase-order-items': '訂購單',
}

/** 欄寬工具列：重設 + 套用到其他作業（可勾選要同步哪幾張單） */
export function ColWidthTools({ tableKey, widths, onReset }: {
  tableKey: string
  widths: Record<string, number>
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const others = Object.entries(TABLE_KEYS).filter(([k]) => k !== tableKey)
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(others.map(([k]) => [k, true]))
  )

  function apply() {
    const targets = others.filter(([k]) => checked[k])
    targets.forEach(([k]) => localStorage.setItem('gh-colw-' + k, JSON.stringify(widths)))
    setOpen(false)
    alert('已套用欄寬到：' + targets.map(([, n]) => n).join('、') + '（開啟該單據即生效）')
  }

  function saveNow() {
    localStorage.setItem('gh-colw-' + tableKey, JSON.stringify(widths))
    alert('欄寬已儲存，之後開啟都會用這個設定')
  }

  return (
    <div className="relative flex items-center gap-3">
      <button type="button" onClick={saveNow} title="儲存目前欄寬"
        className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium">
        <Save size={11} /> 儲存欄寬
      </button>
      <ColWidthReset onReset={onReset} />
      <button type="button" onClick={() => setOpen(o => !o)} title="把目前欄寬套用到其他單據"
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600">
        <Copy size={11} /> 套用到其他作業
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-40 w-48">
          <div className="text-xs font-medium text-gray-700 mb-2">套用目前欄寬到：</div>
          {others.map(([k, name]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-gray-600 py-1 cursor-pointer">
              <input type="checkbox" checked={!!checked[k]} onChange={e => setChecked(p => ({ ...p, [k]: e.target.checked }))} className="accent-blue-600 w-3.5 h-3.5" />
              {name}
            </label>
          ))}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">取消</button>
            <button type="button" onClick={apply} disabled={!others.some(([k]) => checked[k])}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg disabled:opacity-40">套用</button>
          </div>
        </div>
      )}
    </div>
  )
}
