'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

export default function VendorCardPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [v, setV] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showBank, setShowBank] = useState(false)

  useEffect(() => {
    (async () => {
      const [vRes, oRes, sRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', id).maybeSingle(),
        supabase.from('purchase_orders').select('order_no, total_amount, status, created_at').eq('vendor_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setV(vRes.data); setOrders(oRes.data ?? []); setCompany(sRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!v) return <div className="p-10 text-center text-gray-400">找不到這個廠商</div>

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden flex items-center gap-3 flex-wrap">
        <PrintDocButtons fileName={`廠商資料卡_${v.company_name ?? ''}`} />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showBank} onChange={e => setShowBank(e.target.checked)} />
          列印時顯示銀行帳戶
        </label>
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-2xl font-bold mt-3 tracking-widest">廠 商 資 料 卡</h1>
        </div>

        <table className="w-full text-sm border border-gray-300 mb-5">
          <tbody>
            <tr><Th>廠商名稱</Th><Td>{v.company_name ?? '—'}</Td><Th>廠商代號</Th><Td>{v.vendor_code ?? '—'}</Td></tr>
            <tr><Th>統一編號</Th><Td>{v.tax_id ?? '—'}</Td><Th>分類</Th><Td>{v.category ?? '—'}</Td></tr>
            <tr><Th>聯絡人</Th><Td>{v.contact_name ?? '—'}</Td><Th>電話</Th><Td>{v.phone ?? '—'}</Td></tr>
            <tr><Th>傳真</Th><Td>{v.fax ?? '—'}</Td><Th>Email</Th><Td>{v.email ?? '—'}</Td></tr>
            <tr><Th>地址</Th><td className="border border-gray-300 px-3 py-2 text-gray-900" colSpan={3}>{v.address ?? '—'}</td></tr>
            <tr><Th>付款條件</Th><Td>{v.payment_terms ?? '—'}</Td><Th>狀態</Th><Td>{v.is_active ? '合作中' : '停用'}</Td></tr>
            <tr>
              <Th>銀行</Th><Td>{showBank ? (v.bank_name ?? '—') : '＊＊＊＊'}</Td>
              <Th>帳號</Th><Td>{showBank ? ([v.bank_account_name, v.bank_account].filter(Boolean).join(' / ') || '—') : '＊＊＊＊＊＊'}</Td>
            </tr>
          </tbody>
        </table>

        {orders.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-semibold mb-2">近期訂購紀錄（最多 20 筆）</div>
            <table className="w-full text-sm border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <Hd>訂購單號</Hd><Hd>建立日期</Hd><Hd>狀態</Hd><Hd className="text-right">金額</Hd>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.order_no} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-gray-900">{o.order_no}</td>
                    <td className="px-3 py-2 text-gray-500">{o.created_at?.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-gray-600">{o.status}</td>
                    <td className="px-3 py-2 text-right">NT${Math.round(Number(o.total_amount ?? 0)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {v.notes && <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{v.notes}</div>}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <td className="bg-gray-100 border border-gray-300 px-3 py-2 text-gray-600 w-[100px]">{children}</td>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-gray-300 px-3 py-2 text-gray-900">{children}</td>
}
function Hd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300 ${className}`}>{children}</th>
}
