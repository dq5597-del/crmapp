'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

const money = (v: any) => (v == null || v === '' ? '—' : `NT$ ${Math.round(Number(v) || 0).toLocaleString()}`)

export default function InquiryPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [rRes, iRes, sRes] = await Promise.all([
        supabase.from('inquiries').select('*, vendors(company_name, phone, address)').eq('id', id).maybeSingle(),
        supabase.from('inquiry_items').select('*').eq('inquiry_id', id).order('sort_order'),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setRow(rRes.data); setItems(iRes.data ?? []); setCompany(sRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!row) return <div className="p-10 text-center text-gray-400">找不到這張詢價單</div>

  const total = items.reduce((s, it) => s + (Number(it.vendor_price ?? 0) || 0) * (Number(it.quantity ?? 0) || 0), 0)

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`詢價單_${row.inquiry_no ?? ''}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          {company?.company_phone && <div className="text-xs text-gray-500">TEL：{company.company_phone}</div>}
          <h1 className="text-2xl font-bold mt-3 tracking-widest">詢 價 單</h1>
        </div>

        <table className="w-full text-sm mb-5 border border-gray-300">
          <tbody>
            <tr>
              <Th>詢價單號</Th><Td>{row.inquiry_no ?? '—'}</Td>
              <Th>詢價日期</Th><Td>{row.inquiry_date ?? '—'}</Td>
            </tr>
            <tr>
              <Th>詢價廠商</Th><Td>{row.vendors?.company_name ?? row.vendor_name ?? '—'}</Td>
              <Th>回覆期限</Th><Td>{row.reply_deadline ?? '—'}</Td>
            </tr>
            <tr>
              <Th>聯絡人</Th><Td>{row.contact_name ?? '—'}</Td>
              <Th>電話／Email</Th><Td>{[row.phone, row.email].filter(Boolean).join(' / ') || '—'}</Td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-300 mb-5">
          <thead>
            <tr className="bg-gray-100">
              <Hd className="w-10">#</Hd>
              <Hd>品名／型號</Hd>
              <Hd className="w-16 text-center">數量</Hd>
              <Hd className="w-28 text-right">報價單價</Hd>
              <Hd className="w-28 text-right">小計</Hd>
              <Hd className="w-20 text-center">交期(天)</Hd>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-t border-gray-200">
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="text-gray-900">{it.product_name}</div>
                  {it.model && <div className="text-xs text-gray-400">{it.model}</div>}
                  {it.item_notes && <div className="text-xs text-gray-500">{it.item_notes}</div>}
                </td>
                <td className="px-3 py-2 text-center">{Number(it.quantity ?? 0)} {it.unit ?? ''}</td>
                <td className="px-3 py-2 text-right">{money(it.vendor_price)}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {it.vendor_price != null ? money((Number(it.vendor_price) || 0) * (Number(it.quantity) || 0)) : '—'}
                </td>
                <td className="px-3 py-2 text-center">{it.lead_time_days ?? '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">無詢價品項</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="border-2 border-gray-800 px-5 py-3 flex items-center gap-8">
            <span className="font-bold">已回覆項目合計</span>
            <span className="text-xl font-bold">{money(total)}</span>
          </div>
        </div>

        {row.notes && (
          <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{row.notes}</div>
        )}

        <div className="text-xs text-gray-400 mt-8">狀態：{row.status ?? '—'}　　本詢價單金額未含稅金以外之其他費用，請廠商確認後回覆。</div>
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
