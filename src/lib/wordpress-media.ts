import sharp from 'sharp'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const WORDPRESS_DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const WORDPRESS_IMAGE_SIZE = 600
const WORDPRESS_CONTENT_MAX_WIDTH = 1800
const WORDPRESS_CONTENT_MAX_HEIGHT = 2600
const WORDPRESS_WEBP_QUALITY = 84
const WORDPRESS_CONTENT_WEBP_QUALITY = 90

export type WordPressImagePreset = 'product' | 'content'

export function wordpressMediaConfig() {
  const store = (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
  const username = process.env.WP_MEDIA_USERNAME ?? ''
  const applicationPassword = process.env.WP_MEDIA_APPLICATION_PASSWORD ?? ''
  return { store, username, applicationPassword }
}

export function isAllowedWordPressImageType(mimeType: string) {
  return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase())
}

export function wordpressDocumentMimeType(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return WORDPRESS_DOCUMENT_MIME_TYPES[extension] ?? null
}

export function isAllowedWordPressDocument(fileName: string, mimeType: string) {
  const expected = wordpressDocumentMimeType(fileName)
  if (!expected) return false
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim()
  return !normalizedMime
    || normalizedMime === 'application/octet-stream'
    || normalizedMime === expected
    || (fileName.toLowerCase().endsWith('.zip') && normalizedMime === 'application/x-zip-compressed')
}

export function isConfiguredWordPressMediaUrl(url: string) {
  const { store } = wordpressMediaConfig()
  return !!store && url.startsWith(`${store}/wp-content/uploads/`)
}

export function safeWordPressFileName(name: string) {
  const dot = name.lastIndexOf('.')
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : ''
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || `product-${Date.now()}`}${extension}`
}

/**
 * product：商品主圖／相簿統一為 600 × 600，不裁切產品內容。
 * content：商品介紹與型錄頁保留長寬比，最長邊限制在 1800 × 2600。
 * 兩者都依 EXIF 方向旋轉並輸出 WebP。
 */
export async function prepareWordPressImage(data: Buffer, preset: WordPressImagePreset = 'product') {
  const image = sharp(data, { animated: false }).rotate()
  if (preset === 'content') {
    return image
      .resize(WORDPRESS_CONTENT_MAX_WIDTH, WORDPRESS_CONTENT_MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WORDPRESS_CONTENT_WEBP_QUALITY })
      .toBuffer()
  }
  return image
    .resize(WORDPRESS_IMAGE_SIZE, WORDPRESS_IMAGE_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      withoutEnlargement: false,
    })
    .webp({ quality: WORDPRESS_WEBP_QUALITY })
    .toBuffer()
}

export async function uploadWordPressMedia(options: {
  data: Buffer
  mimeType: string
  fileName: string
  altText?: string
  preset?: WordPressImagePreset
}) {
  const { store, username, applicationPassword } = wordpressMediaConfig()
  if (!store || !username || !applicationPassword) {
    throw new Error('尚未設定 WordPress 媒體上傳帳號。請設定 WP_MEDIA_USERNAME 與 WP_MEDIA_APPLICATION_PASSWORD。')
  }
  if (!isAllowedWordPressImageType(options.mimeType)) {
    throw new Error('僅支援 JPG、PNG、WebP 或 GIF 圖片')
  }

  const uploadData = await prepareWordPressImage(options.data, options.preset)
  const uploadMimeType = 'image/webp'
  const uploadFileName = options.fileName.replace(/\.[^.]+$/, '') + '.webp'
  const filename = safeWordPressFileName(uploadFileName)
  const auth = Buffer.from(`${username}:${applicationPassword}`).toString('base64')
  const upload = await fetch(`${store}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': uploadMimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: Uint8Array.from(uploadData),
    cache: 'no-store',
  })

  const responseText = await upload.text()
  let media: any = null
  try {
    media = responseText ? JSON.parse(responseText) : null
  } catch {
    throw new Error(`WordPress 回應格式錯誤（HTTP ${upload.status}）`)
  }

  if (!upload.ok) {
    throw new Error(media?.message ?? `WordPress 媒體上傳失敗（HTTP ${upload.status}）`)
  }
  if (!media?.id || !media?.source_url) {
    throw new Error('WordPress 已接收檔案，但沒有回傳媒體網址')
  }

  const altText = (options.altText ?? '').trim()
  if (altText) {
    await fetch(`${store}/wp-json/wp/v2/media/${media.id}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alt_text: altText }),
      cache: 'no-store',
    })
  }

  return {
    id: media.id as number,
    url: media.source_url as string,
    alt_text: altText,
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
  }
}

/**
 * 將商品型錄／說明文件原檔上傳到 av-shop.com WordPress 媒體庫。
 * 文件不經 Sharp 轉檔；若商品已存在，會把媒體附件掛到該 WooCommerce 商品。
 */
export async function uploadWordPressDocument(options: {
  data: Buffer
  mimeType: string
  fileName: string
  title?: string
  productId?: number | null
}) {
  const { store, username, applicationPassword } = wordpressMediaConfig()
  if (!store || !username || !applicationPassword) {
    throw new Error('尚未設定 WordPress 媒體上傳帳號。請設定 WP_MEDIA_USERNAME 與 WP_MEDIA_APPLICATION_PASSWORD。')
  }
  const uploadMimeType = wordpressDocumentMimeType(options.fileName)
  if (!uploadMimeType || !isAllowedWordPressDocument(options.fileName, options.mimeType)) {
    throw new Error('僅支援 PDF、ZIP、Word、Excel 或 PowerPoint 檔案')
  }

  const extension = options.fileName.split('.').pop()?.toLowerCase() ?? 'pdf'
  const originalBase = options.fileName.replace(/\.[^.]+$/, '').normalize('NFKC').trim()
  const asciiBase = originalBase
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  const uploadFileName = `${asciiBase || `product-catalog-${Date.now()}`}.${extension}`
  const auth = Buffer.from(`${username}:${applicationPassword}`).toString('base64')
  const upload = await fetch(`${store}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': uploadMimeType,
      'Content-Disposition': `attachment; filename="${uploadFileName}"`,
    },
    body: Uint8Array.from(options.data),
    cache: 'no-store',
  })

  const responseText = await upload.text()
  let media: any = null
  try {
    media = responseText ? JSON.parse(responseText) : null
  } catch {
    throw new Error(`WordPress 回應格式錯誤（HTTP ${upload.status}）`)
  }
  if (!upload.ok) {
    throw new Error(media?.message ?? `WordPress 文件上傳失敗（HTTP ${upload.status}）`)
  }
  if (!media?.id || !media?.source_url) {
    throw new Error('WordPress 已接收檔案，但沒有回傳媒體網址')
  }

  const title = (options.title || originalBase || '產品型錄').trim()
  const metadata: Record<string, unknown> = {
    title,
    caption: '產品資料下載',
    description: `由光輝系統上傳：${options.fileName}`,
  }
  if (options.productId && Number.isInteger(options.productId) && options.productId > 0) {
    metadata.post = options.productId
  }
  const metadataResponse = await fetch(`${store}/wp-json/wp/v2/media/${media.id}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
    cache: 'no-store',
  })
  let warning: string | null = null
  if (!metadataResponse.ok) {
    const metadataError = await metadataResponse.json().catch(() => null)
    warning = metadataError?.message ?? '文件已上傳，但無法寫入 WordPress 商品附件資料'
  }

  return {
    id: media.id as number,
    url: media.source_url as string,
    file_name: options.fileName,
    mime_type: uploadMimeType,
    attached_product_id: options.productId ?? null,
    warning,
  }
}
