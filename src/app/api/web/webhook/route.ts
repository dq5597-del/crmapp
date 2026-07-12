import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * POST /api/web/webhook
 *
 * 接收 av-shop.com 商品「發佈」後的回寫通知（WPCode 片段 10597）
 * body: { event, product_id, crm_id, sku, permalink, status, published }
 *
 * 驗證：Header  x-avshop-secret  必須等於 .env.local 的 WC_WEBHOOK_SECRET
 * 注意：此路由不經過使用者登入，因此使用 Supabase service role key 寫入。
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WC_WEBHOOK_SECRET ?? ''
  const provided = req.headers.get('x-avshop-secret') ?? ''

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.crm_id && !body?.product_id) {
    return NextResponse.json({ error: 'missing crm_id / product_id' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 未設定' }, { status: 500 })
  }

  const supabase = createSupabaseClient(url, key, { auth: { persistSession: false } })

  const isPublished = body.status === 'publish'
  const update = {
    web_publish: isPublished,
    web_product_id: body.product_id ? String(body.product_id) : undefined,
    web_product_url: body.permalink ?? undefined,
  }

  const query = supabase.from('products').update(update)
  const { error } = body.crm_id
    ? await query.eq('id', body.crm_id)
    : await query.eq('web_product_id', String(body.product_id))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, crm_id: body.crm_id ?? null, published: isPublished })
}
