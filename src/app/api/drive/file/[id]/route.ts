import { NextResponse } from 'next/server'
import { downloadFromDrive, driveConfigured } from '@/lib/gdrive'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

/**
 * GET /api/drive/file/[id]
 * 代理顯示 Drive 上的私有檔案 —— 必須是登入的 CRM 使用者才看得到。
 * 這樣照片就不用設成公開連結，不會被外人抓走。
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!driveConfigured()) {
    return NextResponse.json({ error: 'Google Drive 尚未設定' }, { status: 500 })
  }

  // 驗證登入
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  try {
    const { body, mimeType } = await downloadFromDrive(params.id)
    return new NextResponse(body as any, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '讀取失敗' }, { status: 404 })
  }
}
