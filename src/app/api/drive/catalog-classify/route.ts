import { NextResponse } from 'next/server'
import { CATALOG_DRIVE_ROOT, extractGoogleDriveFileId, normalizeCatalogFolderPaths } from '@/lib/catalog-drive'
import { classifyDriveFile, driveConfigured } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const maxDuration = 60

type DownloadInput = { file_name?: unknown; file_url?: unknown }

export async function POST(req: Request) {
  if (!driveConfigured()) {
    return NextResponse.json({ error: '尚未設定 Google Drive' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const folderPaths = normalizeCatalogFolderPaths(body.folder_paths)
    const safePaths = folderPaths.length > 0 ? folderPaths : [[CATALOG_DRIVE_ROOT, '未分類']]
    const downloads = Array.isArray(body.downloads) ? body.downloads.slice(0, 50) as DownloadInput[] : []
    const results = []

    for (const download of downloads) {
      const url = typeof download.file_url === 'string' ? download.file_url : ''
      const fileId = extractGoogleDriveFileId(url)
      if (!fileId) continue
      const name = typeof download.file_name === 'string' ? download.file_name.trim() : ''
      results.push(await classifyDriveFile(fileId, safePaths, name || undefined))
    }

    return NextResponse.json({ classified: results.length, results })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '型錄分類失敗' }, { status: 500 })
  }
}
