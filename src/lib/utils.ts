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
