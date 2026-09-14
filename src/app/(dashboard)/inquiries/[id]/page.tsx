import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import InquiryForm from '@/components/inquiries/InquiryForm'

export const dynamic = 'force-dynamic'

export default async function InquiryDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createServerSupabaseClient()

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!inquiry) return notFound()

  const { data: items } = await supabase
    .from('inquiry_items')
    .select('*')
    .eq('inquiry_id', params.id)
    .order('sort_order')

  return <InquiryForm initialInquiry={inquiry} initialItems={items ?? []} />
}
