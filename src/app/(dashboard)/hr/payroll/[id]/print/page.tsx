'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

const money = (v: any) => `NT$ ${Math.round(Number(v ?? 0) || 0).toLocaleString()}`

export default function PayslipPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [row, setRow] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [pRes, sRes] = await Promise.all([
        supabase.from('hr_payrolls')
          .select('*, hr_employees(full_name, employee_no, department, title, bank_account)')
          .eq('id', id).maybeSingle(),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setRow(pRes.data ?? null)
      setCompany(sRes.data ?? null)
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!row) return <div className="p-10 text-center text-gray-400">找不到這筆薪資單</div>

  const e = row.hr_employees ?? {}
  const earnings: [string, any][] = [
    ['底薪', row.base_salary],
    [`加班費（${Number(row.overtime_hours ?? 0)} 小時）`, row.overtime_pay],
    ['津貼', row.allowance],
    ['獎金', row.bonus],
    ['其他加項', row.other_add],
  ]
  const deductions: [string, any][] = [
    ['勞保 + 就業保險', row.labor_insurance],
    ['健保', row.health_insurance],
    ['請假扣款', row.leave_deduction],
    ['代扣所得稅', row.tax],
    ['其他扣項', row.other_deduct],
  ]

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`薪資單_${e.full_name ?? ''}_${row.period}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold text-gray-900">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-2xl font-bold mt-2 tracking-widest">薪 資 單</h1>
          <div className="text-sm text-gray-500 mt-1">薪資期間：{row.period}</div>
        </div>

        <table className="w-full text-sm mb-6 border border-gray-300">
          <tbody>
            <tr>
              <Th>姓名</Th><Td>{e.full_name ?? '—'}</Td>
              <Th>員工編號</Th><Td>{e.employee_no ?? '—'}</Td>
            </tr>
            <tr>
              <Th>部門</Th><Td>{e.department ?? '—'}</Td>
              <Th>職稱</Th><Td>{e.title ?? '—'}</Td>
            </tr>
            <tr>
              <Th>投保薪資</Th><Td>{money(row.insurance_salary)}</Td>
              <Th>發放日</Th><Td>{row.pay_date ?? '—'}</Td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-gray-300">
            <div className="bg-gray-100 px-3 py-2 text-sm font-semibold border-b border-gray-300">應發項目</div>
            <table className="w-full text-sm">
              <tbody>
                {earnings.map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-200 last:border-0">
                    <td className="px-3 py-2 text-gray-600">{k}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{money(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between px-3 py-2 bg-gray-50 border-t border-gray-300 font-semibold">
              <span>應發合計</span><span>{money(row.gross_pay)}</span>
            </div>
          </div>

          <div className="border border-gray-300">
            <div className="bg-gray-100 px-3 py-2 text-sm font-semibold border-b border-gray-300">應扣項目</div>
            <table className="w-full text-sm">
              <tbody>
                {deductions.map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-200 last:border-0">
                    <td className="px-3 py-2 text-gray-600">{k}</td>
                    <td className="px-3 py-2 text-right text-gray-900">{money(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between px-3 py-2 bg-gray-50 border-t border-gray-300 font-semibold">
              <span>應扣合計</span><span>{money(row.total_deduction)}</span>
            </div>
          </div>
        </div>

        <div className="border-2 border-gray-800 px-5 py-4 flex items-center justify-between mb-6">
          <span className="text-base font-bold">實發金額</span>
          <span className="text-2xl font-bold">{money(row.net_pay)}</span>
        </div>

        <div className="border border-gray-300 mb-6">
          <div className="bg-gray-100 px-3 py-2 text-sm font-semibold border-b border-gray-300">雇主負擔（公司成本，非薪資扣款）</div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-3 py-2 text-gray-600">雇主勞保／就保</td>
                <td className="px-3 py-2 text-right">{money(row.employer_labor)}</td>
                <td className="px-3 py-2 text-gray-600">雇主健保</td>
                <td className="px-3 py-2 text-right">{money(row.employer_health)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-600">勞退提繳（6%）</td>
                <td className="px-3 py-2 text-right">{money(row.employer_pension)}</td>
                <td className="px-3 py-2 text-gray-600">合計</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {money(Number(row.employer_labor ?? 0) + Number(row.employer_health ?? 0) + Number(row.employer_pension ?? 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {row.notes && (
          <div className="text-sm text-gray-600 mb-6">
            <span className="font-semibold">備註：</span>{row.notes}
          </div>
        )}

        <div className="grid grid-cols-2 gap-10 mt-12 text-sm">
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">雇主／人資簽章</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">員工簽收</div>
        </div>

        <div className="text-xs text-gray-400 mt-8 text-center">
          本薪資單為機密文件，請妥善保管。如有疑問請洽人資部門。
        </div>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <td className="bg-gray-100 border border-gray-300 px-3 py-2 text-gray-600 w-[110px]">{children}</td>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-gray-300 px-3 py-2 text-gray-900">{children}</td>
}
