import { NextRequest, NextResponse } from 'next/server'
import { DOC_CONFIG, serviceClient, currentUser, isAdmin } from '@/lib/approvals-server'

export const dynamic = 'force-dynamic'

/**
 * 核決權限與流程引擎（權責表）
 * GET    /api/approvals/authority  → 全部有效規則 + 關卡 + 可選簽核人 + 表單類別
 * POST   /api/approvals/authority  → 新增或改版一條權責規則（改版＝停用舊版後另存新版）
 * DELETE /api/approvals/authority?id=…  → 停用規則（不實體刪除，歷史簽核仍需追溯）
 *
 * 權責表是 Workflow 唯一的規則來源；舊版單關卡設定（/api/approvals/flows POST）已停用，
 * 避免兩套設定互相覆蓋。
 */

type Guard =
  | { error: NextResponse }
  | { user: NonNullable<Awaited<ReturnType<typeof currentUser>>>; sb: NonNullable<ReturnType<typeof serviceClient>> }

async function guard(): Promise<Guard> {
  const user = await currentUser()
  if (!user) return { error: NextResponse.json({ ok: false, error: '未登入' }, { status: 401 }) }
  if (!isAdmin(user.role)) {
    return { error: NextResponse.json({ ok: false, error: '需管理員權限' }, { status: 403 }) }
  }
  const sb = serviceClient()
  if (!sb) {
    return { error: NextResponse.json({ ok: false, error: '缺少 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 }) }
  }
  return { user, sb }
}

export async function GET() {
  const g = await guard()
  if ('error' in g) return g.error
  const { sb } = g

  const [{ data: flows, error }, { data: people }] = await Promise.all([
    sb.from('approval_flows').select('*').eq('is_active', true).order('doc_type').order('priority'),
    sb.from('user_profiles').select('id, full_name, role, title').eq('is_active', true).order('full_name'),
  ])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const flowIds = (flows ?? []).map(f => f.id)
  const { data: steps } = flowIds.length
    ? await sb.from('approval_flow_steps').select('*').in('flow_id', flowIds).order('step_order')
    : { data: [] as any[] }

  return NextResponse.json({
    ok: true,
    data: (flows ?? []).map(f => ({ ...f, steps: (steps ?? []).filter(s => s.flow_id === f.id) })),
    people: people ?? [],
    document_types: Object.entries(DOC_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label })),
  })
}

export async function POST(req: NextRequest) {
  const g = await guard()
  if ('error' in g) return g.error
  const { sb } = g

  const body = await req.json().catch(() => ({} as any))
  const docType = String(body.doc_type ?? '')
  const name = String(body.name ?? '').trim()
  const steps: any[] = Array.isArray(body.steps) ? body.steps : []

  if (!DOC_CONFIG[docType] || !name || !steps.length) {
    return NextResponse.json({ ok: false, error: '請填表單類別、規則名稱與至少一個關卡' }, { status: 400 })
  }
  for (const [i, s] of steps.entries()) {
    if (!['user', 'role', 'direct_manager'].includes(s.approver_type)) {
      return NextResponse.json({ ok: false, error: `第 ${i + 1} 關的簽核人類型不正確` }, { status: 400 })
    }
    if (s.approver_type === 'user' && !s.approver_user_id) {
      return NextResponse.json({ ok: false, error: `第 ${i + 1} 關請選擇人員` }, { status: 400 })
    }
    if (s.approver_type === 'role' && !s.approver_role) {
      return NextResponse.json({ ok: false, error: `第 ${i + 1} 關請輸入角色` }, { status: 400 })
    }
  }

  const num = (v: any) => (v === '' || v == null ? null : Number(v))
  const payload = {
    doc_type: docType,
    name,
    priority: Number(body.priority) || 100,
    amount_gte: num(body.amount_gte),
    amount_lt: num(body.amount_lt),
    discount_gte: num(body.discount_gte),
    discount_lt: num(body.discount_lt),
    requester_department: String(body.requester_department ?? '').trim() || null,
    is_active: body.is_active !== false,
    effective_from: body.effective_from || new Date().toISOString().slice(0, 10),
    effective_to: body.effective_to || null,
  }

  // 編輯＝停用舊版、另存新版，歷史簽核仍可追溯當初適用的規則。
  let versionNo = 1
  const previousId = body.id ? String(body.id) : ''
  if (previousId) {
    const { data: prev, error: prevErr } = await sb
      .from('approval_flows').select('version_no').eq('id', previousId).maybeSingle()
    if (prevErr || !prev) {
      return NextResponse.json({ ok: false, error: prevErr?.message ?? '找不到原流程' }, { status: 404 })
    }
    versionNo = Number(prev.version_no ?? 1) + 1
    const { error: offErr } = await sb.from('approval_flows').update({ is_active: false }).eq('id', previousId)
    if (offErr) return NextResponse.json({ ok: false, error: offErr.message }, { status: 500 })
  }

  const { data: created, error: insErr } = await sb
    .from('approval_flows').insert({ ...payload, version_no: versionNo }).select('id').single()
  if (insErr) {
    // 新版沒建成就把舊版救回來，避免這個類別短暫沒有任何有效流程。
    if (previousId) await sb.from('approval_flows').update({ is_active: true }).eq('id', previousId)
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
  }

  const flowId = created.id
  const { error: stepErr } = await sb.from('approval_flow_steps').insert(
    steps.map((s, i) => ({
      flow_id: flowId,
      step_order: i + 1,
      step_name: String(s.step_name ?? '').trim() || `第 ${i + 1} 關`,
      approver_type: s.approver_type,
      approver_user_id: s.approver_type === 'user' ? s.approver_user_id : null,
      approver_role: s.approver_type === 'role' ? s.approver_role : null,
      due_hours: s.due_hours ? Number(s.due_hours) : null,
    }))
  )
  if (stepErr) {
    await sb.from('approval_flows').delete().eq('id', flowId)
    if (previousId) await sb.from('approval_flows').update({ is_active: true }).eq('id', previousId)
    return NextResponse.json({ ok: false, error: stepErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: flowId })
}

export async function DELETE(req: NextRequest) {
  const g = await guard()
  if ('error' in g) return g.error
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: '缺少 id' }, { status: 400 })
  const { error } = await g.sb.from('approval_flows').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
