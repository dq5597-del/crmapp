import crypto from 'crypto'

/**
 * Google Drive 整合（服務帳號 / Service Account）
 *
 * 需要的環境變數（設在 Vercel，勿寫進程式碼）：
 *   GOOGLE_SA_EMAIL        服務帳號 email，例：crm-uploader@xxx.iam.gserviceaccount.com
 *   GOOGLE_SA_PRIVATE_KEY  服務帳號私鑰（-----BEGIN PRIVATE KEY----- 開頭那整段）
 *   GDRIVE_FOLDER_ID       你在 Google Drive 建立並「共用給服務帳號」的資料夾 ID
 *
 * 檔案預設是私有的：只有你的 Drive 與服務帳號看得到。
 * CRM 顯示照片時走 /api/drive/file/[id] 代理（需登入），不會外流。
 * 只有要推到官網的產品圖，才會另外設成「知道連結的人可讀」。
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive'

/** 使用者 OAuth 模式（檔案存進「你自己的」Google Drive，吃你的 15GB） */
export function oauthConfigured() {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  )
}

/** 服務帳戶模式（只能寫「共用雲端硬碟」，個人 Gmail 無法使用 —— 服務帳戶沒有儲存配額） */
export function serviceAccountConfigured() {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY)
}

export function driveConfigured() {
  return !!process.env.GDRIVE_FOLDER_ID && (oauthConfigured() || serviceAccountConfigured())
}

export function driveMode(): 'oauth' | 'service_account' | 'none' {
  if (oauthConfigured()) return 'oauth'
  if (serviceAccountConfigured()) return 'service_account'
  return 'none'
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 用服務帳號私鑰簽 JWT，換取 access token */
/** 私鑰容錯：使用者可能連 JSON 的引號一起貼、換行被轉義、或前後有空白 */
function normalizePrivateKey(raw: string): string {
  let k = (raw ?? '').trim()

  // 字面上的 \n → 真正的換行；去掉 \r
  k = k.replace(/\\n/g, '\n').replace(/\r/g, '')

  // 沒有 PEM 標頭 → 試著當成整包 base64 解開
  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(k)) {
    try {
      const decoded = Buffer.from(k, 'base64').toString('utf8')
      if (/BEGIN [A-Z ]*PRIVATE KEY/.test(decoded)) k = decoded
    } catch { /* ignore */ }
  }

  // 直接把 PEM 區塊「挖」出來 —— 前後多貼了引號、逗號、"private_key":、
  // 甚至整個 JSON 檔都無所謂，一律只取 BEGIN…END 之間的內容。
  const m = k.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/)
  if (!m) {
    throw new Error('找不到 PEM 私鑰區塊。請確認 GOOGLE_SA_PRIVATE_KEY 內含 -----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY----- 這一整段。')
  }

  const label = m[1]
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '')   // 只留 base64 字元
  const lines = body.match(/.{1,64}/g) ?? []

  return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`, ''].join('\n')
}

/** 用使用者的 refresh token 換 access token（檔案歸使用者所有） */
async function getAccessTokenViaOAuth(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error('Google 授權失敗（refresh token 可能已失效，請重新授權）：' + (data.error_description ?? data.error ?? res.status))
  }
  return data.access_token
}

async function getAccessToken(): Promise<string> {
  if (oauthConfigured()) return getAccessTokenViaOAuth()

  const email = process.env.GOOGLE_SA_EMAIL!
  const key = normalizePrivateKey(process.env.GOOGLE_SA_PRIVATE_KEY ?? '')

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }))

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const signature = b64url(signer.sign(key))
  const jwt = `${header}.${claim}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Google 認證失敗：' + (data.error_description ?? data.error ?? res.status))
  return data.access_token
}

export interface DriveFolderInfo {
  id: string
  name: string
  parents: string[]
}

async function getDriveFolderInfoWithToken(folderId: string, token: string): Promise<DriveFolderInfo> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  if (!res.ok) throw new Error('找不到 Drive 資料夾：' + (data.error?.message ?? res.status))
  if (data.trashed || data.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('指定項目不是可使用的 Google Drive 資料夾')
  }
  return { id: data.id, name: data.name, parents: data.parents ?? [] }
}

/** 取得並驗證單一 Google Drive 資料夾。 */
export async function getDriveFolderInfo(folderId: string) {
  const token = await getAccessToken()
  return getDriveFolderInfoWithToken(folderId, token)
}

/** 列出指定父資料夾底下的子資料夾。 */
export async function listDriveFolders(parentId = 'root'): Promise<DriveFolderInfo[]> {
  const token = await getAccessToken()
  const q = encodeURIComponent(
    `'${parentId.replace(/'/g, "\\'")}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,parents)&orderBy=name_natural&pageSize=1000&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  if (!res.ok) throw new Error('讀取 Drive 資料夾失敗：' + (data.error?.message ?? res.status))
  return (data.files ?? []).map((folder: any) => ({
    id: folder.id,
    name: folder.name,
    parents: folder.parents ?? [],
  }))
}

/** 從指定資料夾回溯到「我的雲端硬碟」，供人工指派時驗證並產生顯示路徑。 */
export async function getDriveFolderPath(folderId: string) {
  const token = await getAccessToken()
  const root = await getDriveFolderInfoWithToken('root', token)
  const folders: DriveFolderInfo[] = []
  let currentId = folderId

  for (let depth = 0; depth < 50; depth += 1) {
    if (currentId === 'root' || currentId === root.id) {
      return { folders, reachedRoot: true }
    }
    const folder = await getDriveFolderInfoWithToken(currentId, token)
    folders.unshift(folder)
    const parentId = folder.parents[0]
    if (!parentId) return { folders, reachedRoot: false }
    currentId = parentId
  }

  throw new Error('Google Drive 資料夾層級過深，無法確認完整路徑')
}

async function ensureFolderUnderParent(name: string, parent: string, token: string): Promise<{ id: string; created: boolean }> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )
  const findRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const found = await findRes.json()
  if (!findRes.ok) throw new Error('搜尋 Drive 資料夾失敗：' + (found.error?.message ?? findRes.status))
  if (found.files?.length) return { id: found.files[0].id, created: false }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    }),
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error('建立 Drive 資料夾失敗：' + (created.error?.message ?? ''))
  return { id: created.id, created: true }
}

async function ensureDriveFolderPathWithToken(parts: string[], startParentId: string, token: string) {
  let parentId = startParentId
  const folders: { id: string; name: string; created: boolean }[] = []

  for (const rawName of parts) {
    const name = rawName.trim()
    if (!name) throw new Error('Drive 資料夾名稱不可為空白')
    const folder = await ensureFolderUnderParent(name, parentId, token)
    folders.push({ id: folder.id, name, created: folder.created })
    parentId = folder.id
  }

  return { id: parentId, folders }
}

/** 取得（或建立）GDRIVE_FOLDER_ID 底下的子資料夾。 */
export async function ensureFolder(name: string, token?: string): Promise<string> {
  const t = token ?? await getAccessToken()
  const result = await ensureFolderUnderParent(name, process.env.GDRIVE_FOLDER_ID!, t)
  return result.id
}

/** 從指定父資料夾逐層尋找或建立路徑；'root' 代表個人「我的雲端硬碟」。 */
export async function ensureDriveFolderPath(parts: string[], startParentId = 'root') {
  const token = await getAccessToken()
  return ensureDriveFolderPathWithToken(parts, startParentId, token)
}

async function ensureShortcutUnderParent(targetId: string, name: string, parentId: string, token: string) {
  const q = encodeURIComponent(
    `'${parentId.replace(/'/g, "\\'")}' in parents and mimeType='application/vnd.google-apps.shortcut' and trashed=false`
  )
  const findRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,shortcutDetails(targetId))&pageSize=1000&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const found = await findRes.json()
  if (!findRes.ok) throw new Error('搜尋 Drive 型錄捷徑失敗：' + (found.error?.message ?? findRes.status))
  if ((found.files ?? []).some((file: any) => file.shortcutDetails?.targetId === targetId)) {
    return { created: false }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: [parentId],
      shortcutDetails: { targetId },
    }),
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error('建立 Drive 型錄捷徑失敗：' + (created.error?.message ?? createRes.status))
  return { created: true }
}

/**
 * 將同一份 Drive 型錄放進多個「大類 / 小類」資料夾。
 * 原檔只保留一份，其他分類使用 Drive 捷徑，避免重複占用空間。
 */
export async function classifyDriveFile(fileId: string, folderPaths: string[][], displayName?: string, token?: string) {
  const t = token ?? await getAccessToken()
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,parents,trashed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${t}` } }
  )
  const meta = await metaRes.json()
  if (!metaRes.ok || meta.trashed) throw new Error('找不到可分類的 Google Drive 型錄：' + (meta.error?.message ?? metaRes.status))

  const uniquePaths = Array.from(new Map(
    folderPaths.map(parts => [JSON.stringify(parts.map(part => part.trim()).filter(Boolean)), parts.map(part => part.trim()).filter(Boolean)])
  ).values()).filter(parts => parts.length > 0)
  const existingParents = new Set<string>(meta.parents ?? [])
  let createdShortcuts = 0

  for (const parts of uniquePaths) {
    const destination = await ensureDriveFolderPathWithToken(parts, process.env.GDRIVE_FOLDER_ID!, t)
    if (existingParents.has(destination.id)) continue
    const shortcut = await ensureShortcutUnderParent(fileId, (displayName || meta.name || '產品型錄').trim(), destination.id, t)
    if (shortcut.created) createdShortcuts += 1
  }

  return { fileId, folderCount: uniquePaths.length, createdShortcuts }
}

/** 上傳檔案到 Drive（multipart），回傳 file id */
export async function uploadToDrive(opts: {
  folder: string           // 子資料夾名稱（會自動建立）
  folderPaths?: string[][] // 多層分類路徑；第一個路徑存原檔，其餘建立捷徑
  name: string
  mimeType: string
  data: Buffer
  makePublic?: boolean     // 產品圖要推官網 → 需要公開連結
}): Promise<{ id: string; publicUrl?: string }> {
  const token = await getAccessToken()
  const normalizedPaths = (opts.folderPaths ?? [])
    .map(parts => parts.map(part => part.trim()).filter(Boolean))
    .filter(parts => parts.length > 0)
  const folderId = normalizedPaths.length > 0
    ? (await ensureDriveFolderPathWithToken(normalizedPaths[0], process.env.GDRIVE_FOLDER_ID!, token)).id
    : await ensureFolder(opts.folder, token)

  const boundary = 'crmboundary' + Date.now()
  const metadata = JSON.stringify({ name: opts.name, parents: [folderId] })

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`),
    opts.data,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body as any,
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error('上傳 Drive 失敗：' + (data.error?.message ?? res.status))

  let publicUrl: string | undefined
  if (opts.makePublic) {
    // 產品圖要讓 WooCommerce 抓得到 → 設成「知道連結的人可讀」
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })
    // 圖片提供可嵌入網址；其他檔案提供直接下載網址。
    publicUrl = opts.mimeType.startsWith('image/')
      ? `https://drive.google.com/thumbnail?id=${data.id}&sz=w1600`
      : `https://drive.google.com/uc?export=download&id=${data.id}`
  }

  if (normalizedPaths.length > 1) {
    await classifyDriveFile(data.id, normalizedPaths, opts.name, token)
  }

  return { id: data.id, publicUrl }
}

/** 下載檔案內容（供 CRM 代理顯示，檔案維持私有） */
export async function downloadFromDrive(fileId: string): Promise<{ body: ArrayBuffer; mimeType: string }> {
  const token = await getAccessToken()

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const meta = await metaRes.json()
  if (!metaRes.ok) throw new Error('找不到檔案：' + (meta.error?.message ?? ''))

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('下載失敗：HTTP ' + res.status)

  return { body: await res.arrayBuffer(), mimeType: meta.mimeType ?? 'application/octet-stream' }
}

/** 刪除檔案（丟到 Drive 垃圾桶） */
export async function trashDriveFile(fileId: string) {
  const token = await getAccessToken()
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

/** 測試連線 */
export async function testDrive() {
  const token = await getAccessToken()
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${process.env.GDRIVE_FOLDER_ID}?fields=id,name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'HTTP ' + res.status)
  return { mode: driveMode(), folder_id: data.id, folder_name: data.name }
}
