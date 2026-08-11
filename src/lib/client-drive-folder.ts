export interface ClientDriveFolderResult {
  folder_id: string
  folder_name: string
  path: string
  reused: boolean
  custom: boolean
}

export interface DriveFolderOption {
  id: string
  name: string
}

async function requestClientDriveFolder(
  clientId: string,
  action: 'ensure' | 'assign' | 'reset',
  folderId?: string,
) {
  const response = await fetch('/api/drive/client-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, action, folder_id: folderId }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '建立客戶資料夾失敗')
  return data as ClientDriveFolderResult
}

export function ensureClientDriveFolder(clientId: string) {
  return requestClientDriveFolder(clientId, 'ensure')
}

export function assignClientDriveFolder(clientId: string, folderId: string) {
  return requestClientDriveFolder(clientId, 'assign', folderId)
}

export function resetClientDriveFolder(clientId: string) {
  return requestClientDriveFolder(clientId, 'reset')
}

export async function listClientDriveFolders(parentId = 'root') {
  const response = await fetch(`/api/drive/folders?parent_id=${encodeURIComponent(parentId)}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '讀取 Google Drive 資料夾失敗')
  return data.folders as DriveFolderOption[]
}

export async function openClientDriveFolder(clientId: string) {
  const driveWindow = window.open('about:blank', '_blank')
  if (!driveWindow) throw new Error('瀏覽器封鎖了新分頁，請允許此網站開啟彈出式視窗')

  driveWindow.opener = null
  try {
    const folder = await ensureClientDriveFolder(clientId)
    driveWindow.location.replace(
      `https://drive.google.com/drive/folders/${encodeURIComponent(folder.folder_id)}`,
    )
    return folder
  } catch (error) {
    driveWindow.close()
    throw error
  }
}
