import { NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, canApproveStep } from '@/lib/approvals-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/approvals/pending
 * 回傳「待我簽核」清單（跨模組），供首頁看板 / 通知使用。
 */
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })

  const sb = serviceClient()
  if (!sb) return NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const { data: instances, error } = await sb
    .from('approval_instances')
    .select('id, doc_type, doc_id, doc_no, flow_id, current_step, amount, submitted_by, submitted_at')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!instances?.length) return NextResponse.json({ ok: true, data: [] })

  // 取出所有相關關卡，比對目前使用者是否為簽核人
  const flowIds = Array.from(new Set(instances.map(i => i.flow_id).filter(Boolean)))
  const { data: steps } = await sb
    .from('approval_flow_steps')
    .select('flow_id, step_order, approver_type, approver_user_id, approver_role')
    .in('flow_id', flowIds)

  const submitterIds = Array.from(new Set(instances.map(i => i.submitted_by).filter(Boolean)))
  const { data: profiles } = await sb
    .from('user_profiles')
    .select('id, full_name')
    .in('id', submitterIds)
  const nameById: Record<string, string> = {}
  for (const p of profiles ?? []) nameById[p.id] = p.full_name

  const mine = instances
    .filter(i => {
      const step = (steps ?? []).find(s => s.flow_id === i.flow_id && s.step_order === i.current_step)
      return !!step && canApproveStep(step, user)
    })
    .map(i => ({
      instance_id: i.id,
      doc_type: i.doc_type,
      doc_type_label: DOC_CONFIG[i.doc_type]?.label ?? i.doc_type,
      doc_id: i.doc_id,
      doc_no: i.doc_no,
      amount: i.amount,
      submitted_by_name: nameById[i.submitted_by] ?? '—',
      submitted_at: i.submitted_at,
    }))

  return NextResponse.json({ ok: true, data: mine })
}
