import { NextResponse } from 'next/server'
import { isAllowedWordPressDocument, uploadWordPressDocument } from '@/lib/wordpress-media'

// Vercel Functions 的請求內容有大小上限，預留 multipart 邊界空間。
const MAX_FILE_SIZE = 4 * 1024 * 1024

export async function POST(req: Request) {
  const form = await req.formData()
  const file = form.get('file')
  const title = String(form.get('title') ?? '').trim()
  const rawProductId = String(form.get('product_id') ?? '').trim()
  const productId = /^\d+$/.test(rawProductId) ? Number(rawProductId) : null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '沒有收到產品資料檔案' }, { status: 400 })
  }
  if (!isAllowedWordPressDocument(file.name, file.type)) {
    return NextResponse.json({ error: '僅支援 PDF、ZIP、Word、Excel 或 PowerPoint 檔案' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '單一檔案不可超過 4MB' }, { status: 400 })
  }

  try {
    const media = await uploadWordPressDocument({
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      fileName: file.name,
      title,
      productId,
    })
    return NextResponse.json(media)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'WordPress 產品資料上傳失敗' }, { status: 502 })
  }
}
