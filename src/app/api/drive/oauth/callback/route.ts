import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const html = (body: string) => new NextResponse(
  `<!doctype html><meta charset="utf-8"><title>Google Drive 授權</title>
   <body style="font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.7;color:#111">
   ${body}</body>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
)

/**
 * GET /api/drive/oauth/callback?code=...
 * 用授權碼換 refresh token，並「顯示」給使用者自行貼進 Vercel。
 * 我們刻意不把它寫進資料庫 —— 密鑰只放在 Vercel 環境變數。
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')

  if (err) return html(`<h2>授權被取消</h2><p>Google 回傳：<code>${err}</code></p>`)
  if (!code) return html('<h2>缺少授權碼</h2><p>請重新從 /api/drive/oauth/start 開始。</p>')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      redirect_uri: `${url.origin}/api/drive/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()

  if (!res.ok || !data.refresh_token) {
    return html(`<h2>取得 refresh token 失敗</h2>
      <p>Google 回傳：</p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto">${
        JSON.stringify(data, null, 2).replace(/</g, '&lt;')
      }</pre>
      <p>若沒有 <code>refresh_token</code>，通常是這個帳號先前已授權過。<br>
      請到 <a href="https://myaccount.google.com/permissions" target="_blank">Google 帳戶 → 第三方存取</a>
      移除此應用程式後，再重新授權一次。</p>`)
  }

  return html(`<h2>✅ 授權成功</h2>
    <p>把下面這串<b>完整複製</b>，貼到 Vercel → crmapp → Settings → Environment Variables，
    新增變數名稱 <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>，然後 <b>Redeploy</b>。</p>
    <pre id="t" style="background:#111;color:#0f0;padding:16px;border-radius:8px;word-break:break-all;white-space:pre-wrap">${
      String(data.refresh_token).replace(/</g, '&lt;')
    }</pre>
    <button onclick="navigator.clipboard.writeText(document.getElementById('t').innerText);this.textContent='已複製'"
      style="padding:10px 18px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer">複製</button>
    <p style="color:#b00;margin-top:24px"><b>注意：</b>這串等同你的 Google Drive 存取權，請勿外流、勿貼到聊天室、勿放進 GitHub。
    貼進 Vercel 後就關掉這個頁面。</p>`)
}
