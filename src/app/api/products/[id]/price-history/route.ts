import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  // Query sales_order_items to find historical prices for this product
  const { data, error } = await supabase
    .from('sales_order_items')
    .select(`
      unit_price,
      quantity,
      sales_order:sales_orders(
        order_no,
        created_at,
        client:clients(company_name)
      )
    `)
    .eq('product_id', params.id)
    .order('created_at', { ascending: false, referencedTable: 'sales_orders' })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const history = (data ?? []).map((item: any) => ({
    order_no: item.sales_order?.order_no ?? '—',
    client_name: item.sales_order?.client?.company_name ?? '—',
    date: item.sales_order?.created_at?.split('T')[0] ?? '—',
    quantity: item.quantity,
    unit_price: item.unit_price,
  }))

  return NextResponse.json({ history })
}
