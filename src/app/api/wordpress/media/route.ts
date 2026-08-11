import { NextResponse } from 'next/server'
import { isAllowedWordPressImageType, uploadWordPressMedia } from '@/lib/wordpress-media'

// Vercel Functions 的請求內容有大小上限，預留 multipart 邊界空間。
const MAX_FILE_SIZE = 4 * 1024 * 1024
export async function POST(req: Request) {
  const form = await req.formData()
  const file = form.get('file')
  const altText = String(form.get('alt_text') ?? '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有收到圖片檔案' }, { status: 400 })
  }
  if (!isAllowedWordPressImageType(file.type)) {
    return NextResponse.json({ error: '僅支援 JPG、PNG、WebP 或 GIF 圖片' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '單張圖片不可超過 4MB' }, { status: 400 })
  }

  try {
    const media = await uploadWordPressMedia({
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      fileName: file.name,
      altText,
    })
    return NextResponse.json(media)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'WordPress 媒體上傳失敗' }, { status: 502 })
  }
}
