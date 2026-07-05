import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { text, file, items } = await req.json()
    if (!text && !file) return NextResponse.json({ error: '缺少廠商回覆內容' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '缺少詢價品項' }, { status: 400 })
    }

    const itemList = items
      .map((it: any) => `index=${it.index}: ${it.product_name}${it.model ? ` (型號 ${it.model})` : ''} x ${it.quantity}`)
      .join('\n')

    const instruction = `你是進銷存系統的資料解析助手。以下是我方詢價單的品項清單：

${itemList}

請從廠商的回覆內容中，找出每個品項對應的「未稅單價」與「交期（天）」。
輸出 JSON（只輸出 JSON，不要其他文字）：
{
  "results": [
    { "index": 0, "vendor_price": 165000, "lead_time_days": 14, "notes": "補充說明", "confidence": "high" }
  ]
}

規則：
- index 對應上方品項清單的 index，只輸出有找到報價資訊的品項
- 廠商若寫「含稅」價，換算為未稅（除以 1.05，四捨五入至整數）並在 notes 註明「原含稅價換算」
- 交期若寫「兩週」「一個月」等，換算為天數；找不到交期填 null
- 品名/型號完全對得上且金額明確 → confidence "high"；模糊比對或不確定 → "low"
- 缺貨、停產、最低訂購量等資訊放入 notes
- 金額只輸出數字，不含逗號與貨幣符號`

    const content: any[] = []
    if (file?.data) {
      if (file.mimeType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.data },
        })
      } else {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: file.mimeType ?? 'image/jpeg', data: file.data },
        })
      }
    }
    if (text) content.push({ type: 'text', text: `廠商回覆內容：\n${text}` })
    content.push({ type: 'text', text: instruction })

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    })

    const raw = (message.content[0] as any).text ?? ''
    const jsonText = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const data = JSON.parse(jsonText)
    return NextResponse.json({ results: data.results ?? [] })
  } catch (err: any) {
    console.error('AI parse error:', err)
    return NextResponse.json({ error: err.message ?? 'AI 解析失敗' }, { status: 500 })
  }
}
