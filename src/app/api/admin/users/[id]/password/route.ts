import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 管理員重設某帳號的密碼（直接設定新密碼）
 * 需要 SUPABASE_SERVICE_ROLE_KEY（僅伺服器端）
 */

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin(req: NextRequest, sb: ReturnType<typeof createClient>) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { ok: false as const, status: 401, msg: '未登入' }
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return { ok: false as const, status: 401, msg: '登入失效' }
  const { data: profile } = await sb.from('user_profiles').select('role').eq('id', user.id).single()
  if ((profile as any)?.role !== 'admin') return { ok: false as const, status: 403, msg: '需管理員權限' }
  return { ok: true as const, user }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = admin()
  if (!sb) return NextResponse.json({ error: '系統尚未設定 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const g = await requireAdmin(req, sb)
  if (!g.ok) return NextResponse.json({ error: g.msg }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const password = String(body?.password ?? '')
  if (password.length < 8) return NextResponse.json({ error: '新密碼至少 8 碼' }, { status: 400 })

  const { error } = await sb.auth.admin.updateUserById(params.id, { password })
  if (error) return NextResponse.json({ error: '重設密碼失敗：' + error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
