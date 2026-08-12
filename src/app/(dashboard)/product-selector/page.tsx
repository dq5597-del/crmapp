'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Mail, Package, Search, Share2, SlidersHorizontal, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { driveImageUrl } from '@/lib/drive-url'
import {
  buildFilterGroups,
  buildProductNumberMap,
  buildProductOptionMap,
  matchesGroupedOptions,
  matchesNumberRanges,
  type ProductFilterGroup,
} from '@/lib/product-filters'

type ProductRow = {
  id: string
  brand: string | null
  product_name: string
  model: string | null
  web_categories: string[] | null
  web_category: string | null
  web_main_image_url: string | null
  web_sale_price: number | null
  list_price: number
  is_active: boolean
  product_downloads: { file_name: string; file_url: string; sort_order: number }[]
}

type RangeMap = Record<string, { min: string; max: string }>

export default function ProductSelectorPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [groups, setGroups] = useState<ProductFilterGroup[]>([])
  const [optionMap, setOptionMap] = useState<Record<string, string[]>>({})
  const [numberMap, setNumberMap] = useState<Record<string, Record<string, number>>>({})
  const [search, setSearch] = useState('')
  const [mainCategory, setMainCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [ranges, setRanges] = useState<RangeMap>({})
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [shareTitle, setShareTitle] = useState('為您精選的產品型錄')
  const [shareMessage, setShareMessage] = useState('您好，以下是為您整理的產品與型錄，歡迎點選查看。')
  const [recipient, setRecipient] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id,brand,product_name,model,web_categories,web_category,web_main_image_url,web_sale_price,list_price,is_active,product_downloads(file_name,file_url,sort_order)').eq('is_active', true).order('brand').order('product_name'),
      supabase.from('product_filter_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_options').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_assignments').select('product_id,option_id'),
      supabase.from('product_filter_numbers').select('product_id,group_id,numeric_value'),
    ]).then(([productRes, groupRes, optionRes, assignmentRes, numberRes]) => {
      setProducts((productRes.data ?? []) as unknown as ProductRow[])
      setGroups(buildFilterGroups(groupRes.data ?? [], optionRes.data ?? []))
      setOptionMap(buildProductOptionMap(assignmentRes.data ?? []))
      setNumberMap(buildProductNumberMap(numberRes.data ?? []))
      setLoading(false)
    })
  }, [])

  const categoryPairs = useMemo(() => {
    const pairs: { main: string; sub: string }[] = []
    const seen = new Set<string>()
    for (const product of products) {
      const values = product.web_categories?.length ? product.web_categories : (product.web_category ? [product.web_category] : [])
      for (const value of values) {
        const [main, sub = ''] = value.includes(' > ') ? value.split(' > ', 2) : ['其他分類', value]
        const key = `${main}\u0000${sub}`
        if (!seen.has(key)) { seen.add(key); pairs.push({ main, sub }) }
      }
    }
    return pairs.sort((a, b) => `${a.main}${a.sub}`.localeCompare(`${b.main}${b.sub}`, 'zh-Hant'))
  }, [products])

  const mainCategories = Array.from(new Set(categoryPairs.map(pair => pair.main)))
  const subCategories = categoryPairs.filter(pair => !mainCategory || pair.main === mainCategory).map(pair => pair.sub)
  const brands = Array.from(new Set(products.map(product => product.brand?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'en'))

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return products.filter(product => {
      if (query && !`${product.brand ?? ''} ${product.model ?? ''} ${product.product_name}`.toLocaleLowerCase().includes(query)) return false
      if (brand && product.brand !== brand) return false
      const categories = product.web_categories?.length ? product.web_categories : (product.web_category ? [product.web_category] : [])
      if (mainCategory && !categories.some(value => value.startsWith(`${mainCategory} > `))) return false
      if (subCategory && !categories.some(value => value === `${mainCategory} > ${subCategory}` || value === subCategory)) return false
      if (!matchesGroupedOptions(optionMap[product.id] ?? [], selectedOptions, groups)) return false
      return matchesNumberRanges(numberMap[product.id], ranges)
    })
  }, [products, search, brand, mainCategory, subCategory, optionMap, selectedOptions, groups, numberMap, ranges])

  async function createShare(sendEmail: boolean) {
    if (selectedProducts.length === 0) return alert('請先勾選至少一項產品')
    if (sendEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return alert('請輸入正確的顧客 Email')
    setSharing(true)
    try {
      const { data: share, error } = await supabase.from('product_catalog_shares')
        .insert({ title: shareTitle.trim() || '產品型錄', message: shareMessage.trim() || null })
        .select('id,share_token').single()
      if (error) throw error
      const { error: itemError } = await supabase.from('product_catalog_share_items').insert(
        selectedProducts.map((productId, index) => ({ share_id: share.id, product_id: productId, sort_order: index }))
      )
      if (itemError) throw itemError
      const url = `${window.location.origin}/catalog/${share.share_token}`
      setShareUrl(url)
      if (sendEmail) {
        const response = await fetch('/api/product-catalog-shares/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: recipient, title: shareTitle, message: shareMessage, url }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? '寄送失敗')
        alert('型錄已寄出')
      } else {
        await navigator.clipboard.writeText(url)
        alert('分享連結已建立並複製')
      }
    } catch (error: any) {
      alert(`建立分享失敗：${error.message}`)
    } finally {
      setSharing(false)
    }
  }

  function clearFilters() {
    setSearch(''); setMainCategory(''); setSubCategory(''); setBrand(''); setSelectedOptions([]); setRanges({})
  }

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><SlidersHorizontal size={21} /></div>
          <div><h1 className="text-xl font-bold text-gray-900">產品篩選與型錄分享</h1><p className="mt-0.5 text-sm text-gray-500">篩選產品、現場展示，或寄送專屬型錄給顧客</p></div>
        </div>
        <button type="button" onClick={clearFilters} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"><X size={14} />清除篩選</button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)_320px]">
        <aside className="h-fit space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="品牌、型號、產品名稱" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" /></div>
          <div className="grid grid-cols-2 gap-2">
            <select value={mainCategory} onChange={event => { setMainCategory(event.target.value); setSubCategory('') }} className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs"><option value="">全部大類</option>{mainCategories.map(value => <option key={value}>{value}</option>)}</select>
            <select value={subCategory} onChange={event => setSubCategory(event.target.value)} disabled={!mainCategory} className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs disabled:bg-gray-50"><option value="">全部小類</option>{subCategories.map(value => <option key={value}>{value}</option>)}</select>
          </div>
          <select value={brand} onChange={event => setBrand(event.target.value)} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs"><option value="">全部品牌</option>{brands.map(value => <option key={value}>{value}</option>)}</select>

          {groups.filter(group => group.input_type === 'multi_select').map(group => (
            <fieldset key={group.id} className="border-t border-gray-100 pt-3"><legend className="mb-2 text-xs font-semibold text-gray-700">{group.name}</legend><div className="flex flex-wrap gap-1.5">{group.options.map(option => { const active = selectedOptions.includes(option.id); return <button key={option.id} type="button" aria-pressed={active} onClick={() => setSelectedOptions(current => active ? current.filter(id => id !== option.id) : [...current, option.id])} className={`rounded-full border px-2.5 py-1 text-[11px] ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 text-gray-600 hover:border-violet-300'}`}>{option.name}</button> })}</div></fieldset>
          ))}
          {groups.filter(group => group.input_type === 'number').map(group => (
            <fieldset key={group.id} className="border-t border-gray-100 pt-3"><legend className="mb-2 text-xs font-semibold text-gray-700">{group.name} {group.unit ? `(${group.unit})` : ''}</legend><div className="grid grid-cols-2 gap-2"><input type="number" min="0" placeholder="最小" value={ranges[group.id]?.min ?? ''} onChange={event => setRanges(current => ({ ...current, [group.id]: { min: event.target.value, max: current[group.id]?.max ?? '' } }))} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs" /><input type="number" min="0" placeholder="最大" value={ranges[group.id]?.max ?? ''} onChange={event => setRanges(current => ({ ...current, [group.id]: { min: current[group.id]?.min ?? '', max: event.target.value } }))} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs" /></div></fieldset>
          ))}
        </aside>

        <main>
          <div className="mb-3 flex items-center justify-between"><p className="text-sm text-gray-600">找到 <strong className="text-violet-700">{filtered.length}</strong> 項產品</p><button type="button" onClick={() => setSelectedProducts(filtered.map(product => product.id))} className="text-xs text-violet-700 hover:underline">全選目前結果</button></div>
          {loading ? <div className="rounded-2xl bg-white p-16 text-center text-sm text-gray-400">載入產品中…</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center text-sm text-gray-400">沒有符合條件的產品</div> : <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{filtered.map(product => {
            const active = selectedProducts.includes(product.id)
            const values = numberMap[product.id] ?? {}
            return <article key={product.id} className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm transition ${active ? 'border-violet-500 ring-2 ring-violet-100' : 'border-gray-100 hover:border-violet-200'}`}>
              <button type="button" aria-label={`${active ? '取消' : '選取'} ${product.product_name}`} onClick={() => setSelectedProducts(current => active ? current.filter(id => id !== product.id) : [...current, product.id])} className={`absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full border ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 bg-white text-gray-300'}`}>{active ? <Check size={15} /> : null}</button>
              <div className="grid h-44 place-items-center bg-gray-50 p-4">{product.web_main_image_url ? <img src={driveImageUrl(product.web_main_image_url, 600)} alt={product.product_name} loading="lazy" className="h-full w-full object-contain" /> : <Package size={36} className="text-gray-200" />}</div>
              <div className="p-4"><div className="text-xs font-semibold text-violet-700">{product.brand || '未設定品牌'}</div><h2 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{product.model ? `${product.model} ` : ''}{product.product_name}</h2><div className="mt-2 flex flex-wrap gap-1">{groups.filter(group => group.input_type === 'number' && values[group.id] != null).map(group => <span key={group.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{group.name} {values[group.id]}{group.unit}</span>)}</div><p className="mt-3 text-xs text-gray-400">型錄 {product.product_downloads?.length ?? 0} 份</p></div>
            </article>
          })}</div>}
        </main>

        <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="mb-4 flex items-center gap-2"><Share2 size={17} className="text-violet-600" /><h2 className="font-semibold text-gray-900">分享型錄</h2><span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">{selectedProducts.length}</span></div>
          <div className="space-y-3"><input value={shareTitle} onChange={event => setShareTitle(event.target.value)} placeholder="分享標題" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /><textarea value={shareMessage} onChange={event => setShareMessage(event.target.value)} rows={4} placeholder="給顧客的說明" className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" /><input type="email" value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="顧客 Email（寄送時填寫）" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button disabled={sharing || selectedProducts.length === 0} onClick={() => createShare(false)} className="flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2.5 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-40"><Copy size={14} />複製連結</button><button disabled={sharing || selectedProducts.length === 0} onClick={() => createShare(true)} className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2.5 text-sm text-white hover:bg-violet-700 disabled:opacity-40"><Mail size={14} />直接寄送</button></div>
          {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><ExternalLink size={13} />開啟消費者展示頁</a> : null}
          <p className="mt-4 text-[11px] leading-5 text-gray-400">消費者頁面不顯示成本、庫存或內部備註；只顯示產品圖片、公開售價、規格 Tags 與型錄下載。</p>
        </aside>
      </div>
    </div>
  )
}
