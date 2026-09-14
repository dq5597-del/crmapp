import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createHash } from 'crypto'

/**
 * 簽核引擎 — 伺服器端共用邏輯
 * 僅供 /api/approvals/* route handlers 使用（含 service role，不可 import 到前端）
 */

/** 各單據類型設定：要掛新模組簽核，在這裡加一列即可 */
export const DOC_CONFIG: Record<string, {
  table: string        // 來源資料表
  noField: string      // 單號欄位
  amountField: string  // 金額欄位（用於流程門檻判斷）
  discountField?: string
  label: string        // 顯示名稱
}> = {
  payable: { table: 'payables', noField: 'payable_no', amountField: 'amount', label: '應付帳款' },
  quote:   { table: 'quotes',   noField: 'quote_no',   amountField: 'total_amount', label: '報價單／折讓' },
  purchase_order: { table: 'purchase_orders', noField: 'order_no', amountField: 'total_amount', label: '訂購單' },
  leave: { table: 'hr_leaves', noField: 'leave_type', amountField: 'hours', label: '請假申請' },
  expense_claim: { table: 'employee_expense_claims', noField: 'claim_no', amountField: 'amount', label: '員工報銷' },
  payroll: { table: 'hr_payrolls', noField: 'period', amountField: 'net_pay', label: '薪資／獎金' },
}

/** service role client（僅伺服器端，繞過 RLS 執行簽核寫入） */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** 由 cookie session 取得目前登入者 + profile（角色/姓名） */
export async function currentUser() {
  const sb = createServerSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await sb
    .from('user_profiles')
    .select('id, full_name, role, manager_id')
    .eq('id', user.id)
    .maybeSingle()
  // HR 主檔的 RLS 不允許一般員工直接讀取；伺服器端僅取流程所需的部門欄位。
  const contextClient = serviceClient() ?? sb
  const { data: employee } = await contextClient
    .from('hr_employees')
    .select('department')
    .eq('user_id', user.id)
    .maybeSingle()
  return {
    id: user.id,
    name: (profile?.full_name as string) ?? user.email ?? '未知使用者',
    role: (profile?.role as string) ?? 'user',
    managerId: (profile?.manager_id as string | null) ?? null,
    department: (employee?.department as string | null) ?? null,
  }
}

export type ApprovalUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/** 取得流程應依循的實際員工，而不是代建單據的操作人。 */
export async function routingUserForDoc(sb: any, docType: string, doc: Record<string, any>, fallbackUserId: string) {
  if (docType === 'expense_claim') return String(doc.applicant_id ?? fallbackUserId)
  if ((docType === 'leave' || docType === 'payroll') && doc.employee_id) {
    const { data } = await sb.from('hr_employees').select('user_id').eq('id', doc.employee_id).maybeSingle()
    return String(data?.user_id ?? fallbackUserId)
  }
  return String(doc.created_by ?? fallbackUserId)
}

/** 送簽是具權限的業務動作，不因知道 doc_id 就能操作。 */
export function canSubmitDocument(user: ApprovalUser, docType: string, doc: Record<string, any>, routingUserId: string) {
  if (isAdmin(user.role)) return true
  if (docType === 'expense_claim') return doc.applicant_id === user.id || ['accountant', 'hr'].includes(user.role)
  if (docType === 'leave') return routingUserId === user.id || ['manager', 'hr'].includes(user.role)
  if (docType === 'payroll') return ['hr'].includes(user.role)
  if (docType === 'payable') return ['manager', 'accountant'].includes(user.role)
  if (docType === 'quote' || docType === 'purchase_order') {
    return doc.created_by === user.id || ['manager', 'sales'].includes(user.role)
  }
  return false
}

export function isAdmin(role: string) {
  return role === 'admin' || role === '管理員'
}

/** 單據內容 SHA-256（送簽時存檔，核准時比對防竄改） */
export function hashDoc(row: Record<string, unknown>) {
  // 排除會自動變動的欄位，避免無關更新造成 hash 不符
  const rest: Record<string, unknown> = { ...row }
  delete rest.updated_at
  delete rest.approval_status
  const sorted = Object.keys(rest).sort().reduce((o: Record<string, unknown>, k) => { o[k] = rest[k]; return o }, {})
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

/** 主檔與明細一起納入簽核指紋，防止只改品項而繞過鎖定。 */
export async function hashApprovalDocument(sb: any, docType: string, row: Record<string, unknown>) {
  const document = { ...row }
  delete document.updated_at
  delete document.approval_status
  // status 是 Workflow 自己控制的欄位，不屬於申請內容。
  delete document.status
  let items: unknown[] = []
  if (docType === 'quote') {
    const { data, error } = await sb.from('quote_items').select('*').eq('quote_id', row.id).order('seq_no').order('id')
    if (error) throw new Error(error.message)
    items = data ?? []
  } else if (docType === 'purchase_order') {
    const { data, error } = await sb.from('purchase_order_items').select('*').eq('order_id', row.id).order('seq_no').order('id')
    if (error) throw new Error(error.message)
    items = data ?? []
  }
  return hashDoc({ document, items })
}

/** 判斷 user 是否為指定關卡的合法簽核人 */
export function canApproveStep(
  step: { approver_type: string; approver_user_id: string | null; approver_role: string | null },
  user: { id: string; role: string },
  directManagerId?: string | null,
) {
  if (isAdmin(user.role)) return true
  if (step.approver_type === 'user') return step.approver_user_id === user.id
  if (step.approver_type === 'role') return step.approver_role === user.role
  if (step.approver_type === 'direct_manager') return !!directManagerId && directManagerId === user.id
  return false
}

export async function directManagerOf(sb: any, submitterId: string | null) {
  if (!submitterId) return null
  const { data } = await sb.from('user_profiles').select('manager_id').eq('id', submitterId).maybeSingle()
  return (data?.manager_id as string | null) ?? null
}
