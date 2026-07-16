/**
 * 產品匯入 — 欄位規格 / 正規化 / 驗證
 * 供 /api/products/import/* 與 ProductImportModal 共用
 *
 * 比對鍵：型號 (model) 優先，其次 官網SKU (web_sku)，皆不分大小寫。
 */

export type FieldType = 'text' | 'number' | 'bool' | 'datetime' | 'list'

export interface ImportColumn {
  header: string          // Excel 表頭（使用者看到的中文）
  key: string             // 內部 key
  type: FieldType
  required?: boolean
  note?: string           // 範本說明列
  width?: number
}

/** 產品主檔欄位（直接寫進 products） */
export const PRODUCT_COLUMNS: ImportColumn[] = [
  { header: '品牌', key: 'brand', type: 'text', width: 14, note: '例：JBL' },
  { header: '產品名稱', key: 'product_name', type: 'text', required: true, width: 30, note: '必填' },
  { header: '型號', key: 'model', type: 'text', width: 20, note: '比對鍵，不可重複' },
  { header: '主分類', key: 'main_category', type: 'text', width: 14, note: '找不到會自動建立' },
  { header: '次分類', key: 'sub_category', type: 'text', width: 14, note: '需與主分類成對' },
  { header: '單位', key: 'unit', type: 'text', width: 8, note: '預設「台」' },
  { header: '建議售價', key: 'list_price', type: 'number', width: 12, note: '數字，免打逗號' },
  { header: '成本', key: 'cost_price', type: 'number', width: 12 },
  { header: '寬cm', key: 'width_cm', type: 'number', width: 8 },
  { header: '深cm', key: 'depth_cm', type: 'number', width: 8 },
  { header: '高cm', key: 'height_cm', type: 'number', width: 8 },
  { header: '備註', key: 'notes', type: 'text', width: 24 },
  { header: '啟用', key: 'is_active', type: 'bool', width: 8, note: '是／否，預設是' },
  // ── 官網欄位 ──
  { header: '官網SKU', key: 'web_sku', type: 'text', width: 16, note: '第二比對鍵' },
  { header: '官網分類', key: 'web_category', type: 'text', width: 16 },
  { header: '官網售價', key: 'web_sale_price', type: 'number', width: 12 },
  { header: '產品介紹', key: 'web_description', type: 'text', width: 40, note: '可放 HTML' },
  { header: '規格HTML', key: 'web_spec_html', type: 'text', width: 40, note: '可放 HTML 表格' },
  { header: 'BSMI字號', key: 'web_bsmi_no', type: 'text', width: 16 },
  { header: 'NCC字號', key: 'web_ncc_no', type: 'text', width: 16 },
  { header: '上架', key: 'web_publish', type: 'bool', width: 8, note: '是／否，預設否' },
]

/** 子表欄位（product_features / product_images） */
export const SUB_COLUMNS: ImportColumn[] = [
  { header: '產品特色', key: 'features', type: 'list', width: 30, note: '用 | 分隔，每項最多 5 字、最多 10 項' },
  { header: '主圖網址', key: 'main_image_url', type: 'text', width: 40, note: 'http(s) 圖片網址，匯入時自動轉存 Google Drive' },
  { header: '其他圖片網址', key: 'image_urls', type: 'list', width: 40, note: '多張用 | 分隔' },
]

export const ALL_COLUMNS: ImportColumn[] = [...PRODUCT_COLUMNS, ...SUB_COLUMNS]

/** 表頭 → key（容錯：去空白、全形括號） */
const HEADER_MAP: Record<string, ImportColumn> = (() => {
  const m: Record<string, ImportColumn> = {}
  for (const c of ALL_COLUMNS) m[normalizeHeader(c.header)] = c
  // 常見別名
  const alias: Record<string, string> = {
    '產品': '產品名稱', '品名': '產品名稱', '商品名稱': '產品名稱',
    '型號規格': '型號', 'model': '型號', 'sku': '官網SKU',
    '售價': '建議售價', '定價': '建議售價', '牌價': '建議售價',
    '成本價': '成本', '進價': '成本',
    'brand': '品牌',
  }
  for (const [a, target] of Object.entries(alias)) {
    const col = ALL_COLUMNS.find(c => c.header === target)
    if (col) m[normalizeHeader(a)] = col
  }
  return m
})()

export function normalizeHeader(s: string): string {
  return String(s ?? '')
    .replace(/\s|　/g, '')
    .replace(/[（）()＊*]/g, '')
    .toLowerCase()
}

export function columnForHeader(h: string): ImportColumn | null {
  return HEADER_MAP[normalizeHeader(h)] ?? null
}

/** 一列解析後的資料 */
export interface ParsedRow {
  rowNo: number
  product: Record<string, any>      // products 欄位（含 main_category/sub_category 待解析）
  features: string[]
  main_image_url: string
  image_urls: string[]
  errors: string[]
  warnings: string[]
}

export function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const n = Number(String(v).replace(/[,$\s＄，]/g, ''))
  return isFinite(n) ? n : null
}

export function toBool(v: any, dflt = false): boolean {
  if (v === null || v === undefined || v === '') return dflt
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (['是', 'y', 'yes', 'true', '1', 'v', '✓', 'on'].includes(s)) return true
  if (['否', 'n', 'no', 'false', '0', ''].includes(s)) return false
  return dflt
}

export function toList(v: any): string[] {
  if (!v) return []
  return String(v)
    .split(/[|｜\n]/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** 把一列原始儲存格（header→value）轉成 ParsedRow */
export function parseRow(rowNo: number, raw: Record<string, any>): ParsedRow {
  const out: ParsedRow = {
    rowNo,
    product: {},
    features: [],
    main_image_url: '',
    image_urls: [],
    errors: [],
    warnings: [],
  }

  for (const [header, value] of Object.entries(raw)) {
    const col = columnForHeader(header)
    if (!col) continue
    switch (col.key) {
      case 'features': {
        const list = toList(value)
        if (list.some(f => f.length > 5)) out.warnings.push('產品特色超過 5 字的項目會被截斷')
        if (list.length > 10) out.warnings.push('產品特色超過 10 項，只取前 10 項')
        out.features = list.slice(0, 10).map(f => f.slice(0, 5))
        break
      }
      case 'main_image_url':
        out.main_image_url = String(value ?? '').trim()
        break
      case 'image_urls':
        out.image_urls = toList(value)
        break
      default: {
        if (col.type === 'number') {
          const n = toNumber(value)
          if (value !== '' && value !== null && value !== undefined && n === null) {
            out.errors.push(`「${col.header}」不是有效數字：${value}`)
          }
          if (n !== null) out.product[col.key] = n
        } else if (col.type === 'bool') {
          out.product[col.key] = toBool(value, col.key === 'is_active')
        } else {
          const s = String(value ?? '').trim()
          if (s) out.product[col.key] = s
        }
      }
    }
  }

  // 必填 / 一致性檢查
  if (!out.product.product_name) out.errors.push('產品名稱為必填')
  if (out.product.main_category && !out.product.sub_category) out.warnings.push('只有主分類、沒有次分類，將不設定分類')
  if (!out.product.model && !out.product.web_sku) out.warnings.push('沒有型號也沒有官網SKU，無法比對既有產品，只能新增')

  for (const u of [out.main_image_url, ...out.image_urls]) {
    if (u && !/^https?:\/\//i.test(u)) out.errors.push(`圖片網址須為 http(s) 開頭：${u}`)
  }

  return out
}

/** 比對鍵 */
export function matchKeys(p: { model?: string | null; web_sku?: string | null }) {
  return {
    model: (p.model ?? '').trim().toUpperCase(),
    sku: (p.web_sku ?? '').trim().toUpperCase(),
  }
}
