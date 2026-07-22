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
  label: string        // 顯示名稱
}> = {
  payable: { table: 'payables', noField: 'payable_no', amountField: 'amount', label: '應付帳款' },
  quote:   { table: 'quotes',   noField: 'quote_no',   amountField: 'total_amount', label: '估價單' },
  purchase_order: { table: 'purchase_orders', noField: 'order_no', amountField: 'total_amount', label: '訂購單' },
  // 之後擴充：price_batch / repair_quote / service_fee ...
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
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle()
  return {
    id: user.id,
    name: (profile?.full_name as string) ?? user.email ?? '未知使用者',
    role: (profile?.role as string) ?? 'user',
  }
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

/** 判斷 user 是否為指定關卡的合法簽核人 */
export function canApproveStep(
  step: { approver_type: string; approver_user_id: string | null; approver_role: string | null },
  user: { id: string; role: string },
) {
  if (isAdmin(user.role)) return true
  if (step.approver_type === 'user') return step.approver_user_id === user.id
  if (step.approver_type === 'role') return step.approver_role === user.role
  return false
}
