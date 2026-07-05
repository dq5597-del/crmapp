'use client'

import { useState } from 'react'
import { Send, CheckCircle } from 'lucide-react'

type PublicItem = {
  id: string
  product_name: string
  model: string | null
  unit: string
  quantity: number
  vendor_price: number | null
  lead_time_days: number | null
  item_notes: string | null
}

export default function RfqFillForm({ token, items: initialItems }: { token: string; items: PublicItem[] }) {
  const [items, setItems] = useState(initialItems.map(i => ({
    ...i,
    price_input: i.vendor_price?.toString() ?? '',
    lead_input: i.lead_time_days?.toString() ?? '',
    notes_input: '',
  })))
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  function setField(idx: number, key: 'price_input' | 'lead_input' | 'notes_input', val: string) {
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, [key]: val }))
  }

  const filledCount = items.filter(i => i.price_input.trim() !== '').length

  async function handleSubmit() {
    if (filledCount === 0) { setError('請至少填寫一項單價'); return }
    if (!confirm('確認送出報價？送出後將無法再修改。')) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`/api/rfq/${token}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(it => ({
            id: it.id,
            vendor_price: it.price_input.trim() === '' ? null : Number(it.price_input),
            lead_time_days: it.lead_input.trim() === '' ? null : Number(it.lead_input),
            item_notes: it.notes_input.trim() || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '送出失敗，請稍後再試')
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
        <CheckCircle size={36} className="text-green-500 mx-auto mb-3" />
        <div className="text-green-700 font-semibold mb-1">報價已送出，感謝您的回覆！</div>
        <div className="text-sm text-green-600">光輝影音科技業務人員將盡快與您聯繫。</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
      <div className="text-sm font-semibold text-gray-700 mb-3">
        報價品項（共 {items.length} 項）
      </div>

      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={it.id} className="border border-gray-100 rounded-xl p-3.5">
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <div>
                <div className="font-medium text-gray-900" style={{ fontSize: 14 }}>
                  {idx + 1}. {it.product_name}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {it.model && <span className="mr-2">型號：{it.model}</span>}
                  數量：{it.quantity} {it.unit}
                  {it.item_notes && <span className="ml-2 text-amber-600">{it.item_notes}</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">未稅單價 (NT$)</label>
                <input
                  type="number" inputMode="decimal" min={0}
                  value={it.price_input}
                  onChange={e => setField(idx, 'price_input', e.target.value)}
                  placeholder="請填寫"
                  className="w-full px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: 14, minHeight: 44 }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">交期（天）</label>
                <input
                  type="number" inputMode="numeric" min={0}
                  value={it.lead_input}
                  onChange={e => setField(idx, 'lead_input', e.target.value)}
                  placeholder="選填"
                  className="w-full px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: 14, minHeight: 44 }}
                />
              </div>
              <div className="col-span-2">
                <input
                  value={it.notes_input}
                  onChange={e => setField(idx, 'notes_input', e.target.value)}
                  placeholder="備註（選填，如：缺貨需調貨、含運費）"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: 13, minHeight: 40 }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium disabled:opacity-50"
        style={{ minHeight: 48, fontSize: 15 }}
      >
        <Send size={16} /> {submitting ? '送出中...' : `送出報價（已填 ${filledCount}/${items.length} 項）`}
      </button>
      <div className="text-xs text-gray-400 text-center mt-2">送出後將無法修改，如需更正請聯絡業務人員</div>
    </div>
  )
}
