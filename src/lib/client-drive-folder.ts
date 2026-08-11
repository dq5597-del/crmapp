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
