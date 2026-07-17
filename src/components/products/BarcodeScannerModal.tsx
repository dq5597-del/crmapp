'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * 相機掃描條碼 Modal。
 * 支援一般國際條碼：EAN-13 / EAN-8 / UPC-A / UPC-E，以及 Code128 / Code39 / QR。
 * 讀到後回傳文字並自動關閉。
 */
export default function BarcodeScannerModal({
  onDetected, onClose,
}: { onDetected: (text: string) => void; onClose: () => void }) {
  const [err, setErr] = useState('')
  const instanceRef = useRef<any>(null)

  useEffect(() => {
    let stopped = false

    import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (stopped) return
      const formats = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
      ]
      const instance = new Html5Qrcode('barcode-reader', { formatsToSupport: formats, verbose: false })
      instanceRef.current = instance
      instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (decoded: string) => { onDetected(decoded) },
        () => {},
      ).catch((e: any) => {
        const name = e?.name ?? ''
        if (name === 'NotFoundError' || /device not found/i.test(e?.message ?? '')) {
          setErr('找不到相機裝置。這台裝置可能沒有相機，請改用有鏡頭的手機或平板開啟此頁掃描。')
        } else if (name === 'NotAllowedError' || /permission/i.test(e?.message ?? '')) {
          setErr('相機權限被拒。請到瀏覽器網站設定允許相機權限後再試。')
        } else {
          setErr('無法開啟相機：' + (e?.message ?? e))
        }
      })
    }).catch((e: any) => setErr('載入掃描元件失敗：' + (e?.message ?? e)))

    return () => {
      stopped = true
      const inst = instanceRef.current
      if (inst) {
        try {
          if (inst.isScanning) inst.stop().then(() => inst.clear()).catch(() => {})
          else inst.clear()
        } catch { /* ignore */ }
      }
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">掃描條碼</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4">
          <div id="barcode-reader" style={{ width: '100%' }} />
          {err
            ? <p className="text-sm text-red-600 mt-2">{err}</p>
            : <p className="text-xs text-gray-500 mt-2 text-center">將條碼對準框內，讀取後自動填入</p>}
        </div>
      </div>
    </div>
  )
}
