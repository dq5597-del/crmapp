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
export function driveImageUrl(url: string | null | undefined, width = 1000): string {
  const u = (url ?? '').trim()
  if (!u) return ''
  if (!/(?:drive|docs)\.google\.com/.test(u)) return u

  const m =
    u.match(/\/file\/d\/([\w-]{10,})/) ||   // .../file/d/ID/view
    u.match(/[?&]id=([\w-]{10,})/) ||        // ...?id=ID / uc?export=view&id=ID / thumbnail?id=ID
    u.match(/\/d\/([\w-]{10,})/)             // docs.google.com/.../d/ID/...
  if (!m) return u

  return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${width}`
}
