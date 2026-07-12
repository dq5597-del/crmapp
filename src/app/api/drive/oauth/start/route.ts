import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/drive/oauth/start
 * 導向 Google 授權頁。使用者按「允許」後會回到 /api/drive/oauth/callback，
 * 那裡會顯示 refresh token，再由使用者自己貼進 Vercel 環境變數。
 *
 * 需要的環境變數：
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: '尚未設定 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET' },
      { status: 500 },
    )
  }

  const origin = new URL(req.url).origin
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/drive/oauth/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive',
    access_type: 'offline',
    prompt: 'consent',          // 強制回傳 refresh_token
    include_granted_scopes: 'true',
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
