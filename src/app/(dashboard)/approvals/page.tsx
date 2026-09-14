'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, FileSignature, Settings2 } from 'lucide-react'

const money = (value: unknown) => `NT$${Math.round(Number(value ?? 0)).toLocaleString()}`
const DOC_LINK: Record<string, (id: string) => string> = {
  payable: id => `/payables/${id}`,
  quote: id => `/quotes/${id}`,
  purchase_order: id => `/purchase-orders/${id}`,
  leave: () => '/hr/leaves',
  expense_claim: id => `/expense-claims?open=${id}`,
  payroll: id => `/hr/payroll?open=${id}`,
}
const DOC_LABEL: Record<string, string> = {
  payable: '應付帳款', quote: '報價單／折讓', purchase_order: '訂購單', leave: '請假申請', expense_claim: '員工報銷', payroll: '薪資／獎金',
}

export default function ApprovalsCenter() {
  const [pending, setPending] = useState<any[]>([])
  const [flows, setFlows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/approvals/pending').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/approvals/flows').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([p, f]) => { setPending(p.data ?? []); setFlows(f.data ?? []); setLoading(false) })
  }, [])

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  return <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      <FileSignature size={22} className="text-rose-600" />
      <h1 className="text-xl font-bold text-gray-900">BPM／簽呈中心</h1>
      <Link href="/approvals/authority" className="ml-auto px-3 py-2 rounded-xl bg-gray-900 text-white text-sm">核決權限與流程引擎</Link>
    </div>

    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-3">待我簽核（{pending.length} 件）</h2>
      {pending.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">目前沒有待你簽核的單據</div> : <div className="space-y-1.5">{pending.map(x => <Link key={x.instance_id} href={DOC_LINK[x.doc_type]?.(x.doc_id) ?? '#'} className="flex items-center gap-3 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 hover:border-amber-400">
        <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-700 shrink-0">{DOC_LABEL[x.doc_type] ?? x.doc_type}</span>
        <span className="font-medium shrink-0">{x.doc_no}</span><span className="text-xs text-gray-500">申請人：{x.submitted_by_name}</span><span className="flex-1" /><span className="font-semibold">{money(x.amount)}</span><ChevronRight size={14} />
      </Link>)}</div>}
    </section>

    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
      <div className="flex items-center gap-2 font-semibold text-gray-900"><Settings2 size={16} />已啟用流程</div>
      <p className="text-xs text-gray-400 my-3">所有條件與多級關卡集中在核決權限與流程引擎，避免兩套設定互相覆蓋。</p>
      <div className="flex flex-wrap gap-2">{flows.filter(f => f.enabled).map(f => <span key={f.doc_type} className="text-xs px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg">{f.label} · {f.rule_count} 條核決規則</span>)}</div>
    </section>
  </div>
}
