import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 診斷用：只顯示金鑰長度與開頭 4 碼，不外洩完整值
export async function GET() {
  const id = process.env.TDX_CLIENT_ID ?? ''
  const secret = process.env.TDX_CLIENT_SECRET ?? ''
  const mask = (s: string) => s ? `${s.slice(0, 4)}…（長度 ${s.length}）` : '（未設定）'
  const hasStar = (s: string) => /[*•]/.test(s)

  return NextResponse.json({
    client_id: mask(id),
    client_id_有星號: hasStar(id),
    client_id_有空白: id !== id.trim(),
    client_secret: mask(secret),
    client_secret_有星號: hasStar(secret),
    client_secret_有空白: secret !== secret.trim(),
    提示: '正常的 Client Id 長度約 40 字元、開頭是你的會員編號；Secret 約 36 字元。若「有星號」為 true，代表複製到遮罩字元，請用 TDX 頁面的「複製」按鈕重新複製。',
  })
}
