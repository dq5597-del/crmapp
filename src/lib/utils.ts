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
 * 產生估價單存檔／匯出檔名（不含副檔名）
 * 格式：(光輝)估價單_案名_日期_編號
 * 日期／編號取自報價單單號（quote_no = YYMMDD + 3碼流水號），流水號改以2碼顯示
 * 例：quote_no = 260704003, project_name = 展演廳工程 → (光輝)估價單_展演廳工程_260704_03
 */
export function buildQuoteFileName(
  quote: { quote_no?: string | null; project_name?: string | null },
  fallbackName?: string | null
): string {
  const quoteNo = quote.quote_no ?? ''
  const datePart = quoteNo.slice(0, 6)
  const seqRaw = quoteNo.slice(6)
  const seqNum = parseInt(seqRaw || '0', 10)
  const seqPart = String(seqNum || 0).padStart(2, '0')
  const namePart = (quote.project_name?.trim() || fallbackName?.trim() || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()

  return ['(光輝)估價單', namePart, datePart, seqPart].filter(Boolean).join('_')
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
