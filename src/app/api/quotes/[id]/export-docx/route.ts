import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildQuoteFileName } from '@/lib/utils'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, HeightRule, VerticalAlign,
} from 'docx'

function fmt(n: number | null | undefined): string {
  return `NT$${Number(n ?? 0).toLocaleString('zh-TW')}`
}

const cellBorder = {
  top: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
}

function headerCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: 'D9D9D9' },
    borders: cellBorder,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 20 })] })],
  })
}

function bodyCell(text: string, width: number, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: cellBorder,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 20 })] })],
  })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()

  const [{ data: quote }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from('quotes').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('quote_items').select('*').eq('quote_id', params.id).order('seq_no'),
    supabase.from('system_settings').select('*').single(),
  ])

  if (!quote) {
    return NextResponse.json({ error: '找不到報價單' }, { status: 404 })
  }

  const clientName = (quote as any).clients?.company_name ?? ''
  const clientAddress = (quote as any).client_address || (quote as any).clients?.address || ''
  const bankInfo = settings?.bank_name
    ? `${settings.bank_name}／戶名：${settings.bank_account_name ?? ''}／帳號：${settings.bank_account ?? ''}`
    : ''

  const noteItems: string[] = []
  if (quote.valid_until) noteItems.push(`報價單有效期限：${quote.valid_until}`)
  if (quote.delivery_days) noteItems.push(`交貨工期：${quote.delivery_days} 天`)
  if (bankInfo) noteItems.push(`匯款帳號：${bankInfo}`)
  if (quote.payment_terms) noteItems.push(`付款條件：${quote.payment_terms}`)
  if (quote.notes) noteItems.push(quote.notes)

  const colWidths = [8, 26, 14, 8, 8, 16, 20] // 編號/品名/型號/單位/數量/單價/金額

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('編號', colWidths[0]),
      headerCell('產品名稱', colWidths[1]),
      headerCell('規格型號', colWidths[2]),
      headerCell('單位', colWidths[3]),
      headerCell('數量', colWidths[4]),
      headerCell('單價', colWidths[5]),
      headerCell('金額', colWidths[6]),
    ],
  })

  const itemRows: TableRow[] = []
  ;(items ?? []).forEach((item: any) => {
    itemRows.push(new TableRow({
      children: [
        bodyCell(String(item.seq_no), colWidths[0], AlignmentType.CENTER),
        bodyCell(item.product_name ?? '', colWidths[1]),
        bodyCell(item.model ?? '', colWidths[2]),
        bodyCell(item.unit ?? '', colWidths[3], AlignmentType.CENTER),
        bodyCell(String(item.quantity), colWidths[4], AlignmentType.CENTER),
        bodyCell(Number(item.unit_price).toLocaleString('zh-TW'), colWidths[5], AlignmentType.RIGHT),
        bodyCell(Number(item.quantity * item.unit_price).toLocaleString('zh-TW'), colWidths[6], AlignmentType.RIGHT),
      ],
    }))
    if (item.item_notes) {
      itemRows.push(new TableRow({
        children: [
          new TableCell({
            columnSpan: 7,
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: `備註：${item.item_notes}`, size: 18, color: '666666' })] })],
          }),
        ],
      }))
    }
  })

  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 5,
        borders: cellBorder,
        children: [new Paragraph({ children: [new TextRun({ text: '含稅總金額', bold: true, size: 20 })] })],
      }),
      new TableCell({
        columnSpan: 2,
        borders: cellBorder,
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(quote.total_amount), bold: true, size: 22 })] })],
      }),
    ],
  })

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '估　價　單', bold: true, size: 32 })],
        }),
        ...(quote.project_name ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: quote.project_name, size: 20 })] })] : []),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: `客戶名稱：${clientName}　　`, size: 20 }),
            new TextRun({ text: `聯絡人：${quote.contact_name ?? '—'}　　`, size: 20 }),
            new TextRun({ text: `電話：${quote.client_phone ?? '—'}`, size: 20 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `地址：${clientAddress || '—'}`, size: 20 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `單號：${quote.quote_no}　　`, size: 20 }),
            new TextRun({ text: `日期：${quote.created_at ? new Date(quote.created_at).toLocaleDateString('zh-TW') : ''}`, size: 20 }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...itemRows, totalRow],
        }),
        new Paragraph({ text: '' }),
        ...(noteItems.length > 0 ? [
          new Paragraph({ children: [new TextRun({ text: '備註事項', bold: true, size: 20 })] }),
          ...noteItems.map((n, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${n}`, size: 18 })] })),
        ] : []),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `${buildQuoteFileName(quote, clientName)}.docx`
  // HTTP header 只能放 ASCII：中文檔名放 filename*=UTF-8''，filename= 用 ASCII 替代（修 500 ByteString 錯誤）
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
