'use client'

/**
 * 版型切換（2026-07 新增）：自動 / 手機 / 平板 / 電腦
 * - 預設「自動」＝依裝置螢幕寬度自動切換（業界標準）
 * - 手動模式透過調整 viewport 寬度強制套用版型，選擇會記住（localStorage）
 * - 註：桌機瀏覽器不理會 viewport 設定，手動切換主要對手機/平板有效；
 *   桌機要看手機版直接縮小視窗即可
 */

import { useState, useEffect } from 'react'
import { MonitorSmartphone, Smartphone, Tablet, Monitor } from 'lucide-react'

type Mode = 'auto' | 'mobile' | 'tablet' | 'desktop'
const LS_KEY = 'gh-view-mode'

const VIEWPORTS: Record<Mode, string> = {
  auto: 'width=device-width, initial-scale=1',
  mobile: 'width=390',
  tablet: 'width=820',
  desktop: 'width=1280',
}

export function applyViewMode(mode: Mode) {
  let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  meta.content = VIEWPORTS[mode] ?? VIEWPORTS.auto
}

export default function ViewModeSwitch() {
  const [mode, setMode] = useState<Mode>('auto')

  useEffect(() => {
    const saved = (localStorage.getItem(LS_KEY) as Mode) || 'auto'
    setMode(saved)
    applyViewMode(saved)
  }, [])

  function pick(m: Mode) {
    setMode(m)
    localStorage.setItem(LS_KEY, m)
    applyViewMode(m)
  }

  const opts: { m: Mode; label: string; Icon: any }[] = [
    { m: 'auto', label: '自動', Icon: MonitorSmartphone },
    { m: 'mobile', label: '手機', Icon: Smartphone },
    { m: 'tablet', label: '平板', Icon: Tablet },
    { m: 'desktop', label: '電腦', Icon: Monitor },
  ]

  return (
    <div className="px-3 py-2">
      <div className="text-[10px] text-gray-500 mb-1 px-1">版型顯示</div>
      <div className="grid grid-cols-4 gap-1">
        {opts.map(({ m, label, Icon }) => (
          <button key={m} type="button" onClick={() => pick(m)} title={label}
            className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] transition-colors ${
              mode === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  )
}
