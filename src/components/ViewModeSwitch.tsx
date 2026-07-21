'use client'

/**
 * 版型切換 + 自訂設備管理（2026-07）
 * - 自動（預設）：依螢幕寬度自動切手機/平板/電腦版
 * - 快速鈕：手機 390 / 平板 820 / 電腦 1280
 * - 自訂設備：輸入「型號名稱 + 螢幕寬度(px)」可無限新增，每人各自儲存
 * - 電腦預覽：點「預覽」開一個該寬度的視窗，實際看版面並可直接調欄寬，
 *   調完的設定與主視窗共用（同一瀏覽器），關掉預覽即完成設定
 * - 在實際手機/平板上點「套用」則直接以該寬度顯示
 */

import { useState, useEffect } from 'react'
import { MonitorSmartphone, Smartphone, Tablet, Monitor, Settings2, Eye, Trash2, Plus, X } from 'lucide-react'

type Mode = 'auto' | 'mobile' | 'tablet' | 'desktop' | `dev:${string}`
type Device = { id: string; name: string; width: number }

const LS_MODE = 'gh-view-mode'
const LS_DEVICES = 'gh-devices'

function viewportContent(width: number | 'auto') {
  return width === 'auto' ? 'width=device-width, initial-scale=1' : `width=${width}`
}

function setViewport(width: number | 'auto') {
  let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  meta.content = viewportContent(width)
}

function loadDevices(): Device[] {
  try { return JSON.parse(localStorage.getItem(LS_DEVICES) ?? '[]') } catch { return [] }
}

export default function ViewModeSwitch() {
  const [mode, setMode] = useState<Mode>('auto')
  const [devices, setDevices] = useState<Device[]>([])
  const [manage, setManage] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWidth, setNewWidth] = useState('')

  useEffect(() => {
    const devs = loadDevices()
    setDevices(devs)
    const saved = (localStorage.getItem(LS_MODE) as Mode) || 'auto'
    setMode(saved)
    applyMode(saved, devs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyMode(m: Mode, devs: Device[] = devices) {
    if (m === 'auto') setViewport('auto')
    else if (m === 'mobile') setViewport(390)
    else if (m === 'tablet') setViewport(820)
    else if (m === 'desktop') setViewport(1280)
    else {
      const d = devs.find(x => 'dev:' + x.id === m)
      setViewport(d ? d.width : 'auto')
    }
  }

  function pick(m: Mode) {
    setMode(m)
    localStorage.setItem(LS_MODE, m)
    applyMode(m)
  }

  function saveDevices(list: Device[]) {
    setDevices(list)
    localStorage.setItem(LS_DEVICES, JSON.stringify(list))
  }

  function addDevice() {
    const w = parseInt(newWidth)
    if (!newName.trim() || !w || w < 240 || w > 4000) { alert('請輸入型號名稱與 240–4000 之間的寬度(px)'); return }
    saveDevices([...devices, { id: Date.now().toString(36), name: newName.trim(), width: w }])
    setNewName(''); setNewWidth('')
  }

  function preview(d: Device) {
    // 電腦上開一個該寬度的視窗實際預覽；在裡面調的欄寬等設定與主視窗共用
    window.open(window.location.href, 'gh-preview-' + d.id,
      `width=${d.width},height=${Math.min(900, screen.availHeight - 80)},left=80,top=40,resizable=yes,scrollbars=yes`)
  }

  const quick: { m: Mode; label: string; Icon: any }[] = [
    { m: 'auto', label: '自動', Icon: MonitorSmartphone },
    { m: 'mobile', label: '手機', Icon: Smartphone },
    { m: 'tablet', label: '平板', Icon: Tablet },
    { m: 'desktop', label: '電腦', Icon: Monitor },
  ]

  return (
    <div className="px-3 py-2 relative">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[10px] text-gray-500">版型顯示</span>
        <button type="button" onClick={() => setManage(m => !m)} title="設備管理（自訂型號與尺寸）"
          className="text-gray-500 hover:text-white"><Settings2 size={12} /></button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {quick.map(({ m, label, Icon }) => (
          <button key={m} type="button" onClick={() => pick(m)} title={label}
            className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] transition-colors ${
              mode === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {devices.length > 0 && (
        <div className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
          {devices.map(d => (
            <button key={d.id} type="button" onClick={() => pick(('dev:' + d.id) as Mode)}
              className={`w-full text-left px-2 py-1 rounded text-[10px] truncate ${
                mode === 'dev:' + d.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}>
              {d.name}（{d.width}px）
            </button>
          ))}
        </div>
      )}

      {manage && (
        <div className="absolute bottom-full left-2 right-2 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-50 text-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold">設備管理</div>
            <button type="button" onClick={() => setManage(false)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>
          <div className="space-y-1.5 max-h-44 overflow-y-auto mb-2">
            {devices.length === 0 && <div className="text-[11px] text-gray-400">尚無設備，於下方新增（可無限多筆）</div>}
            {devices.map(d => (
              <div key={d.id} className="flex items-center gap-1.5 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5">
                <span className="flex-1 truncate">{d.name}<span className="text-gray-400 ml-1">{d.width}px</span></span>
                <button type="button" onClick={() => preview(d)} title="在電腦開此尺寸的預覽視窗（可直接調欄寬，設定共用）"
                  className="flex items-center gap-0.5 text-blue-600 hover:underline"><Eye size={11} /> 預覽</button>
                <button type="button" onClick={() => pick(('dev:' + d.id) as Mode)} title="在此裝置直接套用此尺寸"
                  className="text-emerald-600 hover:underline">套用</button>
                <button type="button" onClick={() => saveDevices(devices.filter(x => x.id !== d.id))}
                  className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="型號，例：iPhone 15"
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <input value={newWidth} onChange={e => setNewWidth(e.target.value.replace(/\D/g, ''))} placeholder="寬px"
              className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <button type="button" onClick={addDevice}
              className="flex items-center gap-0.5 bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-[11px]"><Plus size={11} /> 新增</button>
          </div>
          <div className="text-[10px] text-gray-400 mt-2 leading-relaxed">
            常見寬度：iPhone 15/16＝393、iPhone Pro Max＝430、iPad＝820、iPad Pro＝1024。
            「預覽」在電腦開該尺寸視窗，裡面調的欄寬會直接存檔生效。
          </div>
        </div>
      )}
    </div>
  )
}
