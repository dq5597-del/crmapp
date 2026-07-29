/**
 * Supabase Storage object key 安全化
 *
 * Storage 對 object key 的驗證規則是 S3-safe 字元集：
 *   ^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$
 * 其中 \w 只涵蓋 ASCII，所以中文、全形括號「（）」一律被拒，
 * 回 400 InvalidKey —— 症狀是上傳失敗、前端只看到「請稍後再試」。
 *
 * 原則：**路徑用 ASCII，顯示名稱另外存**。
 *   - 需要客戶看到中文檔名 → createSignedUrl 的 download 參數（Content-Disposition）
 *   - 站內附件 → 檔名另存欄位（如 chat_messages.attachment_name）
 */

/** 把任意檔名轉成可安全當作 storage key 的形式（保留副檔名） */
export function toStorageSafeName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : ''
  const rawBase = dot > 0 ? fileName.slice(0, dot) : fileName

  const ext = rawExt.replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(0, 10)
  const base =
    rawBase
      .normalize('NFKC')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '')
      .slice(0, 60) || 'file'

  return ext ? `${base}.${ext}` : base
}

/** 供 Content-Disposition 使用的顯示檔名（可含中文，只擋會破壞 header 的字元） */
export function toDownloadName(fileName: string, fallback = '檔案'): string {
  return fileName.replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 80) || fallback
}
