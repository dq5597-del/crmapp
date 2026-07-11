'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Package, Truck, MapPin, CheckCircle, Clock } from 'lucide-react'

const STEPS = [
  { key: '待出貨', label: '備貨中', icon: Package },
  { key: '已出貨', label: '已出貨', icon: Truck },
  { key: '已送達', label: '已送達', icon: MapPin },
  { key: '已簽收', label: '已簽收', icon: CheckCircle },
]

export default function ShipTrackPage() {
  const { token } = useParams<{ token: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('shipments')
      .select('*, clients(company_name)')
      .eq('track_token', token).maybeSingle()
    if (data) {
      const { data: its } = await supabase.from('shipment_items').select('*').eq('shipment_id', data.id).order('seq_no')
      setItems(its ?? [])
    }
    const { data: s } = await supabase.from('system_settings').select('company_name, company_phone').limit(1).maybeSingle()
    setRow(data); setCompany(s); setLoading(false)
  }

  async function sign() {
    if (!name.trim()) { alert('請填寫簽收人姓名'); return }
    setSigning(true)
    const res = await fetch('/api/shipments/sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, signer_name: name, sign_note: note }),
    })
    const data = await res.json()
    setSigning(false)
    if (!res.ok) { alert(data.error ?? '簽收失敗'); return }
    setDone(true)
    load()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">載入中…</div>
  if (!row) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center text-gray-500">
          <Package size={40} className="mx-auto mb-3 text-gray-300" />
          追蹤連結無效或已失效
        </div>
      </div>
    )
  }

  const activeIdx = Math.max(0, STEPS.findIndex(s => s.key === row.status))
  const cancelled = row.status === '取消'
  const signed = !!row.signed_at

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <div className="text-sm text-gray-500">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">出貨進度查詢</h1>
          <div className="text-sm text-gray-400 mt-1">{row.shipment_no}</div>
        </div>

        {cancelled ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5 text-center text-sm mb-5">
            這張出貨單已取消，如有疑問請聯繫我們{company?.company_phone ? `（${company.company_phone}）` : ''}。
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
            <div className="flex items-center justify-between">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const active = i <= activeIdx
                return (
                  <div key={s.key} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && (
                      <div className={`absolute right-1/2 top-4 h-0.5 w-full -z-0 ${i <= activeIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
                    )}
                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      <Icon size={16} />
                    </div>
                    <div className={`text-xs mt-1.5 ${active ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>{s.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5 text-sm space-y-2">
          <Row k="收件人" v={row.receiver_name} />
          <Row k="送貨地址" v={row.address} />
          <Row k="配送方式" v={`${row.delivery_method ?? '—'}${row.carrier ? `（${row.carrier}）` : ''}`} />
          {row.tracking_no && <Row k="託運單號" v={row.tracking_no} />}
          <Row k="出貨日" v={row.ship_date} />
          {row.expected_date && <Row k="預計到貨" v={row.expected_date} />}
          {row.delivered_date && <Row k="實際到貨" v={row.delivered_date} />}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">出貨品項</div>
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.id} className="flex items-center justify-between text-sm border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="text-gray-900">{it.product_name}</div>
                  {it.model && <div className="text-xs text-gray-400">{it.model}</div>}
                </div>
                <div className="text-gray-700 font-medium whitespace-nowrap">
                  {Number(it.quantity ?? 0)} {it.unit ?? ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {signed || done ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <CheckCircle size={28} className="mx-auto text-green-600 mb-2" />
            <div className="text-green-800 font-medium">已完成簽收</div>
            <div className="text-sm text-green-700 mt-1">
              簽收人：{row.signer_name ?? name}
              {row.signed_at && <div className="text-xs mt-0.5">{new Date(row.signed_at).toLocaleString('zh-TW')}</div>}
            </div>
          </div>
        ) : cancelled ? null : row.status === '待出貨' ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center text-sm text-gray-500">
            <Clock size={22} className="mx-auto text-gray-300 mb-2" />
            貨品備妥出貨後，即可在此線上簽收。
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">線上簽收</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="簽收人姓名 *"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm mb-2" />
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="備註（如有短缺或損壞請說明）"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm mb-3" />
            <button onClick={sign} disabled={signing}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
              {signing ? '簽收中…' : '確認簽收'}
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">簽收即表示貨品已點收無誤</p>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 mt-6">
          如有疑問請聯繫 {company?.company_name ?? '光輝影音科技'}
          {company?.company_phone ? `：${company.company_phone}` : ''}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v?: any }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500 shrink-0">{k}</span>
      <span className="text-gray-900 text-right">{v || '—'}</span>
    </div>
  )
}
