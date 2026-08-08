'use client'

import { useEffect, useMemo, useState } from 'react'
import { Cloud, Printer, ShieldCheck, X } from 'lucide-react'

type WarrantyItem = {
  id?: string
  product_name: string
  model?: string | null
  quantity: number
}

type Props = {
  open: boolean
  onClose: () => void
  orderNo: string
  purchaseDate: string
  clientName?: string
  sourceId?: string
  items: WarrantyItem[]
}

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;')

export default function WarrantyLabelModal({ open, onClose, orderNo, purchaseDate, clientName, sourceId, items }: Props) {
  const printable = useMemo(() => items.filter(i => i.product_name.trim()), [items])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [copies, setCopies] = useState<Record<number, number>>({})
  const [printers, setPrinters] = useState<{ id: string; name: string; last_seen_at?: string | null }[]>([])
  const [printerId, setPrinterId] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/print/printers').then(r => r.ok ? r.json() : { printers: [] }).then(json => {
      const list = json.printers ?? []
      setPrinters(list)
      setPrinterId((current: string) => current || list[0]?.id || '')
    }).catch(() => setPrinters([]))
  }, [open])

  if (!open) return null

  const isSelected = (idx: number) => selected[idx] ?? true
  const copyCount = (idx: number) => copies[idx] ?? Math.max(1, Math.ceil(Number(printable[idx]?.quantity) || 1))
  const total = printable.reduce((sum, _, idx) => sum + (isSelected(idx) ? copyCount(idx) : 0), 0)

  function printLabels(onlyIdx?: number) {
    const labels = printable.flatMap((item, idx) => {
      if (onlyIdx !== undefined ? idx !== onlyIdx : !isSelected(idx)) return []
      return Array.from({ length: Math.min(100, copyCount(idx)) }, () => `
        <section class="label">
          <header><strong>GH 光輝影音科技</strong><span>產品保固貼紙</span></header>
          <main>
            <div class="product">${esc(item.product_name)}</div>
            ${item.model ? `<div class="model">型號：${esc(item.model)}</div>` : ''}
            <div class="row"><span>購買日期</span><b>${esc(purchaseDate)}</b></div>
            <div class="row"><span>銷貨單號</span><b>${esc(orderNo)}</b></div>
            ${clientName ? `<div class="client">客戶：${esc(clientName)}</div>` : ''}
          </main>
          <footer>保固服務：03-8321087　｜　請保留本貼紙</footer>
        </section>`)
    }).join('')

    if (!labels) { alert('請至少選擇一個品項'); return }
    const win = window.open('', '_blank', 'width=760,height=720')
    if (!win) { alert('無法開啟列印視窗，請允許此網站使用彈出視窗。'); return }
    win.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>保固貼紙_${esc(orderNo)}</title><style>
      *{box-sizing:border-box}html,body{margin:0;background:#eee;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;color:#111}
      .label{width:80mm;height:40mm;background:#fff;border:1px dashed #999;margin:5mm auto;padding:3.2mm 4mm;display:flex;flex-direction:column;overflow:hidden;page-break-after:always}
      header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1f9d9f;padding-bottom:1.5mm;color:#117c7e;font-size:10pt}
      header span{font-size:8.5pt;font-weight:700}main{flex:1;padding-top:1.5mm;min-height:0}.product{font-size:11pt;font-weight:800;line-height:1.25;max-height:9mm;overflow:hidden}
      .model,.client{font-size:7.5pt;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row{display:flex;justify-content:space-between;font-size:8pt;line-height:1.45}.row b{font-weight:700}
      footer{border-top:1px solid #bbb;padding-top:1mm;text-align:center;font-size:7.2pt;color:#333}
      @media print{html,body{background:#fff}.label{margin:0;border:0}@page{size:80mm 40mm;margin:0}}
    </style></head><body>${labels}<script>setTimeout(function(){window.focus();window.print()},350)<\/script></body></html>`)
    win.document.close()
  }

  async function queueCloudPrint(onlyIdx?: number) {
    const labels = printable.flatMap((item, idx) => {
      if (onlyIdx !== undefined ? idx !== onlyIdx : !isSelected(idx)) return []
      return [{ product_name: item.product_name, model: item.model ?? '', copies: copyCount(idx) }]
    })
    if (!labels.length) return alert('請至少選擇一個品項')
    setCloudBusy(true)
    try {
      const res = await fetch('/api/print/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer_id: printerId || undefined, source_id: sourceId, order_no: orderNo, purchase_date: purchaseDate, client_name: clientName, labels }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '建立列印工作失敗')
      alert(`已送到「${json.printer.name}」列印佇列，可關閉此視窗繼續操作。`)
    } catch (e) { alert((e as Error).message) } finally { setCloudBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900"><ShieldCheck size={18} className="text-teal-600" />列印保固貼紙</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-5">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
            <div><span className="block text-xs text-teal-600">購買日期</span>{purchaseDate}</div>
            <div><span className="block text-xs text-teal-600">銷貨單號</span>{orderNo}</div>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {printable.map((item, idx) => (
              <label key={item.id ?? idx} className="flex items-center gap-3 border-b border-gray-100 px-3 py-3 last:border-0">
                <input type="checkbox" checked={isSelected(idx)} onChange={e => setSelected(p => ({ ...p, [idx]: e.target.checked }))} className="h-4 w-4 accent-teal-600" />
                <span className="min-w-0 flex-1 text-sm text-gray-800">
                  <span className="block truncate font-medium">{item.product_name}</span>
                  {item.model && <span className="block truncate text-xs text-gray-400">型號：{item.model}</span>}
                </span>
                <button type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); printLabels(idx) }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
                  title="只列印這個品項">
                  <Printer size={13} /> 單印
                </button>
                <span className="text-xs text-gray-500">張數</span>
                <input type="number" min={1} max={100} value={copyCount(idx)} disabled={!isSelected(idx)}
                  onChange={e => setCopies(p => ({ ...p, [idx]: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }))}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-sm disabled:bg-gray-50" />
              </label>
            ))}
            {printable.length === 0 && <div className="p-6 text-center text-sm text-gray-400">這張銷貨單尚無可列印品項</div>}
          </div>
          <p className="mt-3 text-xs text-gray-400">貼紙尺寸：80 × 40 mm。預設張數等於購買數量，可依實際設備調整。</p>
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-900"><Cloud size={15} />平板／遠端列印</div>
            <select value={printerId} onChange={e => setPrinterId(e.target.value)} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm">
              {printers.length === 0 && <option value="">尚未設定雲端印表機</option>}
              {printers.map(p => <option key={p.id} value={p.id}>{p.name}{p.last_seen_at ? '' : '（尚未連線）'}</option>)}
            </select>
            <p className="mt-1.5 text-xs text-blue-600">由連接印表機的 Windows 電腦接收工作；平板不需要安裝驅動程式。</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t bg-gray-50 px-5 py-4">
          <span className="text-sm text-gray-500">共 {total} 張</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">取消</button>
            <button type="button" onClick={() => queueCloudPrint()} disabled={total === 0 || cloudBusy || printers.length === 0} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Cloud size={15} />{cloudBusy ? '傳送中' : '遠端列印'}</button>
            <button type="button" onClick={() => printLabels()} disabled={total === 0} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"><Printer size={15} />列印</button>
          </div>
        </div>
      </div>
    </div>
  )
}
