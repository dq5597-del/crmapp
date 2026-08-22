export const PRODUCT_PHOTO_MAX_SIZE = 4 * 1024 * 1024

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])
const DESCRIPTION_IMAGE_START = '<!-- gh-imported-description-images:start -->'
const DESCRIPTION_IMAGE_END = '<!-- gh-imported-description-images:end -->'

export interface ProductPhotoLike {
  name: string
  size: number
  lastModified: number
  type?: string
}

export interface ProductPhotoTarget {
  rowNo: number
  model?: unknown
  webSku?: unknown
}

export type ProductPhotoRole = 'product' | 'description'

export interface MatchedProductPhoto<T extends ProductPhotoLike> {
  file: T
  identifier: string
  order: number
  role: ProductPhotoRole
}

export interface ProductPhotoDuplicate<T extends ProductPhotoLike> {
  rowNo: number
  order: number
  role: ProductPhotoRole
  files: T[]
}

export interface ProductPhotoAmbiguous<T extends ProductPhotoLike> {
  file: T
  rowNos: number[]
}

export interface ProductPhotoMatchResult<T extends ProductPhotoLike> {
  assignments: Map<number, MatchedProductPhoto<T>[]>
  unmatched: T[]
  ambiguous: ProductPhotoAmbiguous<T>[]
  duplicates: ProductPhotoDuplicate<T>[]
  matchedCount: number
}

export function productPhotoFileIdentity(file: ProductPhotoLike) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`
}

export function isSupportedProductPhoto(file: Pick<ProductPhotoLike, 'name' | 'type'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension) && (!file.type || file.type.startsWith('image/'))
}

/**
 * 檔名規則：
 * - 型號_01.jpg 為主圖，_02 之後為相簿；沒有序號時視為主圖。
 * - 型號_DESC_01.jpg 為產品介紹圖，也支援 CONTENT／INTRO／介紹。
 * 只把底線後的數字視為圖片序號，避免誤拆 A130、AMP-100 等正常型號。
 */
export function parseProductPhotoFileName(name: string) {
  const baseName = name.replace(/\.[^.]+$/, '').normalize('NFKC').trim()
  const descriptionMatch = baseName.match(/^(.*?)_(?:DESC|CONTENT|INTRO|介紹)(?:_(\d{1,3}))?$/i)
  if (descriptionMatch) {
    const identifier = descriptionMatch[1].trim().toUpperCase()
    const order = Number(descriptionMatch[2] ?? 1)
    return {
      identifier,
      order: Number.isFinite(order) && order > 0 ? order : 1,
      role: 'description' as const,
    }
  }
  const match = baseName.match(/^(.*?)_(\d{1,3})$/)
  const identifier = (match?.[1] ?? baseName).trim().toUpperCase()
  const order = match ? Number(match[2]) : 1
  return {
    identifier,
    order: Number.isFinite(order) && order > 0 ? order : 1,
    role: 'product' as const,
  }
}

function normalizeProductIdentifier(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim().toUpperCase()
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 以有標記的區塊加入產品介紹圖片；再次匯入時會取代舊區塊，避免圖片重複累加。 */
export function withProductDescriptionImages(description: unknown, imageUrls: string[], productName: unknown) {
  const original = String(description ?? '')
  const markerPattern = /<!-- gh-imported-description-images:start -->[\s\S]*?<!-- gh-imported-description-images:end -->/g
  const cleanDescription = original.replace(markerPattern, '').trim()
  if (!imageUrls.length) return cleanDescription
  const safeName = escapeHtmlAttribute(String(productName ?? '商品'))
  const imageHtml = imageUrls.map((url, index) => (
    `<figure class="wp-block-image size-full"><img src="${escapeHtmlAttribute(url)}" alt="${safeName} 產品介紹圖 ${index + 1}" loading="lazy" decoding="async" /></figure>`
  )).join('\n')
  return [
    cleanDescription,
    DESCRIPTION_IMAGE_START,
    '<div class="gh-product-description-images">',
    imageHtml,
    '</div>',
    DESCRIPTION_IMAGE_END,
  ].filter(Boolean).join('\n')
}

export function matchProductPhotos<T extends ProductPhotoLike>(
  rows: ProductPhotoTarget[],
  files: T[],
): ProductPhotoMatchResult<T> {
  const rowsByIdentifier = new Map<string, Set<number>>()
  for (const row of rows) {
    const identifiers = new Set([
      normalizeProductIdentifier(row.model),
      normalizeProductIdentifier(row.webSku),
    ].filter(Boolean))
    identifiers.forEach(identifier => {
      const rowNos = rowsByIdentifier.get(identifier) ?? new Set<number>()
      rowNos.add(row.rowNo)
      rowsByIdentifier.set(identifier, rowNos)
    })
  }

  const assignments = new Map<number, MatchedProductPhoto<T>[]>()
  const unmatched: T[] = []
  const ambiguous: ProductPhotoAmbiguous<T>[] = []

  for (const file of files) {
    const parsed = parseProductPhotoFileName(file.name)
    const rowNos = Array.from(rowsByIdentifier.get(parsed.identifier) ?? [])
    if (rowNos.length === 0) {
      unmatched.push(file)
      continue
    }
    if (rowNos.length > 1) {
      ambiguous.push({ file, rowNos })
      continue
    }
    const rowNo = rowNos[0]
    assignments.set(rowNo, [
      ...(assignments.get(rowNo) ?? []),
      { file, identifier: parsed.identifier, order: parsed.order, role: parsed.role },
    ])
  }

  const duplicates: ProductPhotoDuplicate<T>[] = []
  let matchedCount = 0
  assignments.forEach((photos, rowNo) => {
    photos.sort((a, b) => a.order - b.order || a.file.name.localeCompare(b.file.name, 'zh-Hant'))
    matchedCount += photos.length
    const filesBySlot = new Map<string, { role: ProductPhotoRole; order: number; files: T[] }>()
    for (const photo of photos) {
      const slot = `${photo.role}:${photo.order}`
      const current = filesBySlot.get(slot) ?? { role: photo.role, order: photo.order, files: [] }
      current.files.push(photo.file)
      filesBySlot.set(slot, current)
    }
    filesBySlot.forEach(item => {
      if (item.files.length > 1) duplicates.push({ rowNo, role: item.role, order: item.order, files: item.files })
    })
  })

  return { assignments, unmatched, ambiguous, duplicates, matchedCount }
}
