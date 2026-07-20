import { NextRequest, NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, hashDoc, canApproveStep, isAdmin } from '@/lib/approvals-server'

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
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    if (!step || !canApproveStep(step, user)) {
      return NextResponse.json({ ok: false, error: '您不是此關卡的簽核人' }, { status: 403 })
    }
  }

  // ── 核准前防竄改檢查 ──────────────────────────────────
  if (action === 'approve' && instance.content_hash) {
    const { data: doc } = await sb.from(cfg.table).select('*').eq('id', instance.doc_id).maybeSingle()
    if (!doc) return NextResponse.json({ ok: false, error: '找不到原單據' }, { status: 404 })
    if (hashDoc(doc) !== instance.content_hash) {
      return NextResponse.json(
        { ok: false, error: '單據內容在送簽後已被修改，請退回並要求重新送簽' },
        { status: 409 },
      )
    }
  }

  // ── 寫入紀錄 + 更新狀態 ───────────────────────────────
  const { error: rErr } = await sb.from('approval_records').insert({
    instance_id: instance.id,
    step_order: instance.current_step,
    action,
    actor_id: user.id,
    actor_name: user.name,
    comment: comment || null,
  })
  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 })

  // v1 單關卡：approve 即完成（多關卡版：未到最後一關則 current_step + 1）
  const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled'

  const { error: uErr } = await sb
    .from('approval_instances')
    .update({ status: newStatus, finished_at: new Date().toISOString() })
    .eq('id', instance.id)
    .eq('status', 'pending') // 樂觀鎖：避免同時兩人操作
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 })

  // 同步業務表狀態（cancel 後回到未送簽 = null，單據解鎖）
  await sb.from(cfg.table)
    .update({ approval_status: action === 'cancel' ? null : newStatus })
    .eq('id', instance.doc_id)

  return NextResponse.json({ ok: true, data: { status: newStatus } })
}
