import { NextResponse } from 'next/server'

// Vercel Functions 的請求內容有大小上限，預留 multipart 邊界空間。
const MAX_FILE_SIZE = 4 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function wordpressConfig() {
  const store = (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
  const username = process.env.WP_MEDIA_USERNAME ?? ''
  const applicationPassword = process.env.WP_MEDIA_APPLICATION_PASSWORD ?? ''
  return { store, username, applicationPassword }
}

function safeFileName(name: string) {
  const dot = name.lastIndexOf('.')
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : ''
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || `product-${Date.now()}`}${extension}`
}

export async function POST(req: Request) {
  const { store, username, applicationPassword } = wordpressConfig()
  if (!store || !username || !applicationPassword) {
    return NextResponse.json({
      error: '尚未設定 WordPress 媒體上傳帳號。請設定 WP_MEDIA_USERNAME 與 WP_MEDIA_APPLICATION_PASSWORD。',
    }, { status: 500 })
  }

  const form = await req.formData()
  const file = form.get('file')
  const altText = String(form.get('alt_text') ?? '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有收到圖片檔案' }, { status: 400 })
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: '僅支援 JPG、PNG、WebP 或 GIF 圖片' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '單張圖片不可超過 4MB' }, { status: 400 })
  }

  const filename = safeFileName(file.name)
  const auth = Buffer.from(`${username}:${applicationPassword}`).toString('base64')
  const upload = await fetch(`${store}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': file.type,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: Buffer.from(await file.arrayBuffer()),
    cache: 'no-store',
  })

  const responseText = await upload.text()
  let media: any = null
  try {
    media = responseText ? JSON.parse(responseText) : null
  } catch {
    return NextResponse.json({ error: `WordPress 回應格式錯誤（HTTP ${upload.status}）` }, { status: 502 })
  }

  if (!upload.ok) {
    return NextResponse.json({
      error: media?.message ?? `WordPress 媒體上傳失敗（HTTP ${upload.status}）`,
    }, { status: upload.status === 401 || upload.status === 403 ? 502 : upload.status })
  }

  if (!media?.id || !media?.source_url) {
    return NextResponse.json({ error: 'WordPress 已接收檔案，但沒有回傳媒體網址' }, { status: 502 })
  }

  if (altText && media?.id) {
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

  return NextResponse.json({
    id: media.id,
    url: media.source_url,
    alt_text: altText,
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
  })
}
