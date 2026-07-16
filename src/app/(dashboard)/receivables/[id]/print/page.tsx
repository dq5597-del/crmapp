'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

const money = (v: any) => `NT$ ${Math.round(Number(v ?? 0) || 0).toLocaleString()}`

export default function ReceivablePrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [rRes, sRes] = await Promise.all([
        supabase.from('receivables')
          .select('*, clients(company_name, phone, address, tax_id), sales_orders(order_no, project_name)')
          .eq('id', id).maybeSingle(),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setRow(rRes.data); setCompany(sRes.data)
      const { data: pay } = await supabase.from('payment_records').select('*').eq('receivable_id', id).order('payment_date')
      setPayments(pay ?? [])
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!row) return <div className="p-10 text-center text-gray-400">找不到這筆應收帳款</div>

  const c = row.clients ?? {}

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`應收對帳單_${c.company_name ?? ''}_${row.receivable_no ?? ''}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          {company?.company_address && <div className="text-xs text-gray-500 mt-0.5">{company.company_address}</div>}
          {company?.company_phone && <div className="text-xs text-gray-500">TEL：{company.company_phone}</div>}
          <h1 className="text-2xl font-bold mt-3 tracking-widest">應 收 對 帳 單</h1>
        </div>

        <table className="w-full text-sm mb-5 border border-gray-300">
          <tbody>
            <tr>
              <Th>對帳單號</Th><Td>{row.receivable_no ?? '—'}</Td>
              <Th>單位名稱</Th><Td>{c.company_name ?? '—'}</Td>
            </tr>
            <tr>
              <Th>統一編號</Th><Td>{c.tax_id ?? '—'}</Td>
              <Th>電話</Th><Td>{c.phone ?? '—'}</Td>
            </tr>
            <tr>
              <Th>發票號碼</Th><Td>{row.invoice_no ?? '—'}</Td>
              <Th>發票日期</Th><Td>{row.invoice_date ?? '—'}</Td>
            </tr>
            <tr>
              <Th>關聯銷貨單</Th><Td>{row.sales_orders?.order_no ?? '—'}</Td>
              <Th>到期日</Th><Td>{row.due_date ?? '—'}</Td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-300 mb-5">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="px-4 py-3 bg-gray-50 text-gray-600 w-1/3">應收金額（含稅）</td>
              <td className="px-4 py-3 text-right font-semibold">{money(row.amount)}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="px-4 py-3 bg-gray-50 text-gray-600">已收金額</td>
              <td className="px-4 py-3 text-right text-green-700">{money(row.received_amount)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 bg-gray-50 font-bold">未收餘額</td>
              <td className="px-4 py-3 text-right text-xl font-bold">{money(row.balance)}</td>
            </tr>
          </tbody>
        </table>

        {payments.length > 0 && (
          <>
            <div className="text-sm font-semibold mb-2">收款紀錄</div>
            <table className="w-full text-sm border border-gray-300 mb-6">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">收款日</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">方式</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-300">金額</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">備註</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-t border-gray-200">
                    <td className="px-3 py-2">{p.payment_date ?? '—'}</td>
                    <td className="px-3 py-2">{p.payment_method ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(p.amount)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{p.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {company?.bank_account && (
          <div className="text-sm text-gray-700 border border-gray-300 px-4 py-3 mb-6">
            <span className="font-semibold">匯款資訊：</span>{company.bank_account}
          </div>
        )}

        {row.notes && <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{row.notes}</div>}

        <div className="grid grid-cols-2 gap-10 mt-12 text-sm">
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">本公司蓋章</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">單位對帳簽收</div>
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
