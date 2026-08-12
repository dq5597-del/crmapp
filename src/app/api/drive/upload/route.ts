import { NextResponse } from 'next/server'
import { uploadToDrive, driveConfigured, testDrive, driveMode } from '@/lib/gdrive'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 60

// Vercel Functions 請求本文有大小限制，預留 multipart 邊界空間。
const MAX_FILE_SIZE = 4 * 1024 * 1024

/**
 * POST /api/drive/upload   （multipart form-data）
 *   file    檔案
 *   folder  子資料夾名稱（專案照片 / 產品圖片 / 專案檔案 / 名片…）
 *   public  '1' = 設成公開連結（產品圖要推官網才需要）
 *   convert_webp '1' = 圖片縮放並轉成 WebP（專案照片使用）
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
    const convertWebP = form.get('convert_webp') === '1'

    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '單一檔案不可超過 4MB；較大的檔案請先上傳到 Google Drive，再貼上共用連結。' }, { status: 400 })
    }

    let buf: Buffer = Buffer.from(await file.arrayBuffer())
    let fileName = file.name
    let mimeType = file.type || 'application/octet-stream'

    if (convertWebP) {
      const looksLikeImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
      if (!looksLikeImage) {
        return NextResponse.json({ error: '只能將圖片轉成 WebP' }, { status: 400 })
      }
      buf = await sharp(buf)
        .rotate()
        .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer()
      fileName = `${file.name.replace(/\.[^.]+$/, '') || `project-photo-${Date.now()}`}.webp`
      mimeType = 'image/webp'
    }

    const result = await uploadToDrive({
      folder,
      name: `${Date.now()}_${fileName}`,
      mimeType,
      data: buf,
      makePublic: isPublic,
    })

    return NextResponse.json({
      file_id: result.id,
      public_url: result.publicUrl,
      file_name: fileName,
      mime_type: mimeType,
      converted_to_webp: convertWebP,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '上傳失敗' }, { status: 500 })
  }
}

/** GET /api/drive/upload → 測試連線 */
export async function GET() {
  if (!driveConfigured()) {
    return NextResponse.json({ connected: false, error: '尚未設定 Google Drive。OAuth 模式需要 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN / GDRIVE_FOLDER_ID' })
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
          : /storage quota/i.test(e.message ?? '')
        ? '服務帳戶沒有儲存空間，無法寫入個人 Google Drive。請改用 OAuth 模式：開啟 /api/drive/oauth/start 授權你自己的 Google 帳號，再把 refresh token 設成 GOOGLE_OAUTH_REFRESH_TOKEN。'
      : /Drive API|has not been used|disabled/i.test(e.message ?? '')
            ? 'Google Drive API 尚未啟用，請到 Google Cloud Console 啟用 Drive API。'
            : undefined
    return NextResponse.json({
      connected: false,
      error: e.message,
      hint,
      debug: {
        mode: driveMode(),
        has_oauth_client: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
        has_oauth_refresh: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
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
