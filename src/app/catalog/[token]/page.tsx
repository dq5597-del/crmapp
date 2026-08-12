import { notFound } from 'next/navigation'
import { Download, ExternalLink, Package } from 'lucide-react'
import { driveImageUrl } from '@/lib/drive-url'
import { printServiceClient } from '@/lib/print-server'

export const dynamic = 'force-dynamic'

export default async function PublicProductCatalogPage({ params }: { params: { token: string } }) {
  const supabase = printServiceClient()
  if (!supabase) return notFound()

  const { data: share } = await supabase.from('product_catalog_shares')
    .select('id,title,message,expires_at,is_active,created_at')
    .eq('share_token', params.token).maybeSingle()
  if (!share?.is_active || (share.expires_at && new Date(share.expires_at) < new Date())) return notFound()

  const { data: itemRows } = await supabase.from('product_catalog_share_items')
    .select('product_id,sort_order').eq('share_id', share.id).order('sort_order')
  const productIds = (itemRows ?? []).map(row => row.product_id)
  if (productIds.length === 0) return notFound()

  const [{ data: productRows }, { data: assignmentRows }, { data: numberRows }] = await Promise.all([
    supabase.from('products').select('id,brand,product_name,model,web_main_image_url,web_sale_price,list_price,web_product_url,web_categories,product_downloads(file_name,file_url,sort_order)').in('id', productIds),
    supabase.from('product_filter_assignments').select('product_id,option:product_filter_options(name,group:product_filter_groups(name))').in('product_id', productIds),
    supabase.from('product_filter_numbers').select('product_id,numeric_value,group:product_filter_groups(name,unit)').in('product_id', productIds),
  ])
  const productsById = new Map((productRows ?? []).map(product => [product.id, product]))
  const products = productIds.map(id => productsById.get(id)).filter(Boolean) as any[]
  const tagsByProduct = new Map<string, any[]>()
  for (const row of assignmentRows ?? []) tagsByProduct.set(row.product_id, [...(tagsByProduct.get(row.product_id) ?? []), row.option])
  const numbersByProduct = new Map<string, any[]>()
  for (const row of numberRows ?? []) numbersByProduct.set(row.product_id, [...(numbersByProduct.get(row.product_id) ?? []), row])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <img src="/icons/icon-192.png" alt="光輝影音科技" className="h-10 w-10 rounded-xl object-cover" />
          <div><p className="text-xs text-slate-500">光輝影音科技</p><p className="font-semibold text-slate-900">產品型錄展示</p></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-7 rounded-3xl bg-gradient-to-br from-violet-700 to-blue-700 p-6 text-white shadow-lg sm:p-8">
          <p className="text-xs font-medium tracking-widest text-violet-200">PRODUCT CATALOG</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{share.title}</h1>
          {share.message ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-violet-100">{share.message}</p> : null}
          <p className="mt-5 text-xs text-violet-200">共 {products.length} 項產品 · 建立於 {new Date(share.created_at).toLocaleDateString('zh-TW')}</p>
        </section>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(product => {
            const tags = tagsByProduct.get(product.id) ?? []
            const numbers = numbersByProduct.get(product.id) ?? []
            const downloads = [...(product.product_downloads ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            const price = Number(product.web_sale_price) || Number(product.list_price) || 0
            return (
              <article key={product.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="grid h-56 place-items-center bg-white p-5">
                  {product.web_main_image_url ? <img src={driveImageUrl(product.web_main_image_url, 800)} alt={product.product_name} className="h-full w-full object-contain" /> : <Package size={48} className="text-slate-200" />}
                </div>
                <div className="border-t border-slate-100 p-5">
                  <p className="text-xs font-semibold text-violet-700">{product.brand || '未設定品牌'}</p>
                  <h2 className="mt-1 text-base font-bold text-slate-900">{product.model ? `${product.model} ` : ''}{product.product_name}</h2>
                  {price > 0 ? <p className="mt-2 text-lg font-bold text-blue-700">NT${price.toLocaleString('zh-TW')}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {numbers.map((row: any, index: number) => <span key={`n-${index}`} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700">{row.group?.name} {Number(row.numeric_value)}{row.group?.unit}</span>)}
                    {tags.slice(0, 8).map((option: any, index: number) => <span key={`t-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{option?.name}</span>)}
                  </div>
                  {downloads.length > 0 ? <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">{downloads.map((download: any, index: number) => <a key={`${download.file_url}-${index}`} href={download.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-xs font-medium text-violet-700 hover:bg-violet-100"><Download size={14} /> <span className="min-w-0 flex-1 truncate">{download.file_name}</span><ExternalLink size={12} /></a>)}</div> : <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">此產品目前沒有可下載型錄</p>}
                  {product.web_product_url ? <a href={product.web_product_url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">查看單一商品頁 <ExternalLink size={12} /></a> : null}
                </div>
              </article>
            )
          })}
        </div>
        <footer className="py-8 text-center text-xs text-slate-400">此型錄由光輝影音科技提供 · 商品資訊與價格請以正式報價為準</footer>
      </main>
    </div>
  )
}
