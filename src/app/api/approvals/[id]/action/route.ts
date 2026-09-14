import { NextRequest, NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, hashApprovalDocument, canApproveStep, isAdmin, directManagerOf } from '@/lib/approvals-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/approvals/[id]/action
 * body: { action: 'approve' | 'reject' | 'cancel', comment?: string }
 *
 * 權限（後端為最後防線，不信任前端）：
 * - approve / reject：僅當前關卡指定簽核人（或 admin）
 * - cancel（撤簽）：僅送簽人（或 admin）
 * 核准前比對 content_hash，送簽後被改過的單一律擋下。
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''
  if (!['approve', 'reject', 'cancel'].includes(action)) {
    return NextResponse.json({ ok: false, error: '不支援的動作' }, { status: 400 })
  }
  if (action === 'reject' && !comment) {
    return NextResponse.json({ ok: false, error: '退回時必須填寫意見' }, { status: 400 })
  }

  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const { data: instance, error: iErr } = await sb
    .from('approval_instances')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 })
  if (!instance) return NextResponse.json({ ok: false, error: '找不到簽呈' }, { status: 404 })
  if (instance.status !== 'pending') {
    return NextResponse.json({ ok: false, error: '此簽呈已結束，無法再操作' }, { status: 409 })
  }

  const cfg = DOC_CONFIG[instance.doc_type]
  if (!cfg) return NextResponse.json({ ok: false, error: '未知的單據類型' }, { status: 500 })

  // ── 權限驗證 ──────────────────────────────────────────
  if (action === 'cancel') {
    if (instance.submitted_by !== user.id && !isAdmin(user.role)) {
      return NextResponse.json({ ok: false, error: '僅送簽人可撤簽' }, { status: 403 })
    }
  } else {
    const { data: step } = await sb
      .from('approval_flow_steps')
      .select('step_order, approver_type, approver_user_id, approver_role')
      .eq('flow_id', instance.flow_id)
      .eq('step_order', instance.current_step)
      .maybeSingle()
    const directManagerId = step?.approver_type === 'direct_manager'
      ? await directManagerOf(sb, instance.routing_user_id ?? instance.submitted_by)
      : null
    if (!step || !canApproveStep(step, user, directManagerId)) {
      return NextResponse.json({ ok: false, error: '您不是此關卡的簽核人' }, { status: 403 })
    }
  }

  // ── 核准前防竄改檢查 ──────────────────────────────────
  if (action === 'approve' && instance.content_hash) {
    const { data: doc } = await sb.from(cfg.table).select('*').eq('id', instance.doc_id).maybeSingle()
    if (!doc) return NextResponse.json({ ok: false, error: '找不到原單據' }, { status: 404 })
    if ((await hashApprovalDocument(sb, instance.doc_type, doc)) !== instance.content_hash) {
      return NextResponse.json(
        { ok: false, error: '單據內容在送簽後已被修改，請退回並要求重新送簽' },
        { status: 409 },
      )
    }
  }

  // ── 寫入紀錄 + 更新狀態 ───────────────────────────────
  const { data: newRecord, error: rErr } = await sb.from('approval_records').insert({
    instance_id: instance.id,
    step_order: instance.current_step,
    action,
    actor_id: user.id,
    actor_name: user.name,
    comment: comment || null,
  }).select('id').single()
  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 })

  let nextStep: any = null
  if (action === 'approve') {
    const { data } = await sb.from('approval_flow_steps')
      .select('step_order, due_hours')
      .eq('flow_id', instance.flow_id)
      .gt('step_order', instance.current_step)
      .order('step_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    nextStep = data
  }
  const isAdvancing = action === 'approve' && !!nextStep
  const newStatus = isAdvancing ? 'pending' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'
  const dueAt = nextStep?.due_hours
    ? new Date(Date.now() + Number(nextStep.due_hours) * 3_600_000).toISOString()
    : null

  const { data: updatedInstance, error: uErr } = await sb
    .from('approval_instances')
    .update({
      status: newStatus,
      current_step: isAdvancing ? nextStep.step_order : instance.current_step,
      due_at: isAdvancing ? dueAt : null,
      finished_at: isAdvancing ? null : new Date().toISOString(),
    })
    .eq('id', instance.id)
    .eq('status', 'pending') // 樂觀鎖：避免同時兩人操作
    .select('id')
    .maybeSingle()
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 })
  if (!updatedInstance) {
    await sb.from('approval_records').delete().eq('id', newRecord.id)
    return NextResponse.json({ ok: false, error: '此簽呈已由其他人處理，請重新整理' }, { status: 409 })
  }

  // 同步業務表狀態（cancel 後回到未送簽 = null，單據解鎖）
  const docPatch: Record<string, unknown> = { approval_status: action === 'cancel' ? null : newStatus }
  if (!isAdvancing && instance.doc_type === 'leave') {
    docPatch.status = action === 'approve' ? '已核准' : action === 'reject' ? '已駁回' : '已取消'
    docPatch.approved_at = new Date().toISOString()
    docPatch.approver_id = user.id
  }
  if (!isAdvancing && instance.doc_type === 'expense_claim') {
    docPatch.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'
  }
  if (!isAdvancing && instance.doc_type === 'payroll') {
    docPatch.status = action === 'approve' ? '已確認' : '草稿'
  }
  const { error: docError } = await sb.from(cfg.table).update(docPatch).eq('id', instance.doc_id)
  if (docError) {
    await sb.from('approval_instances').update({
      status: instance.status,
      current_step: instance.current_step,
      due_at: instance.due_at,
      finished_at: instance.finished_at,
    }).eq('id', instance.id)
    await sb.from('approval_records').delete().eq('id', newRecord.id)
    return NextResponse.json({ ok: false, error: `原單據同步失敗，簽核動作已回復：${docError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: { status: newStatus } })
}
