'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

const num = (v: any) => Number(v ?? 0) || 0
const DIMS = [
  { key: 'financial', label: '財務構面', hint: '營收 / 毛利 / 成本達成' },
  { key: 'customer', label: '顧客構面', hint: '單位滿意度 / 回購 / 新客開發' },
  { key: 'process', label: '內部流程', hint: '交期 / 品質 / 錯誤率' },
  { key: 'learning', label: '學習與成長', hint: '技能 / 證照 / 知識分享' },
]

export default function ReviewPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [r, setR] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [rRes, sRes] = await Promise.all([
        supabase.from('hr_reviews').select('*, hr_employees(full_name, employee_no, department, title)').eq('id', id).maybeSingle(),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setR(rRes.data); setCompany(sRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!r) return <div className="p-10 text-center text-gray-400">找不到這筆考評（或你沒有人資權限）</div>

  const e = r.hr_employees ?? {}

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`績效考評表_${e.full_name ?? ''}_${r.period}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-2xl font-bold mt-3 tracking-widest">績 效 考 評 表</h1>
          <div className="text-xs text-gray-500 mt-1">平衡計分卡（BSC）四構面</div>
        </div>

        <table className="w-full text-sm mb-5 border border-gray-300">
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
              <Th>考評期間</Th><Td>{r.period}</Td>
              <Th>考評類型</Th><Td>{r.review_type}</Td>
            </tr>
            <tr>
              <Th>考評主管</Th><Td>{r.reviewer ?? '—'}</Td>
              <Th>考評日期</Th><Td>{r.review_date ?? '—'}</Td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-sm border border-gray-300 mb-5">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">構面</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">衡量重點</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 border-b border-gray-300 w-20">分數</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 border-b border-gray-300 w-20">權重</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-300 w-24">加權得分</th>
            </tr>
          </thead>
          <tbody>
            {DIMS.map(d => {
              const score = num(r[`score_${d.key}`])
              const w = num(r[`weight_${d.key}`])
              return (
                <tr key={d.key} className="border-t border-gray-200">
                  <td className="px-3 py-2 font-medium text-gray-900">{d.label}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{d.hint}</td>
                  <td className="px-3 py-2 text-center">{score}</td>
                  <td className="px-3 py-2 text-center">{w}%</td>
                  <td className="px-3 py-2 text-right font-medium">{Math.round(score * w) / 100}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="border-2 border-gray-800 px-5 py-4 flex items-center justify-between mb-6">
          <span className="font-bold">加權總分</span>
          <span className="flex items-center gap-4">
            <span className="text-2xl font-bold">{num(r.total_score)}</span>
            <span className="text-lg font-bold border border-gray-800 px-3 py-0.5">{r.grade ?? '—'}</span>
          </span>
        </div>

        <Block title="下期目標（MBO）" text={r.goals} />
        <Block title="優勢" text={r.strengths} />
        <Block title="待改善" text={r.improvements} />
        <Block title="員工自評／回覆" text={r.employee_comment} />

        <div className="grid grid-cols-3 gap-8 mt-12 text-sm">
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">受評人簽名</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">考評主管</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">總經理核定</div>
        </div>
      </div>
    </div>
  )
}

function Block({ title, text }: { title: string; text?: string | null }) {
  return (
    <div className="mb-4 border border-gray-300">
      <div className="bg-gray-100 px-3 py-1.5 text-sm font-semibold border-b border-gray-300">{title}</div>
      <div className="px-3 py-3 text-sm text-gray-800 min-h-[60px] whitespace-pre-wrap">{text || ''}</div>
    </div>
  )
}
function Th({ children }: { children: React.ReactNode }) {
  return <td className="bg-gray-100 border border-gray-300 px-3 py-2 text-gray-600 w-[100px]">{children}</td>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-gray-300 px-3 py-2 text-gray-900">{children}</td>
}
