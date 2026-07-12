import { NextResponse } from 'next/server'
import { uploadToDrive, driveConfigured, testDrive } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/drive/upload   （multipart form-data）
 *   file    檔案
 *   folder  子資料夾名稱（專案照片 / 產品圖片 / 專案檔案 / 名片…）
 *   public  '1' = 設成公開連結（產品圖要推官網才需要）
 *
 * 回傳 { file_id, public_url? }
 */
export async function POST(req: Request) {
  if (!driveConfigured()) {
    return NextResponse.json({
      error: '尚未設定 Google Drive。請在 Vercel 加入 GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY / GDRIVE_FOLDER_ID 後重新部署。',
    }, { status: 500 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const folder = (form.get('folder') as string) || '其他'
    const isPublic = form.get('public') === '1'

    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const result = await uploadToDrive({
      folder,
      name: `${Date.now()}_${file.name}`,
      mimeType: file.type || 'application/octet-stream',
      data: buf,
      makePublic: isPublic,
    })

    return NextResponse.json({ file_id: result.id, public_url: result.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '上傳失敗' }, { status: 500 })
  }
}

/** GET /api/drive/upload → 測試連線 */
export async function GET() {
  if (!driveConfigured()) {
    return NextResponse.json({ connected: false, error: '尚未設定 GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY / GDRIVE_FOLDER_ID' })
  }
  try {
    const info = await testDrive()
    return NextResponse.json({ connected: true, ...info })
  } catch (e: any) {
    // 給出可行動的診斷，而不是只有一句英文錯誤
    const raw = process.env.GOOGLE_SA_PRIVATE_KEY ?? ''
    const hint =
      /DECODER|unsupported|PEM/i.test(e.message ?? '')
        ? '私鑰讀不出來。GOOGLE_SA_PRIVATE_KEY 只要「含有」-----BEGIN PRIVATE KEY----- 到 -----END PRIVATE KEY----- 這一整段即可（前後多貼引號、逗號、甚至整個 JSON 檔內容都沒關係，系統會自動抓出來）。請確認這一整段有完整貼上、沒有被截斷。'
        : /not found|404/i.test(e.message ?? '')
          ? '找不到資料夾。請確認 GDRIVE_FOLDER_ID 正確，且該資料夾已用「編輯者」權限分享給服務帳戶。'
          : /Drive API|has not been used|disabled/i.test(e.message ?? '')
            ? 'Google Drive API 尚未啟用，請到 Google Cloud Console 啟用 Drive API。'
            : undefined
    return NextResponse.json({
      connected: false,
      error: e.message,
      hint,
      debug: {
        has_email: !!process.env.GOOGLE_SA_EMAIL,
        has_key: !!raw,
        key_len: raw.length,
        key_starts_with_begin: raw.trim().startsWith('-----BEGIN'),
        key_has_quotes: raw.trim().startsWith('"'),
        key_has_begin_marker: raw.includes('BEGIN PRIVATE KEY'),
        key_has_end_marker: raw.includes('END PRIVATE KEY'),
        has_folder: !!process.env.GDRIVE_FOLDER_ID,
      },
    })
  }
}
