import { NextResponse } from 'next/server'
import { downloadFromDrive, driveConfigured } from '@/lib/gdrive'

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

  const id = params.file.replace(/\.(jpe?g|png|webp|gif)$/i, '')
  if (!/^[\w-]{10,}$/.test(id)) {
    return NextResponse.json({ error: '無效檔案' }, { status: 400 })
  }

  try {
    const { body, mimeType } = await downloadFromDrive(id)
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json({ error: '僅允許圖片' }, { status: 403 })
    }
    return new NextResponse(body as any, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '讀取失敗' }, { status: 404 })
  }
}
