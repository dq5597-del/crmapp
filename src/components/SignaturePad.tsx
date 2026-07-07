'use client'

import { useRef, useEffect, useState } from 'react'

/** 觸控／滑鼠簽名板（手機、平板、桌機通用） */
export default function SignaturePad({ title, onSave, onClose }: {
  title: string
  onSave: (dataUrl: string, signerName: string) => Promise<void> | void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const [hasInk, setHasInk] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function down(e: React.PointerEvent) {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastRef.current = pos(e)
  }

  function move(e: React.PointerEvent) {
    if (!drawingRef.current) return
    e.preventDefault()
    const p = pos(e)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
    setHasInk(true)
  }

  function up() { drawingRef.current = false }

  function clear() {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasInk(false)
  }

  async function save() {
    if (!hasInk || saving) return
    setSaving(true)
    try {
      // 縮小輸出（寬 600px 已足夠列印清晰）
      const src = canvasRef.current!
      const out = document.createElement('canvas')
      const scale = 600 / src.width
      out.width = 600
      out.height = Math.round(src.height * scale)
      const octx = out.getContext('2d')!
      octx.drawImage(src, 0, 0, out.width, out.height)
      await onSave(out.toDataURL('image/png'), signerName.trim())
      onClose()
    } catch (e: any) {
      alert('簽名儲存失敗：' + (e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="no-print" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>
        <input
          type="text" placeholder="簽名人姓名（選填）" value={signerName}
          onChange={e => setSignerName(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: '100%', height: 200, border: '2px dashed #cbd5e1', borderRadius: 12, touchAction: 'none', display: 'block', cursor: 'crosshair' }}
        />
        <div style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 12px' }}>請在框內用手指或觸控筆簽名</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={clear}
            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            清除重簽
          </button>
          <button onClick={save} disabled={!hasInk || saving}
            style={{ padding: '8px 20px', background: hasInk ? '#2563eb' : '#93c5fd', color: '#fff', border: 'none', borderRadius: 8, cursor: hasInk ? 'pointer' : 'default', fontSize: 14, fontWeight: 600 }}>
            {saving ? '儲存中…' : '確認簽名'}
          </button>
        </div>
      </div>
    </div>
  )
}
