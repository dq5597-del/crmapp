import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 管理員在「系統設定 → 帳號管理」直接新增使用者帳號
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

export async function POST(req: NextRequest) {
  const sb = admin()
  if (!sb) {
    return NextResponse.json(
      { error: '系統尚未設定 SUPABASE_SERVICE_ROLE_KEY，請至 Vercel 設定環境變數後重新部署' },
      { status: 500 },
    )
  }

  const g = await requireAdmin(req, sb)
  if (!g.ok) return NextResponse.json({ error: g.msg }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  const fullName = String(body?.full_name ?? '').trim()
  const role = ['user', 'manager', 'admin'].includes(body?.role) ? body.role : 'user'
  const password = String(body?.password ?? '')

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 })
  if (!fullName) return NextResponse.json({ error: '請填寫姓名' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: '臨時密碼至少 8 碼' }, { status: 400 })

  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (cErr) {
    const msg = /already registered|already been registered|exists/i.test(cErr.message)
      ? '此 Email 已存在'
      : '建立帳號失敗：' + cErr.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const uid = created.user.id

  const { error: pErr } = await sb.from('user_profiles').upsert({
    id: uid,
    full_name: fullName,
    role,
    is_active: true,
  })
  if (pErr) {
    await sb.auth.admin.deleteUser(uid) // 回滾，避免孤兒帳號
    return NextResponse.json({ error: '建立員工資料失敗：' + pErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    user: { id: uid, full_name: fullName, role, is_active: true },
  }, { status: 201 })
}
