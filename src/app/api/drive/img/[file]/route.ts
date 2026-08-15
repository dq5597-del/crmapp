import { NextResponse } from 'next/server'
import { downloadFromDrive, driveConfigured, DriveAuthError } from '@/lib/gdrive'

export const runtime = 'nodejs'

/**
 * GET /api/drive/img/[file]（file 形如 FILEID.jpg）
 *
 * 公開圖片代理：專門給官網 (WooCommerce) 抓產品圖用。
 * WordPress 匯入外部圖片時會用「網址的副檔名」判斷檔案類型，
 * Drive 的 thumbnail 網址沒有副檔名 → WP 回「沒有上傳這個檔案類型的權限」。
 * 此路由讓網址以 .jpg 結尾，並由伺服器端向 Drive 取檔後回傳。
 *
 * 安全限制：只回傳 image/* 類型；檔案 ID 非猜測可得。
 */
export async function GET(_req: Request, { params }: { params: { file: string } }) {
  if (!driveConfigured()) {
    return NextResponse.json({ error: 'Google Drive 尚未設定' }, { status: 500 })
  }

  const wantWebp = /\.webp$/i.test(params.file)
  const id = params.file.replace(/\.(jpe?g|png|webp|gif)$/i, '')
  if (!/^[\w-]{10,}$/.test(id)) {
    return NextResponse.json({ error: '無效檔案' }, { status: 400 })
  }

  try {
    const { body, mimeType } = await downloadFromDrive(id)
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json({ error: '僅允許圖片' }, { status: 403 })
    }

    // 要求 .webp 時轉檔輸出（官網存 WebP，檔案更小）；原本就是 webp/gif 不重轉
    let out: Buffer | ArrayBuffer = body
    let outType = mimeType
    if (wantWebp && mimeType !== 'image/webp' && mimeType !== 'image/gif') {
      const sharp = (await import('sharp')).default
      out = await sharp(Buffer.from(body)).rotate().webp({ quality: 85 }).toBuffer()
      outType = 'image/webp'
    }

    return new NextResponse(out as any, {
      status: 200,
      headers: {
        'Content-Type': outType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e: any) {
    // 授權失敗是伺服器端問題，不是「找不到檔案」。
    // 原本一律回 404，導致 WooCommerce 推送顯示「錯誤: Not Found」，
    // 排查方向被誤導成圖片被刪除。改為回 502 並標示原因。
    if (e instanceof DriveAuthError || e?.isAuthError) {
      return NextResponse.json(
        {
          error: e.message ?? 'Google Drive 授權失敗',
          failure: 'CREDENTIALS',
          hint: '請確認 GOOGLE_OAUTH_REFRESH_TOKEN 是否有效；若為批次操作，可能是短時間內大量請求遭 Google 限流，稍後重試即可。',
        },
        { status: 502, headers: { 'X-Failure': 'CREDENTIALS' } }
      )
    }
    return NextResponse.json(
      { error: e.message ?? '讀取失敗', failure: 'NOT_FOUND' },
      { status: 404, headers: { 'X-Failure': 'NOT_FOUND' } }
    )
  }
}
