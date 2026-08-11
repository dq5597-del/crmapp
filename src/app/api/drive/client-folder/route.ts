import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { driveMode, ensureDriveFolderPath } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const maxDuration = 60

const CLIENT_FOLDER_BASE = ['2.業務部資料', '5.專案資料', '花蓮地區']

function safeClientFolderName(name: string) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '－')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  if (driveMode() !== 'oauth') {
    return NextResponse.json({ error: 'Google Drive 必須使用個人 OAuth 帳號，才能同步到 G 槽的「我的雲端硬碟」。' }, { status: 503 })
  }

  let clientId = ''
  try {
    const body = await req.json()
    clientId = String(body.client_id ?? '').trim()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  if (!clientId) return NextResponse.json({ error: '缺少客戶 ID' }, { status: 400 })

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, company_name')
    .eq('id', clientId)
    .maybeSingle()
  if (error || !client) {
    return NextResponse.json({ error: error?.message ?? '找不到客戶資料' }, { status: 404 })
  }

  const folderName = safeClientFolderName(String(client.company_name ?? ''))
  if (!folderName) return NextResponse.json({ error: '客戶名稱無法作為資料夾名稱' }, { status: 400 })

  try {
    const result = await ensureDriveFolderPath([...CLIENT_FOLDER_BASE, folderName])
    const finalFolder = result.folders[result.folders.length - 1]
    return NextResponse.json({
      folder_id: result.id,
      folder_name: folderName,
      path: ['我的雲端硬碟', ...CLIENT_FOLDER_BASE, folderName].join('\\'),
      reused: !finalFolder.created,
    })
  } catch (driveError: any) {
    return NextResponse.json({ error: driveError?.message ?? '建立客戶資料夾失敗' }, { status: 502 })
  }
}
