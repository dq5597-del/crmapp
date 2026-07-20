/**
 * Google Drive 圖片網址轉換工具
 *
 * 問題背景：
 * - Drive 的「分享連結」(https://drive.google.com/file/d/ID/view) 是網頁，不是圖片，
 *   放進 <img src> 會破圖。
 * - 舊的直連格式 (uc?export=view&id=ID) 已被 Google 限制熱連結，常回 403。
 * - 目前對外嵌圖最穩定的是 thumbnail 端點：
 *   https://drive.google.com/thumbnail?id=ID&sz=w1000
 *
 * 此函式把「任何形式」的 Drive 連結轉成 thumbnail 直連；
 * 非 Drive 網址原樣返回，因此可以安全套在所有 <img src> 上。
 */
/** 從任何形式的 Drive 連結抽出檔案 ID；不是 Drive 連結回 null */
export function driveFileId(url: string | null | undefined): string | null {
  const u = (url ?? '').trim()
  if (!u || !/(?:drive|docs)\.google\.com/.test(u)) return null
  const m =
    u.match(/\/file\/d\/([\w-]{10,})/) ||   // .../file/d/ID/view
    u.match(/[?&]id=([\w-]{10,})/) ||        // ...?id=ID / uc?export=view&id=ID / thumbnail?id=ID
    u.match(/\/d\/([\w-]{10,})/)             // docs.google.com/.../d/ID/...
  return m ? m[1] : null
}

export function driveImageUrl(url: string | null | undefined, width = 1000): string {
  const u = (url ?? '').trim()
  if (!u) return ''
  const id = driveFileId(u)
  if (!id) return u
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`
}

/**
 * 推送官網 (WooCommerce) 專用的圖片網址。
 * WP 匯入外部圖需要網址帶副檔名，因此 Drive 連結一律改走
 * CRM 自己的公開代理 /api/drive/img/ID.jpg（見 api/drive/img/[file]/route.ts）。
 * 非 Drive 網址原樣返回。僅供伺服器端使用。
 */
export function wooImageUrl(url: string | null | undefined): string {
  const u = (url ?? '').trim()
  if (!u) return ''
  const id = driveFileId(u)
  if (!id) return u
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ??
    ''
  ) || 'https://crmapp-topaz.vercel.app'
  return `${base.replace(/\/$/, '')}/api/drive/img/${id}.webp`
}
