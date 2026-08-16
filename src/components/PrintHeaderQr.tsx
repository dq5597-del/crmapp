'use client'

import { useEffect, useState } from 'react'

/**
 * 單據列印抬頭的 QR Code（報價單／銷貨單／訂購單共用）
 *
 * 用 cdnjs 的 qrcode-generator 產生 data URL，再交給 <img> 顯示：
 *   - data URL 沒有跨網域問題，html2canvas 擷取 PDF 時不會變空白
 *   - 與條碼列印（JsBarcode）同一套載入方式，環境已驗證可用
 * 載入失敗時不顯示，不影響單據其他內容。
 */
export default function PrintHeaderQr({ url, size = 52 }: { url: string; size?: number }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false

    async function build() {
      try {
        const w = window as any
        if (!w.qrcode) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
            s.onload = () => resolve()
            s.onerror = () => reject(new Error('QR 函式庫載入失敗'))
            document.head.appendChild(s)
          })
        }
        // type 0 = 自動選版本，'M' = 中等容錯（約 15%），縮小列印仍掃得到
        const qr = w.qrcode(0, 'M')
        qr.addData(url)
        qr.make()
        if (!cancelled) setSrc(qr.createDataURL(6, 0))
      } catch (e) {
        console.error(e)
      }
    }
    build()
    return () => { cancelled = true }
  }, [url])

  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="LINE 加好友 QR"
      style={{ width: size, height: size, display: 'block', imageRendering: 'pixelated' }}
    />
  )
}
