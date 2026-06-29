import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType = 'image/jpeg' } = await req.json()
    if (!image) return NextResponse.json({ error: '缺少圖片' }, { status: 400 })

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: image },
            },
            {
              type: 'text',
              text: `請讀取這張名片，輸出 JSON（只輸出 JSON，不要其他文字）：
{
  "name": "姓名",
  "title": "職稱",
  "company": "公司名稱",
  "phone": "電話（行動或辦公室，取第一個）",
  "email": "Email",
  "address": "地址",
  "line_id": "LINE ID（若有）",
  "notes": "其他資訊"
}
若某欄位名片上沒有，填空字串。`,
            },
          ],
        },
      ],
    })

    const raw = (message.content[0] as any).text ?? ''
    // Strip markdown code block if present
    const jsonText = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const data = JSON.parse(jsonText)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('OCR error:', err)
    return NextResponse.json({ error: err.message ?? 'OCR 失敗' }, { status: 500 })
  }
}
