export const CATALOG_DRIVE_ROOT = '型錄分類'

/** 僅允許型錄分類根目錄下的大類 / 小類路徑。 */
export function normalizeCatalogFolderPaths(value: unknown): string[][] {
  if (!Array.isArray(value)) return []

  const paths = value
    .slice(0, 50)
    .filter(Array.isArray)
    .map(parts => (parts as unknown[])
      .slice(0, 4)
      .filter((part): part is string => typeof part === 'string')
      .map(part => part.trim().slice(0, 150))
      .filter(Boolean))
    .filter(parts => parts.length >= 1 && parts[0] === CATALOG_DRIVE_ROOT)

  return Array.from(new Map(paths.map(parts => [JSON.stringify(parts), parts])).values())
}

export function extractGoogleDriveFileId(url: string): string | null {
  const value = url.trim()
  if (!/^(?:https?:\/\/)?(?:drive|docs)\.google\.com\//i.test(value)) return null

  try {
    const parsed = new URL(value.startsWith('http') ? value : `https://${value}`)
    const queryId = parsed.searchParams.get('id')
    if (queryId && /^[A-Za-z0-9_-]{10,}$/.test(queryId)) return queryId
  } catch { /* 再嘗試路徑格式 */ }

  const pathId = value.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/i)?.[1]
  return pathId ?? null
}
