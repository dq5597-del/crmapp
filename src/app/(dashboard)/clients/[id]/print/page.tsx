'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

export default function ClientCardPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [c, setC] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [cRes, ctRes, pRes, sRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).maybeSingle(),
        supabase.from('contacts').select('*').eq('client_id', id).order('seq_no'),
        supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false }),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setC(cRes.data); setContacts(ctRes.data ?? []); setProjects(pRes.data ?? []); setCompany(sRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!c) return <div className="p-10 text-center text-gray-400">找不到這個客戶</div>

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden">
        <PrintDocButtons fileName={`客戶資料卡_${c.company_name ?? ''}`} />
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-2xl font-bold mt-3 tracking-widest">客 戶 資 料 卡</h1>
        </div>

        <table className="w-full text-sm border border-gray-300 mb-5">
          <tbody>
            <tr><Th>客戶名稱</Th><Td>{c.company_name ?? '—'}</Td><Th>狀態</Th><Td>{c.status ?? '—'}</Td></tr>
            <tr><Th>主要聯絡人</Th><Td>{c.contact_name ?? '—'}</Td><Th>電話</Th><Td>{c.phone ?? '—'}</Td></tr>
            <tr><Th>Email</Th><Td>{c.email ?? '—'}</Td><Th>LINE ID</Th><Td>{c.line_id ?? '—'}</Td></tr>
            <tr><Th>地址</Th><Td>{c.address ?? '—'}</Td><Th>生日</Th><Td>{c.birthday ?? '—'}</Td></tr>
            <tr><Th>服務週期</Th><Td>{c.service_cycle_months ? `${c.service_cycle_months} 個月` : '—'}</Td><Th>上次服務</Th><Td>{c.last_service_date ?? '—'}</Td></tr>
            <tr><Th>下次拜訪</Th><Td>{c.next_visit_date ?? '—'}</Td><Th>DM 提供</Th><Td>{c.dm_provided ? '是' : '否'}</Td></tr>
            <tr><Th>興趣／喜好</Th><td className="border border-gray-300 px-3 py-2 text-gray-900" colSpan={3}>{c.interest ?? '—'}</td></tr>
          </tbody>
        </table>

        {contacts.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-semibold mb-2">聯絡人</div>
            <table className="w-full text-sm border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <Hd>姓名</Hd><Hd>職稱</Hd><Hd>電話</Hd><Hd>Email</Hd><Hd>備註</Hd>
                </tr>
              </thead>
              <tbody>
                {contacts.map(ct => (
                  <tr key={ct.id} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-gray-900">{ct.name}</td>
                    <td className="px-3 py-2 text-gray-600">{ct.title ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{ct.phone ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{ct.email ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{ct.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {projects.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-semibold mb-2">專案紀錄</div>
            <table className="w-full text-sm border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <Hd>專案名稱</Hd><Hd>狀態</Hd><Hd>施工／完工</Hd><Hd className="text-right">預算</Hd>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} className="border-t border-gray-200">
                    <td className="px-3 py-2 text-gray-900">{p.project_name}</td>
                    <td className="px-3 py-2 text-gray-600">{p.status}</td>
                    <td className="px-3 py-2 text-gray-500">{p.start_date ?? '—'}{p.end_date ? ` ~ ${p.end_date}` : ''}</td>
                    <td className="px-3 py-2 text-right">{p.budget != null ? `NT$${Number(p.budget).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {c.notes && <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{c.notes}</div>}

        <div className="text-xs text-gray-400 mt-8 text-center">本表含客戶個人資料，請依個資法妥善保管。</div>
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
