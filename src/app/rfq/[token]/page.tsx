import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { MessageSquareQuote } from 'lucide-react'
import RfqFillForm from './RfqFillForm'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '廠商詢價回覆',
  robots: { index: false, follow: false, nocache: true },
  other: { referrer: 'no-referrer' },
}

type PublicInquiry = {
  inquiry_no: string
  vendor_name: string | null
  contact_name: string | null
  inquiry_date: string | null
  reply_deadline: string | null
  status: string
  token_locked: boolean
  notes: string | null
  items: Array<{
    id: string
    product_name: string
    model: string | null
    unit: string
    quantity: number
    vendor_price: number | null
    lead_time_days: number | null
    item_notes: string | null
  }>
}

export default async function RfqPublicPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.token)) {
    return notFound()
  }
  const supabase = createServerSupabaseClient()

  // 公開頁只能呼叫資料庫內的限縮 RPC；anon 無法直接讀 inquiries / inquiry_items。
  const { data } = await supabase.rpc('get_public_inquiry', { p_fill_token: params.token })
  const inquiry = data as PublicInquiry | null

  if (!inquiry) return notFound()

  const today = new Date().toISOString().split('T')[0]
  const expired = !inquiry.reply_deadline || inquiry.reply_deadline < today
  const locked = inquiry.token_locked || inquiry.status === '已結案'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <MessageSquareQuote size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-gray-900">光輝影音科技 — 詢價單</div>
            <div className="text-xs text-gray-500">{inquiry.inquiry_no}</div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 基本資訊 */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
          <div className="text-sm text-gray-700 mb-1">
            致：<span className="font-semibold">{inquiry.vendor_name ?? ''}</span>
            {inquiry.contact_name ? `　${inquiry.contact_name} 先生/小姐` : ''}
          </div>
          <div className="text-xs text-gray-500">
            詢價日期：{inquiry.inquiry_date ?? '—'}
            {inquiry.reply_deadline && <span className="ml-3">回覆期限：<span className={expired ? 'text-red-500 font-medium' : ''}>{inquiry.reply_deadline}</span></span>}
          </div>
          {inquiry.notes && (
            <div className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{inquiry.notes}</div>
          )}
        </div>

        {locked ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <div className="text-green-700 font-semibold mb-1">已收到您的報價，感謝回覆！</div>
            <div className="text-sm text-green-600">如需修改報價，請聯絡光輝影音科技業務人員。</div>
          </div>
        ) : expired ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <div className="text-amber-700 font-semibold mb-1">此詢價單已截止</div>
            <div className="text-sm text-amber-600">如仍可報價，請直接聯絡光輝影音科技業務人員。</div>
          </div>
        ) : (
          <RfqFillForm token={params.token} items={inquiry.items ?? []} />
        )}

        <div className="text-center text-xs text-gray-400 mt-8 pb-8">
          光輝影音科技 · 本頁面由行政系統自動產生
        </div>
      </div>
    </div>
  )
}
