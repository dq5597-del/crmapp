export async function ensureClientDriveFolder(clientId: string) {
  const response = await fetch('/api/drive/client-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '建立客戶資料夾失敗')
  return data as { folder_id: string; folder_name: string; path: string; reused: boolean }
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
