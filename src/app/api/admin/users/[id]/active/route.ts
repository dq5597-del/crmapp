import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 管理員審核：啟用／停用員工帳號
 * - 同步更新 user_profiles.is_active 與 auth 帳號的停權狀態(ban)
 * - 未啟用 = 停權 = 完全無法登入（不只是前端擋）
 */

const BAN_FOREVER = '876000h'

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
  const isActive = !!body?.is_active
  const userId = params.id

  if (g.user.id === userId && !isActive) {
    return NextResponse.json({ error: '不可停用自己的帳號' }, { status: 400 })
  }

  // 停權 / 解除停權
  const { error: banErr } = await sb.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? 'none' : BAN_FOREVER,
  })
  if (banErr) return NextResponse.json({ error: '更新登入權限失敗：' + banErr.message }, { status: 400 })

  const { error: uErr } = await sb.from('user_profiles').update({ is_active: isActive }).eq('id', userId)
  if (uErr) return NextResponse.json({ error: '更新啟用狀態失敗：' + uErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, is_active: isActive })
}
