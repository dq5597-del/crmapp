import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { driveMode, ensureDriveFolderPath, getDriveFolderPath } from '@/lib/gdrive'

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

function displayPath(parts: string[]) {
  return ['我的雲端硬碟', ...parts].join('\\')
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  if (driveMode() !== 'oauth') {
    return NextResponse.json({ error: 'Google Drive 必須使用個人 OAuth 模式，資料才能同步到 G 槽。' }, { status: 503 })
  }

  let clientId = ''
  let action: 'ensure' | 'assign' | 'reset' = 'ensure'
  let assignedFolderId = ''
  try {
    const body = await req.json()
    clientId = String(body.client_id ?? '').trim()
    action = body.action === 'assign' || body.action === 'reset' ? body.action : 'ensure'
    assignedFolderId = String(body.folder_id ?? '').trim()
  } catch {
    return NextResponse.json({ error: '請提供正確資料' }, { status: 400 })
  }
  if (!clientId) return NextResponse.json({ error: '缺少客戶 ID' }, { status: 400 })

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, company_name, drive_folder_id, drive_folder_path, drive_folder_custom')
    .eq('id', clientId)
    .maybeSingle()
  if (error || !client) {
    return NextResponse.json({ error: error?.message ?? '找不到客戶' }, { status: 404 })
  }

  const saveMapping = async (folderId: string, path: string, custom: boolean) => {
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        drive_folder_id: folderId,
        drive_folder_path: path,
        drive_folder_custom: custom,
      })
      .eq('id', clientId)
    if (updateError) throw new Error('儲存客戶資料夾位置失敗：' + updateError.message)
  }

  try {
    if (action === 'assign') {
      if (!assignedFolderId || assignedFolderId === 'root') {
        return NextResponse.json({ error: '請選擇「我的雲端硬碟」底下的資料夾' }, { status: 400 })
      }
      const selected = await getDriveFolderPath(assignedFolderId)
      if (!selected.reachedRoot || selected.folders.length === 0) {
        return NextResponse.json({ error: '只能指派「我的雲端硬碟」內的資料夾' }, { status: 400 })
      }
      const pathParts = selected.folders.map(folder => folder.name)
      const path = displayPath(pathParts)
      const folderName = selected.folders[selected.folders.length - 1].name
      await saveMapping(assignedFolderId, path, true)
      return NextResponse.json({
        folder_id: assignedFolderId,
        folder_name: folderName,
        path,
        reused: true,
        custom: true,
      })
    }

    if (action !== 'reset' && client.drive_folder_id) {
      try {
        const selected = await getDriveFolderPath(client.drive_folder_id)
        if (!selected.reachedRoot || selected.folders.length === 0) {
          throw new Error('指定資料夾已不在「我的雲端硬碟」內')
        }
        const pathParts = selected.folders.map(folder => folder.name)
        const path = displayPath(pathParts)
        if (path !== client.drive_folder_path) {
          await saveMapping(client.drive_folder_id, path, !!client.drive_folder_custom)
        }
        return NextResponse.json({
          folder_id: client.drive_folder_id,
          folder_name: selected.folders[selected.folders.length - 1].name,
          path,
          reused: true,
          custom: !!client.drive_folder_custom,
        })
      } catch (storedFolderError) {
        if (client.drive_folder_custom) throw storedFolderError
      }
    }

    const folderName = safeClientFolderName(String(client.company_name ?? ''))
    if (!folderName) return NextResponse.json({ error: '客戶名稱無法作為資料夾名稱' }, { status: 400 })

    const result = await ensureDriveFolderPath([...CLIENT_FOLDER_BASE, folderName])
    const finalFolder = result.folders[result.folders.length - 1]
    const path = displayPath([...CLIENT_FOLDER_BASE, folderName])
    await saveMapping(result.id, path, false)
    return NextResponse.json({
      folder_id: result.id,
      folder_name: folderName,
      path,
      reused: !finalFolder.created,
      custom: false,
    })
  } catch (driveError: any) {
    return NextResponse.json({ error: driveError?.message ?? '處理客戶資料夾失敗' }, { status: 502 })
  }
}
