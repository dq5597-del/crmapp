'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import SignaturePad from '@/components/SignaturePad'
import {
  ArrowLeft, FileSignature, Link2, Printer, RefreshCw, Check, Ban, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'

// ============================================================
// 月度工時確認單（一人一月一張）
//   產生時把當月明細快照進 detail，簽名後工時由 DB trigger 鎖定
// ============================================================

type Line = {
  work_date: string
  project_name: string
  work_item: string | null
  hours: number
  rate_type: string
  rate: number
  cost: number
}
type Conf = {
  id: string
  person_name: string
  period_month: string
  member_kind: string | null
  total_hours: number
  total_cost: number
  work_days: number
  project_count: number
  detail: Line[]
  status: string
  sign_token: string
  signature_data: string | null
  signer_name: string | null
  signed_at: string | null
  sign_note: string | null
  void_reason: string | null
}

const n = (v: any) => Number(v ?? 0) || 0
const nf = (v: number) => Math.round(v).toLocaleString('zh-TW')
const hf = (v: number) => (Math.round(v * 10) / 10).toLocaleString('zh-TW')

const STATUS_COLORS: Record<string, string> = {
  '待簽名': 'bg-amber-100 text-amber-700',
  '已簽名': 'bg-green-100 text-green-700',
  '作廢': 'bg-gray-100 text-gray-400',
}

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const from = `${m}-01`
  const last = new Date(y, mo, 0).getDate()
  return { from, to: `${m}-${String(last).padStart(2, '0')}` }
}

export default function WorkHourConfirmationsPage() {
  const supabase = createClient()

  const [month, setMonth] = useState(thisMonth())
  const [rows, setRows] = useState<Conf[]>([])
  const [loading, setLoading] = useState(true)
  const [noTable, setNoTable] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [signing, setSigning] = useState<Conf | null>(null)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('work_hour_confirmations').select('*')
      .eq('period_month', month)
      .order('person_name')
    if (error) { console.error(error); setNoTable(true) }
    setRows((data as any) ?? [])
    setLoading(false)
  }

  /** 撈當月工時，依人彙總，缺的建、已存在的跳過（不覆蓋已簽的） */
  async function generate() {
    setGenerating(true); setMsg('')
    const { from, to } = monthRange(month)

    const [wRes, pRes] = await Promise.all([
      supabase.from('project_work_logs').select('*')
        .gte('work_date', from).lte('work_date', to).order('work_date'),
      supabase.from('projects').select('id, project_name'),
    ])
    if (wRes.error) { setMsg('讀取工時失敗：' + wRes.error.message); setGenerating(false); return }

    const projName: Record<string, string> = {}
    ;(pRes.data ?? []).forEach((p: any) => { projName[p.id] = p.project_name })

    const logs = wRes.data ?? []
    if (logs.length === 0) { setMsg('這個月沒有任何工時登錄'); setGenerating(false); return }

    // 依人分組
    const byPerson: Record<string, any[]> = {}
    logs.forEach((l: any) => { (byPerson[l.name || '（未填姓名）'] ??= []).push(l) })

    const existing = new Set(rows.filter(r => r.status !== '作廢').map(r => r.person_name))
    const toInsert = Object.entries(byPerson)
      .filter(([name]) => !existing.has(name))
      .map(([name, ls]) => {
        const detail: Line[] = ls.map(l => ({
          work_date: l.work_date,
          project_name: projName[l.project_id] ?? '（未知專案）',
          work_item: l.work_item,
          hours: n(l.hours),
          rate_type: l.rate_type,
          rate: n(l.rate),
          cost: n(l.cost),
        }))
        return {
          person_name: name,
          period_month: month,
          member_kind: ls[0]?.member_kind ?? null,
          total_hours: detail.reduce((s, d) => s + d.hours, 0),
          total_cost: detail.reduce((s, d) => s + d.cost, 0),
          work_days: new Set(detail.map(d => d.work_date)).size,
          project_count: new Set(ls.map((l: any) => l.project_id)).size,
          detail,
          status: '待簽名',
        }
      })

    if (toInsert.length === 0) { setMsg('所有人的確認單都已產生，沒有新的可建'); setGenerating(false); return }

    const { error } = await supabase.from('work_hour_confirmations').insert(toInsert)
    if (error) setMsg('產生失敗：' + error.message)
    else setMsg(`已產生 ${toInsert.length} 張確認單`)
    setGenerating(false)
    load()
  }

  /** 後台當場簽（平板／手機遞給師傅簽） */
  async function saveSignature(dataUrl: string, signerName: string) {
    if (!signing) return
    const { error } = await supabase.from('work_hour_confirmations').update({
      status: '已簽名',
      signature_data: dataUrl,
      signer_name: signerName,
      signed_at: new Date().toISOString(),
    }).eq('id', signing.id)
    if (error) { setMsg('簽名儲存失敗：' + error.message); return }
    setSigning(null)
    setMsg('已完成簽名，該月工時已鎖定')
    load()
  }

  async function voidConf(c: Conf) {
    const reason = prompt(`作廢 ${c.person_name} 的 ${c.period_month} 確認單。\n作廢後該月工時可再修改。\n\n請填作廢原因：`)
    if (reason == null) return
    if (!reason.trim()) { alert('請填寫作廢原因'); return }
    const { error } = await supabase.from('work_hour_confirmations')
      .update({ status: '作廢', void_reason: reason.trim() }).eq('id', c.id)
    if (error) setMsg('作廢失敗：' + error.message)
    else setMsg('已作廢，可重新產生')
    load()
  }

  async function removeConf(c: Conf) {
    if (c.status === '已簽名') { alert('已簽名的單據不可刪除，請改用作廢'); return }
    if (!confirm(`刪除 ${c.person_name} 的 ${c.period_month} 確認單？`)) return
    const { error } = await supabase.from('work_hour_confirmations').delete().eq('id', c.id)
    if (error) setMsg('刪除失敗：' + error.message)
    load()
  }

  function copyLink(c: Conf) {
    const url = `${window.location.origin}/sign/work-hours/${c.sign_token}`
    navigator.clipboard.writeText(url)
      .then(() => setMsg('已複製簽名連結，可用 LINE 傳給師傅'))
      .catch(() => window.prompt('複製這個連結傳給師傅：', url))
  }

  const summary = useMemo(() => {
    const live = rows.filter(r => r.status !== '作廢')
    return {
      total: live.length,
      signed: live.filter(r => r.status === '已簽名').length,
      hours: live.reduce((s, r) => s + n(r.total_hours), 0),
      cost: live.reduce((s, r) => s + n(r.total_cost), 0),
    }
  }, [rows])

  if (noTable) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          尚未建立確認單資料表。請到 Supabase SQL Editor 執行{' '}
          <code className="bg-white px-1.5 py-0.5 rounded">sql/work_hour_confirmations.sql</code>。
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Link href="/work-hours" className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileSignature size={20} className="text-blue-600" /> 工時確認單
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {month}　{summary.signed}/{summary.total} 已簽名　合計 {hf(summary.hours)} 小時 · NT${nf(summary.cost)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
            {generating ? '產生中…' : '產生本月確認單'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800 flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="text-blue-400 hover:text-blue-700">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>{month} 還沒有確認單</p>
          <p className="text-xs mt-1">按右上「產生本月確認單」，系統會依當月工時自動每人建一張</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(c => {
            const open = expanded === c.id
            const voided = c.status === '作廢'
            return (
              <div key={c.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                  voided ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                {/* 標題列 */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-gray-900 ${voided ? 'line-through' : ''}`}>
                        {c.person_name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STATUS_COLORS[c.status]}`}>
                        {c.status}
                      </span>
                      {c.member_kind && <span className="text-xs text-gray-400">{c.member_kind}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {hf(n(c.total_hours))} 小時 · {c.work_days} 天 · {c.project_count} 個專案 · NT${nf(n(c.total_cost))}
                      {c.signed_at && <span className="text-green-600 ml-2">
                        · {c.signer_name} 於 {new Date(c.signed_at).toLocaleDateString('zh-TW')} 簽名
                      </span>}
                      {voided && c.void_reason && <span className="ml-2">· 作廢原因：{c.void_reason}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setExpanded(open ? null : c.id)}
                      title="展開明細"
                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {!voided && c.status !== '已簽名' && (
                      <>
                        <button onClick={() => setSigning(c)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700">
                          <Check size={14} /> 當場簽名
                        </button>
                        <button onClick={() => copyLink(c)} title="複製連結給師傅自己簽"
                          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600">
                          <Link2 size={15} />
                        </button>
                      </>
                    )}
                    <a href={`/work-hours/confirmations/${c.id}/print`} target="_blank" rel="noreferrer"
                      title="列印 / PDF"
                      className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600">
                      <Printer size={15} />
                    </a>
                    {!voided && c.status === '已簽名' && (
                      <button onClick={() => voidConf(c)} title="作廢（解除工時鎖定）"
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-amber-600">
                        <Ban size={15} />
                      </button>
                    )}
                    {c.status === '待簽名' && (
                      <button onClick={() => removeConf(c)} title="刪除"
                        className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 明細 */}
                {open && (
                  <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left py-1.5">日期</th>
                          <th className="text-left py-1.5">專案</th>
                          <th className="text-left py-1.5">施工項目</th>
                          <th className="text-right py-1.5">工時</th>
                          <th className="text-left py-1.5 pl-3">計價</th>
                          <th className="text-right py-1.5">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(c.detail ?? []).map((d, i) => (
                          <tr key={i} className="border-t border-gray-200/60">
                            <td className="py-1.5 whitespace-nowrap">{d.work_date}</td>
                            <td className="py-1.5">{d.project_name}</td>
                            <td className="py-1.5 text-gray-500">{d.work_item ?? '—'}</td>
                            <td className="py-1.5 text-right tabular-nums">{hf(d.hours)}</td>
                            <td className="py-1.5 pl-3 text-gray-500">{d.rate_type}</td>
                            <td className="py-1.5 text-right tabular-nums">NT${nf(d.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-semibold text-gray-800">
                          <td className="py-2" colSpan={3}>合計</td>
                          <td className="py-2 text-right tabular-nums">{hf(n(c.total_hours))}</td>
                          <td />
                          <td className="py-2 text-right tabular-nums">NT${nf(n(c.total_cost))}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {c.signature_data && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs text-gray-500 mb-1">簽名</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.signature_data} alt="簽名" className="h-16 bg-white border border-gray-200 rounded" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {signing && (
        <SignaturePad
          title={`${signing.person_name}　${signing.period_month} 工時確認`}
          onSave={saveSignature}
          onClose={() => setSigning(null)}
        />
      )}
    </div>
  )
}
