'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import SignaturePad from '@/components/SignaturePad'
import { CheckCircle2, FileSignature, AlertCircle } from 'lucide-react'

// ============================================================
// 工時確認單 — 公開簽名頁（免登入）
//   師傅用 LINE 收到連結，手機上看明細並簽名
// ============================================================

type Line = {
  work_date: string
  project_name: string
  work_item: string | null
  hours: number
  rate_type: string
  cost: number
}

const n = (v: any) => Number(v ?? 0) || 0
const nf = (v: number) => Math.round(v).toLocaleString('zh-TW')
const hf = (v: number) => (Math.round(v * 10) / 10).toLocaleString('zh-TW')

export default function SignWorkHoursPage({ params }: { params: { token: string } }) {
  const supabase = createClient()
  const [conf, setConf] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pad, setPad] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => { load() }, [params.token])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('work_hour_confirmations').select('*')
      .eq('sign_token', params.token).maybeSingle()
    setConf(data)
    if (data?.signed_at) setDone(true)
    const { data: s } = await supabase
      .from('system_settings').select('company_name, company_phone').limit(1).maybeSingle()
    setCompany(s)
    setLoading(false)
  }

  async function submit(dataUrl: string, signerName: string) {
    setErr('')
    const res = await fetch('/api/work-hours/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: params.token,
        signer_name: signerName,
        signature_data: dataUrl,
        sign_note: note,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? '簽名失敗'); return }
    setPad(false)
    setDone(true)
    load()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">載入中…</div>
  }

  if (!conf) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-sm">
          <AlertCircle size={36} className="text-red-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-900 mb-1">連結無效</p>
          <p className="text-sm text-gray-500">請向公司確認是否收到正確的簽名連結。</p>
        </div>
      </div>
    )
  }

  const detail: Line[] = conf.detail ?? []
  const voided = conf.status === '作廢'

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 抬頭 */}
        <div className="text-center mb-5">
          <div className="text-sm text-gray-500">{company?.company_name ?? '光輝影音科技'}</div>
          <h1 className="text-xl font-bold text-gray-900 mt-1 tracking-wide">工時確認單</h1>
        </div>

        {/* 基本資料 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">姓名</div>
              <div className="font-semibold text-gray-900">{conf.person_name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">期間</div>
              <div className="font-semibold text-gray-900">{conf.period_month}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">總工時</div>
              <div className="font-semibold text-gray-900">{hf(n(conf.total_hours))} 小時／{conf.work_days} 天</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">合計金額</div>
              <div className="font-semibold text-blue-700">NT${nf(n(conf.total_cost))}</div>
            </div>
          </div>
        </div>

        {/* 明細 */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 text-sm font-medium text-gray-700">
            工時明細（{detail.length} 筆）
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 bg-gray-50/60">
                  <th className="text-left px-3 py-2">日期</th>
                  <th className="text-left px-3 py-2">專案</th>
                  <th className="text-right px-3 py-2">工時</th>
                  <th className="text-right px-3 py-2">金額</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((d, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{d.work_date}</td>
                    <td className="px-3 py-2">
                      {d.project_name}
                      {d.work_item && <div className="text-gray-400">{d.work_item}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{hf(n(d.hours))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">NT${nf(n(d.cost))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 font-semibold text-gray-900">
                  <td className="px-3 py-2.5" colSpan={2}>合計</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{hf(n(conf.total_hours))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">NT${nf(n(conf.total_cost))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 簽名區 */}
        {voided ? (
          <div className="bg-gray-100 border border-gray-200 rounded-2xl p-6 text-center text-gray-500 text-sm">
            這張確認單已作廢，不需簽名。
          </div>
        ) : done ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <CheckCircle2 size={36} className="text-green-600 mx-auto mb-2" />
            <p className="font-semibold text-green-800">已完成簽名</p>
            <p className="text-sm text-green-700 mt-1">
              {conf.signer_name}　{conf.signed_at && new Date(conf.signed_at).toLocaleString('zh-TW')}
            </p>
            {conf.signature_data && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conf.signature_data} alt="簽名"
                className="h-20 mx-auto mt-3 bg-white border border-green-200 rounded" />
            )}
            <p className="text-xs text-green-600 mt-3">可以關閉這個頁面了，謝謝。</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm text-gray-600 mb-3">
              請確認上方工時明細無誤後簽名。簽名後即完成確認，如有疑問請先聯絡公司
              {company?.company_phone && <span className="font-medium">（{company.company_phone}）</span>}。
            </p>
            <label className="block text-xs text-gray-500 mb-1">備註（選填，如有異議可在此說明）</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {err && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
            )}
            <button onClick={() => setPad(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium">
              <FileSignature size={18} /> 開始簽名
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          {company?.company_name ?? '光輝影音科技'}　工時確認單
        </p>
      </div>

      {pad && (
        <SignaturePad
          title={`${conf.person_name}　${conf.period_month} 工時確認`}
          onSave={submit}
          onClose={() => setPad(false)}
        />
      )}
    </div>
  )
}
