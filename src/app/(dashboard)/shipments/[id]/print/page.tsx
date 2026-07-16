'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

export default function ShipmentPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [sRes, iRes, cRes] = await Promise.all([
        supabase.from('shipments')
          .select('*, clients(company_name, phone, address, tax_id), sales_orders(order_no)')
          .eq('id', id).maybeSingle(),
        supabase.from('shipment_items').select('*').eq('shipment_id', id).order('seq_no'),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setRow(sRes.data); setItems(iRes.data ?? []); setCompany(cRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!row) return <div className="p-10 text-center text-gray-400">找不到這張出貨單</div>

  const c = row.clients ?? {}

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`送貨單_${row.shipment_no ?? ''}_${c.company_name ?? ''}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          {company?.company_address && <div className="text-xs text-gray-500 mt-0.5">{company.company_address}</div>}
          {company?.company_phone && <div className="text-xs text-gray-500">TEL：{company.company_phone}</div>}
          <h1 className="text-2xl font-bold mt-3 tracking-widest">送 貨 單</h1>
        </div>

        <table className="w-full text-sm mb-5 border border-gray-300">
          <tbody>
            <tr>
              <Th>出貨單號</Th><Td>{row.shipment_no}</Td>
              <Th>出貨日期</Th><Td>{row.ship_date ?? '—'}</Td>
            </tr>
            <tr>
              <Th>單位名稱</Th><Td>{c.company_name ?? '—'}</Td>
              <Th>來源銷貨單</Th><Td>{row.sales_orders?.order_no ?? '—'}</Td>
            </tr>
            <tr>
              <Th>收件人</Th><Td>{row.receiver_name ?? '—'}</Td>
              <Th>收件電話</Th><Td>{row.receiver_phone ?? c.phone ?? '—'}</Td>
            </tr>
            <tr>
              <Th>送貨地址</Th>
              <td className="border border-gray-300 px-3 py-2 text-gray-900" colSpan={3}>{row.address ?? c.address ?? '—'}</td>
            </tr>
            <tr>
              <Th>配送方式</Th><Td>{row.delivery_method ?? '—'}{row.carrier ? `（${row.carrier}）` : ''}</Td>
              <Th>託運單號</Th><Td>{row.tracking_no ?? '—'}</Td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-300 mb-6">
          <thead>
            <tr className="bg-gray-100">
              <Hd className="w-10">#</Hd>
              <Hd>品名</Hd>
              <Hd className="w-32">型號</Hd>
              <Hd className="w-20 text-center">數量</Hd>
              <Hd className="w-16 text-center">單位</Hd>
              <Hd>備註</Hd>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-t border-gray-200">
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2 text-gray-900">{it.product_name}</td>
                <td className="px-3 py-2 text-gray-600">{it.model ?? '—'}</td>
                <td className="px-3 py-2 text-center font-medium">{Number(it.quantity ?? 0)}</td>
                <td className="px-3 py-2 text-center text-gray-600">{it.unit ?? '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{it.item_notes ?? ''}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">無出貨品項</td></tr>}
          </tbody>
        </table>

        {row.notes && <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{row.notes}</div>}

        {row.signed_at && (
          <div className="border border-green-300 bg-green-50 px-4 py-3 text-sm mb-6">
            已於 {new Date(row.signed_at).toLocaleString('zh-TW')} 由 <b>{row.signer_name}</b> 線上簽收
            {row.sign_note ? `（${row.sign_note}）` : ''}
          </div>
        )}

        <div className="grid grid-cols-3 gap-8 mt-12 text-sm">
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">出貨人</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">送貨人</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">單位簽收</div>
        </div>

        <div className="text-xs text-gray-400 mt-8 text-center">
          貨品請當面點收，如有短缺或損壞請於收貨後 3 日內告知。
        </div>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <td className="bg-gray-100 border border-gray-300 px-3 py-2 text-gray-600 w-[90px]">{children}</td>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-gray-300 px-3 py-2 text-gray-900">{children}</td>
}
function Hd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300 ${className}`}>{children}</th>
}
