import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'yyyy/MM/dd', { locale: zhTW })
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'NT$0'
  return `NT$${amount.toLocaleString('zh-TW')}`
}

/** 產生報價單編號：YYMMDD + 3位流水號 */
export function generateQuoteNo(date: Date, seq: number): string {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const seqStr = String(seq).padStart(3, '0')
  return `${yy}${mm}${dd}${seqStr}`
}

/** 產生銷貨單編號：SO-YYMMDD-001 */
export function generateOrderNo(prefix: string, date: Date, seq: number): string {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const seqStr = String(seq).padStart(3, '0')
  return `${prefix}-${yy}${mm}${dd}-${seqStr}`
}

/**
 * 產生報價單存檔／匯出檔名（不含副檔名）
 * 格式：(光輝)客戶名稱_案名報價單_日期_編號
 * 日期／編號取自報價單單號（quote_no = YYMMDD + 3碼流水號），流水號改以2碼顯示
 * 例：quote_no = 260815001, 客戶 = 花蓮環保局, 案名 = 150人大會議室
 *     → (光輝)花蓮環保局_150人大會議室報價單_260815_01
 * 客戶或案名缺一時自動略過該段，不會留下多餘底線。
 */
export function buildQuoteFileName(
  quote: { quote_no?: string | null; project_name?: string | null },
  clientName?: string | null
): string {
  const quoteNo = quote.quote_no ?? ''
  const datePart = quoteNo.slice(0, 6)
  const seqRaw = quoteNo.slice(6)
  const seqNum = parseInt(seqRaw || '0', 10)
  const seqPart = String(seqNum || 0).padStart(2, '0')

  // 檔名不可含這些字元，先清掉再組合
  const clean = (s?: string | null) => (s ?? '').replace(/[\\/:*?"<>|]/g, '').trim()
  const namePart = [clean(clientName), clean(quote.project_name)].filter(Boolean).join('_')

  return [`(光輝)${namePart}報價單`, datePart, seqPart].filter(Boolean).join('_')
}

export const CLIENT_STATUS_COLORS: Record<string, string> = {
  '有需求':   'bg-blue-100 text-blue-800',
  '規劃中':   'bg-purple-100 text-purple-800',
  '服務未完成': 'bg-yellow-100 text-yellow-800',
  '已完成':   'bg-green-100 text-green-800',
  '暫緩':     'bg-gray-100 text-gray-600',
}

export const QUOTE_STATUS_COLORS: Record<string, string> = {
  '草稿':      'bg-gray-100 text-gray-600',
  '已確認':    'bg-blue-100 text-blue-800',
  '已轉銷貨單': 'bg-green-100 text-green-800',
  '已轉訂購單': 'bg-purple-100 text-purple-800',
  '作廢':      'bg-red-100 text-red-800',
}
