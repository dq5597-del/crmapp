import { NextRequest, NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, hashDoc, canApproveStep } from '@/lib/approvals-server'

export const dynamic = 'force-dynamic'

/**
 * 簽核引擎
 * POST /api/approvals                          → 送簽 { doc_type, doc_id }
 * GET  /api/approvals?doc_type=..&doc_id=..    → 查詢簽呈 + 簽核歷程
 *
 * 金額與單號一律由伺服器端重新讀取單據取得，不信任前端傳值。
 */

export async function GET(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })

  const docType = req.nextUrl.searchParams.get('doc_type') ?? ''
  const docId = req.nextUrl.searchParams.get('doc_id') ?? ''
  if (!DOC_CONFIG[docType] || !docId) {
    return NextResponse.json({ ok: false, error: '參數不正確' }, { status: 400 })
  }

  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const { data: instance, error } = await sb
    .from('approval_instances')
    .select('*')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!instance) return NextResponse.json({ ok: true, data: null })

  const [{ data: records }, { data: step }] = await Promise.all([
    sb.from('approval_records')
      .select('id, step_order, action, actor_id, actor_name, comment, created_at')
      .eq('instance_id', instance.id)
      .order('created_at', { ascending: true }),
    sb.from('approval_flow_steps')
      .select('step_order, approver_type, approver_user_id, approver_role')
      .eq('flow_id', instance.flow_id)
      .eq('step_order', instance.current_step)
      .maybeSingle(),
  ])

  // 下一關簽核人顯示名稱
  let nextApprover: string | null = null
  if (instance.status === 'pending' && step) {
    if (step.approver_type === 'user' && step.approver_user_id) {
      const { data: p } = await sb.from('user_profiles').select('full_name').eq('id', step.approver_user_id).maybeSingle()
      nextApprover = p?.full_name ?? '指定人員'
    } else {
      nextApprover = step.approver_role === 'manager' ? '主管' : step.approver_role === 'admin' ? '管理員' : step.approver_role
    }
  }

  // 目前登入者是否可簽這一關（前端據此顯示同意/退回按鈕；後端 action 仍會再驗一次）
  const iCanApprove = instance.status === 'pending' && !!step && canApproveStep(step, user)

  return NextResponse.json({
    ok: true,
    data: {
      instance,
      records: records ?? [],
      next_approver: nextApprover,
      i_can_approve: iCanApprove,
      i_am_submitter: instance.submitted_by === user.id,
    },
  })
}

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const docType = String(body?.doc_type ?? '')
  const docId = String(body?.doc_id ?? '')
  const cfg = DOC_CONFIG[docType]
  if (!cfg || !docId) return NextResponse.json({ ok: false, error: '參數不正確' }, { status: 400 })

  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  // 1) 伺服器端讀取單據（金額/單號不信任前端）
  const { data: doc, error: dErr } = await sb.from(cfg.table).select('*').eq('id', docId).maybeSingle()
  if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 })
  if (!doc) return NextResponse.json({ ok: false, error: '找不到單據' }, { status: 404 })

  const amount = Number(doc[cfg.amountField] ?? 0)
  const docNo = String(doc[cfg.noField] ?? '')

  // 2) 命中流程（is_active、金額門檻、priority 最小者）
  const { data: flows, error: fErr } = await sb
    .from('approval_flows')
    .select('id, name, amount_gte')
    .eq('doc_type', docType)
    .eq('is_active', true)
    .order('priority', { ascending: true })
  if (fErr) return NextResponse.json({ ok: false, error: fErr.message }, { status: 500 })

  const flow = (flows ?? []).find(f => f.amount_gte == null || amount >= Number(f.amount_gte))
  if (!flow) {
    // 無需簽核 → 直接標記核准（免簽）
    await sb.from(cfg.table).update({ approval_status: 'approved' }).eq('id', docId)
    return NextResponse.json({ ok: true, data: { auto_approved: true } })
  }

  // 3) 建立 / 重送簽呈
  const { data: existing } = await sb
    .from('approval_instances')
    .select('id, status')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .maybeSingle()

  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return NextResponse.json({ ok: false, error: existing.status === 'pending' ? '此單已在簽核中' : '此單已核准，不可重送' }, { status: 409 })
  }

  const payload = {
    doc_no: docNo,
    flow_id: flow.id,
    status: 'pending' as const,
    current_step: 1,
    submitted_by: user.id,
    submitted_at: new Date().toISOString(),
    finished_at: null,
    content_hash: hashDoc(doc),
    amount,
  }

  let instanceId: string
  if (existing) {
    // 退回/作廢後重送
    const { error } = await sb.from('approval_instances').update(payload).eq('id', existing.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    instanceId = existing.id
  } else {
    const { data: created, error } = await sb
      .from('approval_instances')
      .insert({ doc_type: docType, doc_id: docId, ...payload })
      .select('id')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    instanceId = created.id
  }

  const comment = typeof body?.comment === 'string' ? body.comment.trim() || null : null
  const { error: rErr } = await sb.from('approval_records').insert({
    instance_id: instanceId,
    step_order: 1,
    action: 'submit',
    actor_id: user.id,
    actor_name: user.name,
    comment,
  })
  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 })

  await sb.from(cfg.table).update({ approval_status: 'pending' }).eq('id', docId)

  return NextResponse.json({ ok: true, data: { instance_id: instanceId, status: 'pending' } })
}
