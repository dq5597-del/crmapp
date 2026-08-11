import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { driveMode, listDriveFolders } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  if (driveMode() !== 'oauth') {
    return NextResponse.json({ error: 'Google Drive 必須使用個人 OAuth 模式' }, { status: 503 })
  }

  const parentId = new URL(req.url).searchParams.get('parent_id')?.trim() || 'root'
  try {
    const folders = await listDriveFolders(parentId)
    return NextResponse.json({ parent_id: parentId, folders })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '讀取 Google Drive 資料夾失敗' }, { status: 502 })
  }
}
