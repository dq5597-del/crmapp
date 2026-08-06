'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

type Line = {
  work_date: string
  project_name: string
  work_item: string | null
  hours: number
  rate_type: string
  rate: number
  cost: number
}

const n = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$ ${Math.round(n(v)).toLocaleString()}`
const hf = (v: any) => (Math.round(n(v) * 10) / 10).toLocaleString('zh-TW')

export default function WorkHourConfirmationPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [cRes, sRes] = await Promise.all([
        supabase.from('work_hour_confirmations').select('*').eq('id', id).maybeSingle(),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setRow(cRes.data); setCompany(sRes.data)
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!row) return <div className="p-10 text-center text-gray-400">找不到這張確認單</div>

  const detail: Line[] = row.detail ?? []

  const Th = ({ children, className = '' }: any) => (
    <th className={`border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs font-medium ${className}`}>{children}</th>
  )
  const Td = ({ children, className = '' }: any) => (
    <td className={`border border-gray-300 px-2 py-1.5 text-xs ${className}`}>{children}</td>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`工時確認單_${row.person_name}_${row.period_month}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        {/* 抬頭 */}
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          {company?.company_address && <div className="text-xs text-gray-500 mt-0.5">{company.company_address}</div>}
          {company?.company_phone && <div className="text-xs text-gray-500">TEL：{company.company_phone}</div>}
          <h1 className="text-2xl font-bold mt-3 tracking-widest">工 時 確 認 單</h1>
          {row.status === '作廢' && (
            <div className="mt-2 inline-block px-3 py-1 border-2 border-gray-400 text-gray-500 text-sm tracking-widest">
              作　廢
            </div>
          )}
        </div>

        {/* 基本資料 */}
        <table className="w-full border-collapse mb-4">
          <tbody>
            <tr>
              <Th className="w-24 text-left">姓名</Th>
              <Td className="font-semibold">{row.person_name}</Td>
              <Th className="w-24 text-left">身分</Th>
              <Td>{row.member_kind ?? '—'}</Td>
            </tr>
            <tr>
              <Th className="text-left">結算期間</Th>
              <Td>{row.period_month}</Td>
              <Th className="text-left">出工天數</Th>
              <Td>{row.work_days} 天／{row.project_count} 個專案</Td>
            </tr>
          </tbody>
        </table>

        {/* 明細 */}
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr>
              <Th className="w-8">#</Th>
              <Th className="w-24">日期</Th>
              <Th className="text-left">專案</Th>
              <Th className="text-left">施工項目</Th>
              <Th className="w-16">工時</Th>
              <Th className="w-20">計價</Th>
              <Th className="w-24">金額</Th>
            </tr>
          </thead>
          <tbody>
            {detail.map((d, i) => (
              <tr key={i}>
                <Td className="text-center text-gray-400">{i + 1}</Td>
                <Td className="text-center whitespace-nowrap">{d.work_date}</Td>
                <Td>{d.project_name}</Td>
                <Td className="text-gray-500">{d.work_item ?? '—'}</Td>
                <Td className="text-center tabular-nums">{hf(d.hours)}</Td>
                <Td className="text-center text-gray-500">{d.rate_type}</Td>
                <Td className="text-right tabular-nums">{money(d.cost)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <Td className="text-right font-semibold bg-gray-50" colSpan={4}>合計</Td>
              <Td className="text-center font-semibold bg-gray-50 tabular-nums">{hf(row.total_hours)}</Td>
              <Td className="bg-gray-50" />
              <Td className="text-right font-bold bg-gray-50 tabular-nums">{money(row.total_cost)}</Td>
            </tr>
          </tfoot>
        </table>

        {/* 備註 */}
        {row.sign_note && (
          <div className="border border-gray-300 p-3 mb-4">
            <div className="text-xs text-gray-500 mb-1">簽名人備註</div>
            <div className="text-sm whitespace-pre-wrap">{row.sign_note}</div>
          </div>
        )}

        {/* 確認聲明與簽名 */}
        <div className="border border-gray-300 p-4">
          <p className="text-xs text-gray-600 leading-relaxed mb-4">
            本人確認上列 {row.period_month} 之出工日期、工時與金額均與實際相符，並同意以此作為當期工資／工程款計算依據。
          </p>
          <div className="flex items-end gap-8">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">簽名</div>
              <div className="border-b border-gray-400 h-20 flex items-end">
                {row.signature_data && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.signature_data} alt="簽名" style={{ maxHeight: 76, maxWidth: '100%' }} />
                )}
              </div>
              {row.signer_name && (
                <div className="text-xs text-gray-600 mt-1">簽名人：{row.signer_name}</div>
              )}
            </div>
            <div className="w-48">
              <div className="text-xs text-gray-500 mb-1">簽名日期</div>
              <div className="border-b border-gray-400 h-20 flex items-end pb-1 text-sm">
                {row.signed_at ? new Date(row.signed_at).toLocaleDateString('zh-TW') : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-gray-400 mt-4 text-center">
          單據編號 {String(row.id).slice(0, 8).toUpperCase()}　·　列印時間 {new Date().toLocaleString('zh-TW')}
        </div>
      </div>
    </div>
  )
}
