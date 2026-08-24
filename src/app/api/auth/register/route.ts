import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 員工註冊（需公司註冊碼 + 管理員審核）
 * 1. 伺服器端比對 system_settings.staff_register_code（未登入者讀不到，故必須在後端驗）
 * 2. 以 service role 建立帳號，並「停權(ban)」→ 管理員在帳號管理啟用後才能登入
 * 3. user_profiles 建立對應資料列，is_active = false（待審核）
 *
 * 環境變數：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（僅伺服器端）
 */

const BAN_FOREVER = '876000h' // ≈100 年，等同停權

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const sb = admin()
  if (!sb) {
    return NextResponse.json(
      { error: '系統尚未設定 SUPABASE_SERVICE_ROLE_KEY，請聯絡管理員' },
      { status: 500 },
    )
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }) }

  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const fullName = String(body?.full_name ?? '').trim()
  const code = String(body?.code ?? '').trim()

  // ── 驗證 ──
  if (!fullName) return NextResponse.json({ error: '請填寫姓名' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: '密碼至少 8 碼' }, { status: 400 })
  if (!code) return NextResponse.json({ error: '請輸入公司註冊碼' }, { status: 400 })

  // ── 比對註冊碼 ──
  const { data: settings, error: sErr } = await sb
    .from('system_settings')
    .select('staff_register_code')
    .limit(1)
    .maybeSingle()

  if (sErr) return NextResponse.json({ error: '無法讀取系統設定：' + sErr.message }, { status: 500 })

  const realCode = (settings?.staff_register_code ?? '').trim()
  if (!realCode) {
    return NextResponse.json({ error: '尚未設定公司註冊碼，請聯絡管理員至「系統設定」設定' }, { status: 403 })
  }
  if (code !== realCode) {
    return NextResponse.json({ error: '公司註冊碼不正確' }, { status: 403 })
  }

  // ── 建立帳號（建立後立即停權，待管理員審核啟用） ──
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (cErr) {
    const msg = /already registered|already been registered|exists/i.test(cErr.message)
      ? '此 Email 已註冊過'
      : '建立帳號失敗：' + cErr.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const uid = created.user.id

  // 停權：未審核前無法登入
  const { error: banErr } = await sb.auth.admin.updateUserById(uid, { ban_duration: BAN_FOREVER })
  if (banErr) {
    await sb.auth.admin.deleteUser(uid)
    return NextResponse.json({ error: '建立帳號失敗：' + banErr.message }, { status: 500 })
  }

  // user_profiles（待審核）
  const { error: pErr } = await sb.from('user_profiles').upsert({
    id: uid,
    full_name: fullName,
    role: 'user',
    is_active: false,
  })
  if (pErr) {
    await sb.auth.admin.deleteUser(uid) // 回滾，避免孤兒帳號
    return NextResponse.json({ error: '建立員工資料失敗：' + pErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
