import InquiryForm from '@/components/inquiries/InquiryForm'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Inquiry, InquiryItem } from '@/types'

export const dynamic = 'force-dynamic'

type InquiryNewSearchParams = {
  from_quote?: string
}

export default async function NewInquiryPage({
  searchParams,
}: {
  searchParams: InquiryNewSearchParams
}) {
  const sourceQuoteId = searchParams.from_quote?.trim()
  let initialInquiry: Partial<Inquiry> | undefined
  let initialItems: InquiryItem[] | undefined
  let sourceQuoteNo = ''

  if (sourceQuoteId) {
    const supabase = createServerSupabaseClient()
    const [quoteResult, itemsResult] = await Promise.all([
      supabase
        .from('quotes')
        .select('id, quote_no, project_name, notes')
        .eq('id', sourceQuoteId)
        .single(),
      supabase
        .from('quote_items')
        .select('*, products(cost_price)')
        .eq('quote_id', sourceQuoteId)
        .order('seq_no'),
    ])

    if (quoteResult.data) {
      const quote = quoteResult.data
      sourceQuoteNo = quote.quote_no
      const sourceLabel = `由報價單 ${quote.quote_no} 轉入${quote.project_name ? `（${quote.project_name}）` : ''}`

      initialInquiry = {
        inquiry_no: '',
        inquiry_date: new Date().toISOString().slice(0, 10),
        status: '草稿',
        notes: [sourceLabel, quote.notes].filter(Boolean).join('\n'),
      }

      initialItems = (itemsResult.data ?? [])
        .filter((item: any) => !item.is_category && item.product_name)
        .map((item: any, index: number) => {
          const product = Array.isArray(item.products) ? item.products[0] : item.products

          return {
            id: item.id,
            inquiry_id: '',
            product_id: item.product_id,
            brand: item.brand ?? null,
            product_name: item.product_name,
            model: item.model,
            unit: item.unit ?? '台',
            quantity: Number(item.quantity ?? 1),
            current_cost: Number(product?.cost_price ?? 0),
            vendor_price: null,
            lead_time_days: null,
            item_notes: item.item_notes,
            cost_synced: false,
            sort_order: index,
            created_at: item.created_at ?? '',
          } as InquiryItem
        })
    }
  }

  return (
    <InquiryForm
      initialInquiry={initialInquiry}
      initialItems={initialItems}
      sourceDocument={sourceQuoteNo ? {
        label: `已帶入報價單 ${sourceQuoteNo}，請選擇廠商後再儲存`,
        href: `/quotes/${sourceQuoteId}`,
      } : undefined}
    />
  )
}
