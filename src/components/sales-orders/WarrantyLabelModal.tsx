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
                  onClick={e => { e.preventDefault(); e.stopPropagation(); queueCloudPrint(idx) }}
                  disabled={cloudBusy || printers.length === 0}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-40"
                  title="直接由 TSC TTP-345 列印這個品項">
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-900"><Cloud size={15} />固定印表機</div>
              <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-blue-800">TSC TTP-345</span>
            </div>
            <p className="mt-1.5 text-xs text-blue-600">按下列印後直接送到 TSC TTP-345，不會再出現印表機選擇視窗。</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t bg-gray-50 px-5 py-4">
          <span className="text-sm text-gray-500">共 {total} 張</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">取消</button>
            <button type="button" onClick={() => queueCloudPrint()} disabled={total === 0 || cloudBusy || printers.length === 0} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"><Printer size={15} />{cloudBusy ? '傳送中' : '列印'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
