import { NextRequest, NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, hashApprovalDocument, canApproveStep, directManagerOf, routingUserForDoc, canSubmitDocument, isAdmin } from '@/lib/approvals-server'

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
  const directManagerId = step?.approver_type === 'direct_manager'
    ? await directManagerOf(sb, instance.routing_user_id ?? instance.submitted_by)
    : null
  if (instance.status === 'pending' && step) {
    if (step.approver_type === 'user' && step.approver_user_id) {
      const { data: p } = await sb.from('user_profiles').select('full_name').eq('id', step.approver_user_id).maybeSingle()
      nextApprover = p?.full_name ?? '指定人員'
    } else if (step.approver_type === 'direct_manager') {
      const { data: p } = directManagerId
        ? await sb.from('user_profiles').select('full_name').eq('id', directManagerId).maybeSingle()
        : { data: null }
      nextApprover = p?.full_name ?? '直屬主管（尚未設定）'
    } else {
      nextApprover = step.approver_role === 'manager' ? '主管' : step.approver_role === 'admin' ? '管理員' : step.approver_role
    }
  }

  // 目前登入者是否可簽這一關（前端據此顯示同意/退回按鈕；後端 action 仍會再驗一次）
  const iCanApprove = instance.status === 'pending' && !!step && canApproveStep(step, user, directManagerId)
  const hasParticipated = (records ?? []).some(record => record.actor_id === user.id)
  if (instance.submitted_by !== user.id && !iCanApprove && !hasParticipated && !isAdmin(user.role)) {
    return NextResponse.json({ ok: false, error: '您無權查看此簽呈' }, { status: 403 })
  }

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

  const routingUserId = await routingUserForDoc(sb, docType, doc, user.id)
  if (!canSubmitDocument(user, docType, doc, routingUserId)) {
    return NextResponse.json({ ok: false, error: '您無權送簽此單據' }, { status: 403 })
  }
  const { data: routingEmployee } = await sb.from('hr_employees').select('department').eq('user_id', routingUserId).maybeSingle()
  const requesterDepartment = routingEmployee?.department ?? user.department

  const amount = Number(doc[cfg.amountField] ?? 0)
  const discount = docType === 'quote'
    ? Math.max(0, Number(doc.subtotal ?? doc.total_amount ?? 0) - Number(doc.total_amount ?? 0))
    : cfg.discountField ? Number(doc[cfg.discountField] ?? 0) : 0
  const docNo = String(doc[cfg.noField] ?? '')

  const { data: existing } = await sb
    .from('approval_instances')
    .select('id, status')
    .eq('doc_type', docType)
    .eq('doc_id', docId)
    .maybeSingle()
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return NextResponse.json({ ok: false, error: existing.status === 'pending' ? '此單已在簽核中' : '此單已核准，不可重送' }, { status: 409 })
  }

  // 2) 命中流程（is_active、金額門檻、priority 最小者）
  const { data: flows, error: fErr } = await sb
    .from('approval_flows')
    .select('id, name, amount_gte, amount_lt, discount_gte, discount_lt, requester_department, version_no, effective_from, effective_to')
    .eq('doc_type', docType)
    .eq('is_active', true)
    .order('priority', { ascending: true })
  if (fErr) return NextResponse.json({ ok: false, error: fErr.message }, { status: 500 })

  const today = new Date().toISOString().slice(0, 10)
  const flow = (flows ?? []).find(f =>
    (!f.effective_from || f.effective_from <= today) &&
    (!f.effective_to || f.effective_to >= today) &&
    (f.amount_gte == null || amount >= Number(f.amount_gte)) &&
    (f.amount_lt == null || amount < Number(f.amount_lt)) &&
    (f.discount_gte == null || discount >= Number(f.discount_gte)) &&
    (f.discount_lt == null || discount < Number(f.discount_lt)) &&
    (!f.requester_department || f.requester_department === requesterDepartment)
  )
  if (!flow) {
    return NextResponse.json({ ok: false, error: '沒有符合此單據條件的有效核決流程，請由管理員補齊權責規則' }, { status: 409 })
  }

  const { data: flowSteps, error: stepsError } = await sb.from('approval_flow_steps')
    .select('step_order, step_name, approver_type, approver_user_id, approver_role, due_hours')
    .eq('flow_id', flow.id)
    .order('step_order')
  if (stepsError) return NextResponse.json({ ok: false, error: stepsError.message }, { status: 500 })
  if (!flowSteps?.length) return NextResponse.json({ ok: false, error: '此流程尚未設定簽核關卡' }, { status: 409 })
  if (flowSteps[0].approver_type === 'direct_manager') {
    const managerId = await directManagerOf(sb, routingUserId)
    if (!managerId) return NextResponse.json({ ok: false, error: '此單據的所屬員工尚未設定直屬主管，無法送簽' }, { status: 409 })
  }

  // 3) 建立 / 重送簽呈
  const payload = {
    doc_no: docNo,
    flow_id: flow.id,
    status: 'pending' as const,
    current_step: 1,
    submitted_by: user.id,
    routing_user_id: routingUserId,
    submitted_at: new Date().toISOString(),
    finished_at: null,
    content_hash: await hashApprovalDocument(sb, docType, doc),
    amount,
    context: { amount, discount, requester_department: requesterDepartment },
    flow_snapshot: { flow, steps: flowSteps },
    due_at: flowSteps[0].due_hours
      ? new Date(Date.now() + Number(flowSteps[0].due_hours) * 3_600_000).toISOString()
      : null,
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

  const pendingPatch: Record<string, unknown> = { approval_status: 'pending' }
  if (docType === 'expense_claim') pendingPatch.status = 'pending'
  const { error: pendingError } = await sb.from(cfg.table).update(pendingPatch).eq('id', docId)
  if (pendingError) {
    await sb.from('approval_instances').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', instanceId)
    return NextResponse.json({ ok: false, error: `單據鎖定失敗：${pendingError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: { instance_id: instanceId, status: 'pending' } })
}
