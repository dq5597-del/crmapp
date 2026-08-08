import { createHash, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export function printServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function printCurrentUser() {
  const auth = createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const service = printServiceClient()
  if (!service) return null
  const { data: profile } = await service.from('user_profiles')
    .select('id, full_name, role, title, branch_id').eq('id', user.id).maybeSingle()
  if (!profile) return null
  return profile as { id: string; full_name: string | null; role: string; title: string | null; branch_id: string | null }
}

export function isPrintAdmin(user: { role: string; title: string | null }) {
  return ['admin', '管理員'].includes(user.role) || ['董事長', 'CEO'].includes(user.title ?? '')
}

export function newDeviceToken() { return randomBytes(32).toString('base64url') }
export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex') }

export async function authenticatePrinter(printerId: string | null, token: string | null) {
  if (!printerId || !token) return null
  const service = printServiceClient()
  if (!service) return null
  const { data } = await service.from('print_printers').select('*').eq('id', printerId).eq('is_active', true).maybeSingle()
  if (!data || data.device_token_hash !== tokenHash(token)) return null
  return { service, printer: data }
}

