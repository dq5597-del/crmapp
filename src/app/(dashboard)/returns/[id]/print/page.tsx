'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

const money = (v: any) => `NT$ ${Math.round(Number(v ?? 0) || 0).toLocaleString()}`

export default function ReturnPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [rRes, iRes, sRes] = await Promise.all([
        supabase.from('returns').select('*, clients(company_name, phone, address), vendors(company_name, phone, address)').eq('id', id).maybeSingle(),
        supabase.from('return_items').select('*').eq('return_id', id).order('seq_no'),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setRow(rRes.data); setItems(iRes.data ?? []); setCompany(sRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!row) return <div className="p-10 text-center text-gray-400">找不到這張退貨單</div>

  const party = row.clients ?? row.vendors
  const fileName = `退貨單_${row.return_no ?? ''}`

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={fileName} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          {company?.company_address && <div className="text-xs text-gray-500 mt-0.5">{company.company_address}</div>}
          {company?.company_phone && <div className="text-xs text-gray-500">TEL：{company.company_phone}</div>}
          <h1 className="text-2xl font-bold mt-3 tracking-widest">退 貨 單</h1>
        </div>

        <table className="w-full text-sm mb-5 border border-gray-300">
          <tbody>
            <tr>
              <Th>退貨單號</Th><Td>{row.return_no ?? '—'}</Td>
              <Th>退貨類型</Th><Td>{row.return_type ?? '—'}</Td>
            </tr>
            <tr>
              <Th>{row.return_type === '供應商退貨' ? '廠商' : '客戶'}</Th><Td>{party?.company_name ?? '—'}</Td>
              <Th>電話</Th><Td>{party?.phone ?? '—'}</Td>
            </tr>
            <tr>
              <Th>退貨日期</Th><Td>{row.return_date ?? '—'}</Td>
              <Th>關聯單據</Th><Td>{row.ref_doc_no ?? '—'}</Td>
            </tr>
            <tr>
              <Th>退貨原因</Th><Td>{row.return_reason ?? '—'}</Td>
              <Th>結算方式</Th><Td>{row.settlement_method ?? '—'}</Td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-300 mb-5">
          <thead>
            <tr className="bg-gray-100">
              <Hd className="w-10">#</Hd>
              <Hd>品名／型號</Hd>
              <Hd className="w-16 text-center">數量</Hd>
              <Hd className="w-24 text-right">單價</Hd>
              <Hd className="w-28 text-right">小計</Hd>
              <Hd className="w-20 text-center">狀況</Hd>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-t border-gray-200">
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="text-gray-900">{it.product_name}</div>
                  {it.model && <div className="text-xs text-gray-400">{it.model}</div>}
                  {it.reason && <div className="text-xs text-gray-500">原因：{it.reason}</div>}
                </td>
                <td className="px-3 py-2 text-center">{Number(it.quantity ?? 0)} {it.unit ?? ''}</td>
                <td className="px-3 py-2 text-right">{money(it.unit_price)}</td>
                <td className="px-3 py-2 text-right font-medium">{money(it.amount)}</td>
                <td className="px-3 py-2 text-center text-xs">{it.item_condition ?? '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">無退貨品項</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="border-2 border-gray-800 px-5 py-3 flex items-center gap-8">
            <span className="font-bold">退貨總金額（含稅）</span>
            <span className="text-xl font-bold">{money(row.total_amount)}</span>
          </div>
        </div>

        {row.notes && (
          <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{row.notes}</div>
        )}

        <div className="grid grid-cols-3 gap-8 mt-12 text-sm">
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">經辦人</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">主管核准</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">退貨方簽收</div>
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
