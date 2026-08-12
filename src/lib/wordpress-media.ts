import sharp from 'sharp'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const WORDPRESS_IMAGE_SIZE = 600
const WORDPRESS_WEBP_QUALITY = 84

export function wordpressMediaConfig() {
  const store = (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
  const username = process.env.WP_MEDIA_USERNAME ?? ''
  const applicationPassword = process.env.WP_MEDIA_APPLICATION_PASSWORD ?? ''
  return { store, username, applicationPassword }
}

export function isAllowedWordPressImageType(mimeType: string) {
  return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase())
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
 * 所有新上傳的商品圖片都使用一致的官網規格：
 * - 依 EXIF 方向旋轉
 * - 等比例縮放並置中於 600 × 600 畫布，不裁切產品內容
 * - 空白區使用透明背景
 * - 一律輸出 WebP
 */
export async function prepareWordPressImage(data: Buffer) {
  return sharp(data, { animated: false })
    .rotate()
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
}) {
  const { store, username, applicationPassword } = wordpressMediaConfig()
  if (!store || !username || !applicationPassword) {
    throw new Error('尚未設定 WordPress 媒體上傳帳號。請設定 WP_MEDIA_USERNAME 與 WP_MEDIA_APPLICATION_PASSWORD。')
  }
  if (!isAllowedWordPressImageType(options.mimeType)) {
    throw new Error('僅支援 JPG、PNG、WebP 或 GIF 圖片')
  }

  const uploadData = await prepareWordPressImage(options.data)
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
