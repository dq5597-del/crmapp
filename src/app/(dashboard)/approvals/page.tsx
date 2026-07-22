'use client'

/**
 * 簽呈中心（2026-07）
 * 上：待我簽核清單（點擊直達單據）
 * 下：簽呈設定（管理員）：各單據 啟用/金額門檻/簽核人（從現有人員選）
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { FileSignature, Settings2, ChevronRight } from 'lucide-react'

const money = (v: any) => `NT$${Math.round(Number(v ?? 0)).toLocaleString()}`

const DOC_LINK: Record<string, (id: string) => string> = {
  payable: id => `/payables/${id}`,
  quote: id => `/quotes/${id}`,
  purchase_order: id => `/purchase-orders/${id}`,
}
const DOC_LABEL: Record<string, string> = { payable: '應付帳款', quote: '估價單', purchase_order: '訂購單' }

export default function ApprovalsCenter() {
  const supabase = createClient()
  const [pending, setPending] = useState<any[]>([])
  const [flows, setFlows] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<string | null>(null)

  async function load() {
    const [p, f, sp] = await Promise.all([
      fetch('/api/approvals/pending').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/approvals/flows').then(r => r.json()).catch(() => ({ data: [] })),
      supabase.from('user_profiles').select('id, full_name, title').eq('is_active', true).order('full_name'),
    ])
    setPending(p.data ?? [])
    setFlows(f.data ?? [])
    setPeople(sp.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveFlow(f: any) {
    setSavingType(f.doc_type)
    const res = await fetch('/api/approvals/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type: f.doc_type, enabled: f.enabled,
        amount_gte: f.amount_gte === '' ? null : f.amount_gte,
        approver_user_id: f.approver_user_id,
      }),
    })
    const data = await res.json()
    alert(data.ok ? '✅ 已儲存簽呈設定' : `儲存失敗：${data.error ?? ''}`)
    setSavingType(null)
  }

  if (loading) return <div className="p-8 text-gray-400">載入中…</div>

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <FileSignature size={22} className="text-rose-600" />
        <h1 className="text-xl font-bold text-gray-900">簽呈中心</h1>
      </div>

      {/* 待我簽核 */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="font-semibold text-gray-900 mb-3">待我簽核（{pending.length} 件）</div>
        {pending.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">目前沒有待你簽核的單據 🎉</div>
        ) : (
          <div className="space-y-1.5">
            {pending.map((x: any) => (
              <Link key={x.id} href={DOC_LINK[x.doc_type]?.(x.doc_id) ?? '#'}
                className="flex items-center gap-3 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 hover:border-amber-400">
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-700 shrink-0">{DOC_LABEL[x.doc_type] ?? x.doc_type}</span>
                <span className="font-medium shrink-0">{x.doc_no}</span>
                <span className="flex-1" />
                <span className="font-semibold text-gray-800 shrink-0">{money(x.amount)}</span>
                <ChevronRight size={14} className="text-gray-400 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 簽呈設定 */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-1">
          <Settings2 size={16} className="text-gray-500" /> 簽呈設定
        </div>
        <p className="text-xs text-gray-400 mb-4">勾選啟用後，金額 ≥ 門檻的單據需送簽核准才放行；門檻留空＝一律需簽。簽核人從現有人員選擇（需管理員身分才能儲存）。</p>
        <div className="space-y-3">
          {flows.map((f, i) => (
            <div key={f.doc_type} className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <label className="flex items-center gap-2 w-28 shrink-0">
                <input type="checkbox" checked={f.enabled}
                  onChange={e => setFlows(prev => prev.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x))}
                  className="accent-rose-600 w-4 h-4" />
                <span className="text-sm font-medium">{f.label}</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                金額 ≥
                <input type="number" min={0} placeholder="一律需簽" value={f.amount_gte ?? ''}
                  onChange={e => setFlows(prev => prev.map((x, xi) => xi === i ? { ...x, amount_gte: e.target.value } : x))}
                  className="w-32 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-rose-400" />
                元才需簽呈
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                簽核人
                <select value={f.approver_user_id ?? ''}
                  onChange={e => setFlows(prev => prev.map((x, xi) => xi === i ? { ...x, approver_user_id: e.target.value || null } : x))}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-rose-400">
                  <option value="">— 請選擇 —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `（${p.title}）` : ''}</option>)}
                </select>
              </label>
              <button type="button" disabled={savingType === f.doc_type} onClick={() => saveFlow(f)}
                className="ml-auto px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {savingType === f.doc_type ? '儲存中…' : '儲存'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
