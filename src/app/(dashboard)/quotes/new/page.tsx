import QuoteForm from '@/components/quotes/QuoteForm'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Quote, QuoteItem } from '@/types'
import { ArrowLeft, FileInput } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type QuoteNewSearchParams = {
  client_id?: string
  client_name?: string
  phone?: string
  contact?: string
  project_id?: string
  project_name?: string
  from_inquiry?: string
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: QuoteNewSearchParams
}) {
  const sourceInquiryId = searchParams.from_inquiry?.trim()
  let sourceInquiryNo = ''
  let initialQuote: Partial<Quote> | undefined
  let initialItems: QuoteItem[] | undefined

  if (sourceInquiryId) {
    const supabase = createServerSupabaseClient()
    const [inquiryResult, itemsResult] = await Promise.all([
      supabase
        .from('inquiries')
        .select('id, inquiry_no, vendor_name, notes')
        .eq('id', sourceInquiryId)
        .single(),
      supabase
        .from('inquiry_items')
        .select('*, products(list_price)')
        .eq('inquiry_id', sourceInquiryId)
        .order('sort_order'),
    ])

    if (inquiryResult.data) {
      const inquiry = inquiryResult.data
      sourceInquiryNo = inquiry.inquiry_no
      const sourceLabel = `由廠商詢價單 ${inquiry.inquiry_no} 轉入${inquiry.vendor_name ? `（${inquiry.vendor_name}）` : ''}`

      initialQuote = {
        status: '草稿',
        notes: [sourceLabel, inquiry.notes].filter(Boolean).join('\n'),
      }

      initialItems = (itemsResult.data ?? []).map((item: any, index: number) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        const unitPrice = Number(product?.list_price ?? item.vendor_price ?? 0)
        const quantity = Number(item.quantity ?? 1)

        return {
          id: item.id,
          quote_id: '',
          seq_no: index + 1,
          product_id: item.product_id,
          brand: item.brand ?? null,
          product_name: item.product_name,
          model: item.model,
          unit: item.unit ?? '台',
          quantity,
          unit_price: unitPrice,
          amount: quantity * unitPrice,
          provide_catalog: false,
          provide_manual: false,
          item_notes: item.item_notes,
          created_at: item.created_at ?? '',
        }
      })
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={sourceInquiryNo ? `/inquiries/${sourceInquiryId}` : '/quotes'}
          className="text-gray-500 hover:text-gray-900"
          aria-label={sourceInquiryNo ? '返回來源廠商詢價單' : '返回報價單列表'}
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">新增報價單</h1>
          {sourceInquiryNo ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-violet-600">
              <FileInput size={13} /> 已帶入廠商詢價單 {sourceInquiryNo}，請選擇客戶並確認售價
            </p>
          ) : null}
        </div>
      </div>
      <QuoteForm
        initialQuote={initialQuote}
        initialItems={initialItems}
        prefillClientId={searchParams.client_id}
        prefillClientName={searchParams.client_name}
        prefillPhone={searchParams.phone}
        prefillContact={searchParams.contact}
        prefillProjectId={searchParams.project_id}
        prefillProjectName={searchParams.project_name}
      />
    </div>
  )
}
