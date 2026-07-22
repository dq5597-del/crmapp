import { NextRequest, NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, isAdmin } from '@/lib/approvals-server'

export const dynamic = 'force-dynamic'

/**
 * 簽呈流程設定（2026-07）
 * GET  /api/approvals/flows   → 各單據類型目前設定（啟用/金額門檻/簽核人）
 * POST /api/approvals/flows   → 儲存 { doc_type, enabled, amount_gte, approver_user_id }
 *      每種單據一條流程、一個關卡（簽核人為指定人員）；需管理員權限
 */

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })
  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const { data: flows } = await sb.from('approval_flows').select('*').order('priority')
  const flowIds = (flows ?? []).map(f => f.id)
  const { data: steps } = flowIds.length
    ? await sb.from('approval_flow_steps').select('*').in('flow_id', flowIds)
    : { data: [] as any[] }

  const result = Object.entries(DOC_CONFIG).map(([docType, cfg]) => {
    const flow = (flows ?? []).find(f => f.doc_type === docType)
    const step = flow ? (steps ?? []).find(s => s.flow_id === flow.id && s.step_order === 1) : null
    return {
      doc_type: docType,
      label: cfg.label,
      enabled: !!flow?.is_active,
      amount_gte: flow?.amount_gte ?? null,
      approver_user_id: step?.approver_user_id ?? null,
      approver_role: step?.approver_role ?? null,
    }
  })
  return NextResponse.json({ ok: true, data: result })
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })
  if (!isAdmin(user.role)) return NextResponse.json({ ok: false, error: '需管理員權限' }, { status: 403 })
  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const docType = String(body?.doc_type ?? '')
  if (!DOC_CONFIG[docType]) return NextResponse.json({ ok: false, error: '未知單據類型' }, { status: 400 })
  const enabled = !!body?.enabled
  const amountGte = body?.amount_gte === null || body?.amount_gte === '' ? null : Number(body.amount_gte)
  const approverUserId = body?.approver_user_id || null
  if (enabled && !approverUserId) return NextResponse.json({ ok: false, error: '請選擇簽核人' }, { status: 400 })

  // 取得（或建立）該單據類型的流程
  const { data: existing } = await sb.from('approval_flows')
    .select('id').eq('doc_type', docType).order('priority').limit(1).maybeSingle()

  let flowId = existing?.id as string | undefined
  if (!flowId) {
    const { data: created, error } = await sb.from('approval_flows')
      .insert({ doc_type: docType, name: `${DOC_CONFIG[docType].label}簽呈`, amount_gte: amountGte, is_active: enabled })
      .select('id').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    flowId = created.id
  } else {
    const { error } = await sb.from('approval_flows')
      .update({ amount_gte: amountGte, is_active: enabled }).eq('id', flowId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // 關卡：指定簽核人（單關卡 upsert）
  const { data: step } = await sb.from('approval_flow_steps')
    .select('id').eq('flow_id', flowId).eq('step_order', 1).maybeSingle()
  if (step) {
    const { error } = await sb.from('approval_flow_steps')
      .update({ approver_type: 'user', approver_user_id: approverUserId, approver_role: null })
      .eq('id', step.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  } else {
    const { error } = await sb.from('approval_flow_steps')
      .insert({ flow_id: flowId, step_order: 1, approver_type: 'user', approver_user_id: approverUserId })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
