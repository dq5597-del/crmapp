'use client'

/**
 * 介面縮放（2026-07 改版）
 * ------------------------------------------------------------------
 * 舊版做法：改 viewport meta 的寬度 + 在電腦另開預覽視窗。
 *   → 手機／平板／PWA app 上瀏覽器多半忽略動態改寫的 viewport，實際沒作用；
 *     電腦又要另開視窗，操作很卡。整組移除。
 *
 * 新版做法：直接對 documentElement 套用 CSS zoom。
 *   - 手機、平板、電腦、PWA app 全部一致生效，即時、不重新整理、不開新視窗
 *   - 縮小＝同一畫面看到更多內容（表格、報價單品項列）
 *   - 設定存 localStorage('gh-ui-scale')，每台裝置各自記憶，重開 app 仍保留
 *   - layout.tsx 的啟動腳本會在「首次繪製前」就套用，不會閃一下
 *   - 列印時強制還原 100%（globals.css 的 @media print）
 */

import { useState, useEffect } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

const LS_SCALE = 'gh-ui-scale'
const MIN = 0.6
const MAX = 1.4
const STEP = 0.05
const PRESETS = [0.75, 0.85, 1, 1.15, 1.3]

function clamp(v: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100))
}

/** 對整份文件套用縮放（唯一真正跨裝置有效的方式） */
export function applyUiScale(scale: number) {
  const s = clamp(scale)
  const el = document.documentElement
  // 用 setProperty 而非 style.zoom，避免 TS lib.dom 版本差異
  if (s === 1) el.style.removeProperty('zoom')
  else el.style.setProperty('zoom', String(s))
  el.style.setProperty('--gh-ui-scale', String(s))
}

export default function ViewModeSwitch() {
  const [scale, setScale] = useState(1)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let s = parseFloat(localStorage.getItem(LS_SCALE) || '1')
    if (!s || Number.isNaN(s)) s = 1
    s = clamp(s)
    setScale(s)
    applyUiScale(s)
    setReady(true)
  }, [])

  function change(next: number) {
    const s = clamp(next)
    setScale(s)
    localStorage.setItem(LS_SCALE, String(s))
    applyUiScale(s)
  }

  const pct = Math.round(scale * 100)

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[10px] text-gray-500">介面縮放</span>
        {ready && scale !== 1 && (
          <button
            type="button"
            onClick={() => change(1)}
            title="還原 100%"
            className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-white"
          >
            <RotateCcw size={10} /> 還原
          </button>
        )}
      </div>

      {/* 減 / 目前比例 / 加 */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => change(scale - STEP)}
          disabled={scale <= MIN}
          title="縮小（看到更多內容）"
          className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ZoomOut size={14} />
        </button>
        <div className="w-12 text-center text-[11px] tabular-nums text-gray-200 select-none">
          {pct}%
        </div>
        <button
          type="button"
          onClick={() => change(scale + STEP)}
          disabled={scale >= MAX}
          title="放大（字更大）"
          className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ZoomIn size={14} />
        </button>
      </div>

      {/* 常用比例快速鈕 */}
      <div className="grid grid-cols-5 gap-1 mt-1">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => change(p)}
            className={`py-1 rounded text-[10px] tabular-nums transition-colors ${
              Math.abs(scale - p) < 0.001
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
            }`}
          >
            {Math.round(p * 100)}
          </button>
        ))}
      </div>

      {/* 滑桿：手機上用拖的最直覺 */}
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={scale}
        onChange={e => change(parseFloat(e.target.value))}
        aria-label="介面縮放比例"
        className="w-full mt-2 h-1 accent-blue-600 cursor-pointer"
      />
    </div>
  )
}
