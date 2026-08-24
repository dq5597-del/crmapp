'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PrintDocButtons from '@/components/PrintDocButtons'

export default function EmployeeCardPrintPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [e, setE] = useState<any>(null)
  const [trainings, setTrainings] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showSensitive, setShowSensitive] = useState(false)

  useEffect(() => {
    (async () => {
      const [eRes, tRes, sRes] = await Promise.all([
        supabase.from('hr_employees').select('*').eq('id', id).maybeSingle(),
        supabase.from('hr_trainings').select('*').eq('employee_id', id).order('start_date', { ascending: false }),
        supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      ])
      setE(eRes.data); setTrainings(tRes.data ?? []); setCompany(sRes.data); setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>
  if (!e) return <div className="p-10 text-center text-gray-400">找不到這位員工（或你沒有人資權限）</div>

  const mask = (v: any) => (showSensitive ? (v ?? '—') : '＊＊＊＊＊＊')

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-[820px] mx-auto px-4 mb-4 print:hidden flex items-center gap-3 flex-wrap">
        <PrintDocButtons fileName={`員工資料卡_${e.full_name ?? ''}`} />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showSensitive} onChange={ev => setShowSensitive(ev.target.checked)} />
          列印時顯示敏感資料（身分證／銀行帳戶／薪資）
        </label>
      </div>

      <div id="print-page-content" className="max-w-[820px] mx-auto bg-white p-10 shadow print:shadow-none">
        <div className="text-center mb-6">
          <div className="text-lg font-bold">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-2xl font-bold mt-3 tracking-widest">員 工 資 料 卡</h1>
        </div>

        <Section title="基本資料">
          <Row k="姓名" v={e.full_name} k2="員工編號" v2={e.employee_no} />
          <Row k="身分證字號" v={mask(e.id_number)} k2="性別" v2={e.gender} />
          <Row k="出生日期" v={e.birth_date} k2="到職日" v2={e.hire_date} />
          <Row k="電話" v={e.phone} k2="Email" v2={e.email} />
          <Row k="通訊地址" v={e.address} k2="狀態" v2={e.status} />
        </Section>

        <Section title="任職資訊">
          <Row k="部門" v={e.department} k2="職稱" v2={e.title} />
          <Row k="僱用型態" v={e.employment_type} k2="離職日" v2={e.resign_date} />
          <Row k="勞保證號" v={e.labor_insurance_no} k2="健保證號" v2={e.health_insurance_no} />
          <Row k="月薪" v={showSensitive && e.base_salary != null ? `NT$${Number(e.base_salary).toLocaleString()}` : '＊＊＊＊＊＊'}
               k2="銀行帳戶" v2={showSensitive ? [e.bank_name, e.bank_account].filter(Boolean).join(' ') || '—' : '＊＊＊＊＊＊'} />
        </Section>

        <Section title="緊急聯絡人">
          <Row k="姓名" v={e.emergency_contact} k2="關係" v2={e.emergency_relation} />
          <Row k="電話" v={e.emergency_phone} k2="" v2="" />
        </Section>

        {trainings.length > 0 && (
          <div className="mb-6">
            <div className="text-sm font-semibold mb-2">教育訓練與證照</div>
            <table className="w-full text-sm border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">課程／證照</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">類別</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">期間</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-300">時數</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-300">狀態／到期</th>
                </tr>
              </thead>
              <tbody>
                {trainings.map(t => (
                  <tr key={t.id} className="border-t border-gray-200">
                    <td className="px-3 py-2">{t.title}</td>
                    <td className="px-3 py-2 text-gray-600">{t.category}</td>
                    <td className="px-3 py-2 text-gray-500">{t.start_date ?? '—'}{t.end_date ? ` ~ ${t.end_date}` : ''}</td>
                    <td className="px-3 py-2 text-right">{Number(t.hours ?? 0)}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {t.status}{t.cert_expiry_date ? `（到期 ${t.cert_expiry_date}）` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {e.notes && <div className="text-sm text-gray-600 mb-6"><span className="font-semibold">備註：</span>{e.notes}</div>}

        <div className="grid grid-cols-3 gap-8 mt-12 text-sm">
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">員工簽名</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">主管</div>
          <div className="border-t border-gray-400 pt-2 text-center text-gray-500">人資</div>
        </div>

        <div className="text-xs text-gray-400 mt-8 text-center">本表含個人資料，請依個資法妥善保管。</div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <table className="w-full text-sm border border-gray-300"><tbody>{children}</tbody></table>
    </div>
  )
}

function Row({ k, v, k2, v2 }: { k: string; v: any; k2?: string; v2?: any }) {
  return (
    <tr>
      <td className="bg-gray-100 border border-gray-300 px-3 py-2 text-gray-600 w-[110px]">{k}</td>
      <td className="border border-gray-300 px-3 py-2 text-gray-900">{v || '—'}</td>
      <td className="bg-gray-100 border border-gray-300 px-3 py-2 text-gray-600 w-[110px]">{k2}</td>
      <td className="border border-gray-300 px-3 py-2 text-gray-900">{k2 ? (v2 || '—') : ''}</td>
    </tr>
  )
}
