'use client'

import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import BarcodePreview from './BarcodePreview'

function barcodeFormat(v: string) {
  return /^\d{13}$/.test(v) ? 'EAN13' : /^\d{8}$/.test(v) ? 'EAN8' : 'CODE128'
}

/**
 * 列印條碼標籤：可設定張數，一次印 N 張。
 * 於獨立視窗載入 JsBarcode 產生 EAN-13/EAN-8/Code128 後自動列印。
 */
export default function BarcodeLabelModal({
  value, name, model, onClose,
}: { value: string; name?: string; model?: string | null; onClose: () => void }) {
  const [count, setCount] = useState(1)
  const v = (value ?? '').trim()

  function handlePrint() {
    const n = Math.max(1, Math.min(500, Number(count) || 1))
    const fmt = barcodeFormat(v)
    const caption = [name, model].filter(Boolean).join(' ').replace(/</g, '&lt;')
    const safeVal = v.replace(/[\\'"]/g, '')
    const win = window.open('', '_blank', 'width=820,height=640')
    if (!win) { alert('無法開啟列印視窗，請允許此網站的彈出視窗後再試。'); return }
    const labels = Array.from({ length: n }).map(() => `
      <div class="label"><svg class="bc"></svg>${caption ? `<div class="cap">${caption}</div>` : ''}</div>`).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>條碼標籤 x${n}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
      <style>
        *{box-sizing:border-box} body{margin:0;font-family:'Microsoft JhengHei','微軟正黑體',sans-serif}
        .sheet{display:flex;flex-wrap:wrap;gap:6px;padding:8px}
        .label{border:1px solid #eee;padding:6px 8px;text-align:center;page-break-inside:avoid}
        .cap{font-size:11px;margin-top:2px;color:#111}
        @media print{ .label{border:none} @page{margin:8mm} }
      </style></head><body>
      <div class="sheet">${labels}</div>
      <script>
        window.onload=function(){
          try{ JsBarcode('.bc','${safeVal}',{format:'${fmt}',width:2,height:50,fontSize:13,margin:4,displayValue:true}); }
          catch(e){ try{ JsBarcode('.bc','${safeVal}',{format:'CODE128',width:2,height:50,fontSize:13,margin:4,displayValue:true}); }catch(_){} }
          setTimeout(function(){ window.focus(); window.print(); }, 350);
        };
      <\/script></body></html>`)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">列印條碼標籤</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            {v ? <BarcodePreview value={v} /> : <span className="text-sm text-gray-400">此產品尚未設定條碼</span>}
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">列印張數</label>
            <input type="number" min={1} max={500} value={count}
              onChange={e => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              onFocus={e => e.target.select()}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-[11px] text-gray-400 mt-1">最多 500 張。列印視窗會自動帶出系統列印對話框。</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
          <button onClick={handlePrint} disabled={!v}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            <Printer size={15} /> 列印
          </button>
        </div>
      </div>
    </div>
  )
}
