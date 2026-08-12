export const CATALOG_DRIVE_ROOT = '型錄分類'
const WEBSITE_CATEGORY_SEPARATOR = ' > '

export function encodeWebsiteCategory(mainCategory: string, subCategory: string) {
  return `${mainCategory.trim()}${WEBSITE_CATEGORY_SEPARATOR}${subCategory.trim()}`
}

export function parseWebsiteCategory(value: string): { mainCategory: string | null; subCategory: string } {
  const normalized = value.trim()
  const separatorIndex = normalized.indexOf(WEBSITE_CATEGORY_SEPARATOR)
  if (separatorIndex < 0) return { mainCategory: null, subCategory: normalized }
  return {
    mainCategory: normalized.slice(0, separatorIndex).trim() || null,
    subCategory: normalized.slice(separatorIndex + WEBSITE_CATEGORY_SEPARATOR.length).trim(),
  }
}

export function websiteCategoryLeaf(value: string) {
  return parseWebsiteCategory(value).subCategory
}

/** 型錄路徑：根目錄 / 大類 / 小類 / 品牌，或根目錄 / 大類 / 小類 / _篩選器 / 群組 / Tag。 */
export function normalizeCatalogFolderPaths(value: unknown): string[][] {
  if (!Array.isArray(value)) return []

  const paths = value
    .slice(0, 100)
    .filter(Array.isArray)
    .map(parts => (parts as unknown[])
      .slice(0, 6)
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
