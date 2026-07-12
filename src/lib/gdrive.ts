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

/** 取得（或建立）子資料夾，例：專案照片 / 產品圖片 / 專案檔案 */
export async function ensureFolder(name: string, token?: string): Promise<string> {
  const t = token ?? await getAccessToken()
  const parent = process.env.GDRIVE_FOLDER_ID!

  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )
  const findRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${t}` } }
  )
  const found = await findRes.json()
  if (found.files?.length) return found.files[0].id

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    }),
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error('建立 Drive 資料夾失敗：' + (created.error?.message ?? ''))
  return created.id
}

/** 上傳檔案到 Drive（multipart），回傳 file id */
export async function uploadToDrive(opts: {
  folder: string           // 子資料夾名稱（會自動建立）
  name: string
  mimeType: string
  data: Buffer
  makePublic?: boolean     // 產品圖要推官網 → 需要公開連結
}): Promise<{ id: string; publicUrl?: string }> {
  const token = await getAccessToken()
  const folderId = await ensureFolder(opts.folder, token)

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
    publicUrl = `https://drive.google.com/uc?export=view&id=${data.id}`
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
