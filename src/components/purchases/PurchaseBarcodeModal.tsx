'use client'

import { useMemo, useState } from 'react'
import { Barcode, Printer, X } from 'lucide-react'

type BarcodeItem = {
  id?: string
  product_name: string
  model?: string | null
  barcode?: string | null
  product_code?: string | null
  quantity: number
  warehouse_name?: string | null
}

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;')

export default function PurchaseBarcodeModal({ open, onClose, purchaseNo, items }: {
  open: boolean
  onClose: () => void
  purchaseNo: string
  items: BarcodeItem[]
}) {
  const printable = useMemo(() => items.filter(i => (i.barcode || i.product_code)?.trim()), [items])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [copies, setCopies] = useState<Record<number, number>>({})
  if (!open) return null

  const isSelected = (idx: number) => selected[idx] ?? true
  const copyCount = (idx: number) => copies[idx] ?? Math.max(1, Math.ceil(Number(printable[idx]?.quantity) || 1))
  const total = printable.reduce((sum, _, idx) => sum + (isSelected(idx) ? copyCount(idx) : 0), 0)

  function printLabels() {
    const labels = printable.flatMap((item, idx) => {
      if (!isSelected(idx)) return []
      const value = (item.barcode || item.product_code || '').trim()
      return Array.from({ length: Math.min(500, copyCount(idx)) }, () => `
        <section class="label" data-code="${esc(value)}">
          <svg class="bc"></svg>
          <div class="name">${esc(item.product_name)}</div>
          <div class="meta">${esc([item.model, item.warehouse_name].filter(Boolean).join('｜'))}</div>
        </section>`)
    }).join('')
    if (!labels) return alert('請至少選擇一個品項')
    const win = window.open('', '_blank', 'width=820,height=680')
    if (!win) return alert('瀏覽器阻擋列印視窗，請允許彈出式視窗')
    win.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>進貨條碼_${esc(purchaseNo)}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
      <style>*{box-sizing:border-box}body{margin:0;font-family:"Microsoft JhengHei",sans-serif}.sheet{display:flex;flex-wrap:wrap;gap:2mm;padding:5mm}.label{width:50mm;height:30mm;padding:2mm;border:1px dashed #aaa;text-align:center;overflow:hidden;page-break-inside:avoid}.bc{width:100%;height:15mm}.name{font-size:9pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{font-size:7pt;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media print{.sheet{padding:0;gap:0}.label{border:0}@page{margin:4mm}}</style>
      </head><body><div class="sheet">${labels}</div><script>window.onload=function(){document.querySelectorAll('.label').forEach(function(el){var value=el.dataset.code;var fmt=/^\\d{13}$/.test(value)?'EAN13':/^\\d{8}$/.test(value)?'EAN8':'CODE128';try{JsBarcode(el.querySelector('.bc'),value,{format:fmt,width:1.6,height:42,fontSize:11,margin:1,displayValue:true})}catch(e){JsBarcode(el.querySelector('.bc'),value,{format:'CODE128',width:1.6,height:42,fontSize:11,margin:1})}});setTimeout(function(){window.focus();window.print()},350)};<\/script></body></html>`)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="flex items-center gap-2 font-semibold"><Barcode size={18} className="text-teal-600" />列印進貨條碼</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-5">
          <div className="mb-3 text-sm text-gray-500">進貨單：{purchaseNo}，共列印 {total} 張</div>
          <div className="overflow-hidden rounded-xl border">
            {printable.map((item, idx) => (
              <label key={item.id ?? idx} className="flex items-center gap-3 border-b px-3 py-3 last:border-0">
                <input type="checkbox" checked={isSelected(idx)} onChange={e => setSelected(p => ({ ...p, [idx]: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
                <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium">{item.product_name}</span><span className="block truncate text-xs text-gray-400">{item.barcode || item.product_code} · {item.warehouse_name || '未指定倉庫'}</span></span>
                <span className="text-xs text-gray-500">張數</span>
                <input type="number" min={1} max={500} value={copyCount(idx)} disabled={!isSelected(idx)} onChange={e => setCopies(p => ({ ...p, [idx]: Math.max(1, Math.min(500, Number(e.target.value) || 1)) }))} className="w-20 rounded-lg border px-2 py-1.5 text-right text-sm disabled:bg-gray-100" />
              </label>
            ))}
            {printable.length === 0 && <div className="p-8 text-center text-sm text-gray-400">品項尚未設定條碼或產品編號</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">取消</button><button onClick={printLabels} disabled={!printable.length || total === 0} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Printer size={15} />列印 {total} 張</button></div>
      </div>
    </div>
  )
}
