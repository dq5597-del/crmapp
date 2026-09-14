import { NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser } from '@/lib/approvals-server'

export const dynamic = 'force-dynamic'

/**
 * 簽呈流程設定（2026-07）
 * GET  /api/approvals/flows   → 各單據類型目前設定（啟用/金額門檻/簽核人）
 * 此端點只提供簽呈中心摘要；流程維護統一由 /api/approvals/authority 處理，
 * 避免舊版單關卡設定覆蓋新版的多門檻、多關卡權責表。
 */

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })
  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const { data: flows, error } = await sb.from('approval_flows')
    .select('id,doc_type,amount_gte,amount_lt,discount_gte,discount_lt,requester_department,is_active,effective_from,effective_to')
    .eq('is_active', true)
    .lte('effective_from', new Date().toISOString().slice(0, 10))
    .order('priority')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const today = new Date().toISOString().slice(0, 10)

  const result = Object.entries(DOC_CONFIG).map(([docType, cfg]) => {
    const rules = (flows ?? []).filter(f => f.doc_type === docType && (!f.effective_to || f.effective_to >= today))
    const thresholds = rules.map(rule => rule.amount_gte).filter((value): value is number => value != null)
    return {
      doc_type: docType,
      label: cfg.label,
      enabled: rules.length > 0,
      rule_count: rules.length,
      amount_gte: thresholds.length ? Math.min(...thresholds) : null,
    }
  })
  return NextResponse.json({ ok: true, data: result })
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: '舊版單關卡流程設定已停用，請使用核決權限與流程引擎' },
    { status: 410 },
  )
}
