import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { ALL_COLUMNS } from '@/lib/product-import'

export const runtime = 'nodejs'

/** GET /api/products/import/template → 下載匯入範本 .xlsx */
export async function GET() {
  const wb = new ExcelJS.Workbook()
  wb.creator = '光輝影音 CRM'
  const ws = wb.addWorksheet('產品匯入')

  // 第 1 列：表頭
  ws.addRow(ALL_COLUMNS.map(c => c.header))
  // 第 2 列：說明（匯入時會自動略過「說明」開頭的列）
  ws.addRow(ALL_COLUMNS.map(c => c.note ?? ''))
  // 第 3 列：範例
  ws.addRow(
    ALL_COLUMNS.map(c => {
      switch (c.key) {
        case 'brand': return 'JBL'
        case 'product_name': return 'JBL Stage A130 書架喇叭'
        case 'model': return 'STAGE-A130'
        case 'main_category': return '喇叭'
        case 'sub_category': return '書架喇叭'
        case 'unit': return '對'
        case 'list_price': return 12000
        case 'cost_price': return 8000
        case 'width_cm': return 18
        case 'depth_cm': return 25
        case 'height_cm': return 32
        case 'is_active': return '是'
        case 'web_sku': return 'JBL-A130'
        case 'web_publish': return '否'
        case 'features': return '高音清晰|低頻扎實|台灣公司貨'
        case 'main_image_url': return 'https://example.com/a130.jpg'
        default: return ''
      }
    })
  )

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
  ws.getRow(1).height = 22
  ws.getRow(2).font = { italic: true, size: 9, color: { argb: 'FF888888' } }
  ws.getRow(3).font = { color: { argb: 'FFAAAAAA' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ALL_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 16 })

  // 說明頁
  const help = wb.addWorksheet('使用說明')
  const lines = [
    ['產品匯入使用說明'],
    [''],
    ['1. 第 1 列是表頭，請勿更動；第 2、3 列是說明與範例，匯入時會自動略過。'],
    ['2. 從第 4 列開始填入資料，一列一個產品。'],
    ['3. 必填欄位：產品名稱。'],
    ['4. 比對既有產品的依據：型號 → 官網SKU（不分大小寫）。兩者都沒填就一律視為新增。'],
    ['5. 「是／否」欄位可填：是、否、Y、N、TRUE、FALSE。'],
    ['6. 產品特色與其他圖片網址：多筆請用半形 | 分隔。'],
    ['7. 圖片網址必須是可公開存取的 http(s) 連結，匯入時系統會自動下載並轉存到 Google Drive。'],
    ['8. 匯入前會出現預覽畫面，可逐筆決定「新增／更新／跳過」，確認後才會寫入。'],
    ['9. 分類：主分類＋次分類需成對填寫，系統找不到時會自動建立。'],
  ]
  lines.forEach(l => help.addRow(l))
  help.getRow(1).font = { bold: true, size: 14 }
  help.getColumn(1).width = 90

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="product_import_template.xlsx"; filename*=UTF-8''${encodeURIComponent('產品匯入範本.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  })
}
