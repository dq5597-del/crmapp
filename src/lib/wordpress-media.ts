const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

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

  const shouldConvertToWebP = options.mimeType !== 'image/webp' && options.mimeType !== 'image/gif'
  const uploadData = shouldConvertToWebP
    ? await sharp(options.data).rotate().webp({ quality: 84 }).toBuffer()
    : options.data
  const uploadMimeType = shouldConvertToWebP ? 'image/webp' : options.mimeType
  const uploadFileName = shouldConvertToWebP
    ? options.fileName.replace(/\.[^.]+$/, '') + '.webp'
    : options.fileName
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
import sharp from 'sharp'
