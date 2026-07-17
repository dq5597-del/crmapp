'use client'

import { useEffect, useRef } from 'react'

/**
 * 一維條碼顯示。
 * - 13 碼數字 → EAN-13（一般國際條碼）
 * - 8 碼數字 → EAN-8
 * - 其他（含 EAN 檢查碼不符）→ 自動改用 CODE128，仍可掃描
 */
export default function BarcodePreview({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const v = (value ?? '').trim()
    const svg = ref.current
    if (!svg) return
    if (!v) { svg.innerHTML = ''; return }

    let cancelled = false
    import('jsbarcode').then(mod => {
      if (cancelled || !ref.current) return
      const JsBarcode = (mod as any).default ?? mod
      const format = /^\d{13}$/.test(v) ? 'EAN13' : /^\d{8}$/.test(v) ? 'EAN8' : 'CODE128'
      const opts = { width: 2, height: 60, fontSize: 14, margin: 6, displayValue: true }
      try {
        JsBarcode(ref.current, v, { format, ...opts })
      } catch {
        try { JsBarcode(ref.current, v, { format: 'CODE128', ...opts }) } catch { /* 無效字元 */ }
      }
    })
    return () => { cancelled = true }
  }, [value])

  if (!(value ?? '').trim()) return null
  return (
    <div style={{ background: '#fff', display: 'inline-block', padding: 6, borderRadius: 8, border: '1px solid #eee' }}>
      <svg ref={ref} />
    </div>
  )
}
