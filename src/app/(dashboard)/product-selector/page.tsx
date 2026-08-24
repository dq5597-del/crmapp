'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Mail, Package, Search, Share2, SlidersHorizontal, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { driveImageUrl } from '@/lib/drive-url'
import { usePermissions } from '@/lib/permissions'
import ProductFilterManagerModal from '@/components/ProductFilterManagerModal'
import {
  buildFilterGroups,
  buildProductNumberMap,
  buildProductOptionMap,
  buildCategoryGroupMappings,
  catalogPublicPrice,
  catalogQuotationMethod,
  matchesGroupedOptions,
  matchesCatalogPriceRange,
  matchesNumericPresetFilters,
  numericRangePresets,
  resolveProductCategory,
  filterGroupsForCategory,
  type CatalogQuotationMethod,
  type ProductFilterGroup,
  type NumericPresetSelections,
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
  category: {
    id: string
    main_category: string | null
    mid_category: string | null
    sub_category: string | null
  } | null
  product_downloads: { file_name: string; file_url: string; sort_order: number }[]
}

function primaryCatalogFile(downloads: ProductRow['product_downloads']) {
  const sorted = [...(downloads ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const isPdf = (download: ProductRow['product_downloads'][number]) => /\.pdf(?:$|[?#])/i.test(download.file_url) || /\.pdf$/i.test(download.file_name)
  return sorted.find(download => /型錄|catalog/i.test(download.file_name))
    ?? sorted.find(isPdf)
    ?? sorted[0]
}

export default function ProductSelectorPage() {
  const supabase = useMemo(() => createClient(), [])
  const { can, ready: permissionsReady } = usePermissions()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [groups, setGroups] = useState<ProductFilterGroup[]>([])
  const [optionMap, setOptionMap] = useState<Record<string, string[]>>({})
  const [numberMap, setNumberMap] = useState<Record<string, Record<string, number>>>({})
  const [search, setSearch] = useState('')
  const [mainCategory, setMainCategory] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [quotationMethods, setQuotationMethods] = useState<CatalogQuotationMethod[]>([])
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [numericSelections, setNumericSelections] = useState<NumericPresetSelections>({})
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [resultLimit, setResultLimit] = useState(60)
  const [shareTitle, setShareTitle] = useState('為您精選的產品型錄')
  const [shareMessage, setShareMessage] = useState('您好，以下是為您整理的產品與型錄，歡迎點選查看。')
  const [recipient, setRecipient] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [filterManagerOpen, setFilterManagerOpen] = useState(false)

  async function reloadFilterConfig() {
    const [groupRes, optionRes, templateGroupRes, categoryTemplateRes, exclusionRes] = await Promise.all([
      supabase.from('product_filter_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_options').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_template_groups').select('template_id,group_id,sort_order'),
      supabase.from('product_category_filter_templates').select('category_id,template_id'),
      supabase.from('product_category_filter_exclusions').select('category_id,group_id'),
    ])
    const firstError = groupRes.error ?? optionRes.error ?? templateGroupRes.error ?? categoryTemplateRes.error
    if (firstError) throw firstError
    const mappings = buildCategoryGroupMappings(templateGroupRes.data ?? [], categoryTemplateRes.data ?? [], exclusionRes.data ?? [])
    setGroups(buildFilterGroups(groupRes.data ?? [], optionRes.data ?? [], mappings))
  }

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id,brand,product_name,model,web_categories,web_category,web_main_image_url,web_sale_price,list_price,is_active,category:product_categories(id,main_category,mid_category,sub_category),product_downloads(file_name,file_url,sort_order)').eq('is_active', true).order('brand').order('product_name'),
      supabase.from('product_filter_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_options').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_assignments').select('product_id,option_id'),
      supabase.from('product_filter_numbers').select('product_id,group_id,numeric_value'),
      supabase.from('product_filter_template_groups').select('template_id,group_id,sort_order'),
      supabase.from('product_category_filter_templates').select('category_id,template_id'),
      supabase.from('product_category_filter_exclusions').select('category_id,group_id'),
    ]).then(([productRes, groupRes, optionRes, assignmentRes, numberRes, templateGroupRes, categoryTemplateRes, exclusionRes]) => {
      const firstError = productRes.error ?? groupRes.error ?? optionRes.error ?? assignmentRes.error ?? numberRes.error ?? templateGroupRes.error ?? categoryTemplateRes.error
      if (firstError) throw firstError
      setProducts((productRes.data ?? []) as unknown as ProductRow[])
      const mappings = buildCategoryGroupMappings(templateGroupRes.data ?? [], categoryTemplateRes.data ?? [], exclusionRes.data ?? [])
      setGroups(buildFilterGroups(groupRes.data ?? [], optionRes.data ?? [], mappings))
      setOptionMap(buildProductOptionMap(assignmentRes.data ?? []))
      setNumberMap(buildProductNumberMap(numberRes.data ?? []))
    }).catch(error => {
      console.error('產品篩選資料載入失敗', error)
      setLoadError(error instanceof Error ? error.message : '無法載入產品篩選資料')
    }).finally(() => {
      setLoading(false)
    })
  }, [supabase])

  const categoryPairs = useMemo(() => {
    const pairs: { main: string; sub: string }[] = []
    const seen = new Set<string>()
    for (const product of products) {
      const { main, sub } = resolveProductCategory(product)
      const key = `${main}\u0000${sub}`
      if (!seen.has(key)) { seen.add(key); pairs.push({ main, sub }) }
    }
    return pairs.sort((a, b) => `${a.main}${a.sub}`.localeCompare(`${b.main}${b.sub}`, 'zh-Hant'))
  }, [products])

  const mainCategories = Array.from(new Set(categoryPairs.map(pair => pair.main)))
  const subCategories = Array.from(new Set(categoryPairs
    .filter(pair => pair.main === mainCategory && pair.sub)
    .map(pair => pair.sub)))
  const categoryProducts = useMemo(() => products.filter(product => {
    const category = resolveProductCategory(product)
    if (mainCategory && category.main !== mainCategory) return false
    return !subCategory || category.sub === subCategory
  }), [products, mainCategory, subCategory])

  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const product of categoryProducts) {
      const value = product.brand?.trim()
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return counts
  }, [categoryProducts])
  const brands = Array.from(brandCounts.keys()).sort((a, b) => a.localeCompare(b, 'en'))

  const selectedCategoryId = useMemo(() => {
    if (!mainCategory || !subCategory) return null
    return products.find(product => {
      const category = resolveProductCategory(product)
      return category.main === mainCategory && category.sub === subCategory
    })?.category?.id ?? null
  }, [products, mainCategory, subCategory])
  const visibleGroups = useMemo(
    () => filterGroupsForCategory(groups, selectedCategoryId),
    [groups, selectedCategoryId],
  )
  const categoryAssignedOptionIds = useMemo(() => new Set(categoryProducts.flatMap(product => optionMap[product.id] ?? [])), [categoryProducts, optionMap])
  const populatedGroups = useMemo(() => {
    if (!subCategory) return []
    return visibleGroups.filter(group => group.input_type === 'number'
      ? categoryProducts.some(product => numberMap[product.id]?.[group.id] != null)
      : group.options.some(option => categoryAssignedOptionIds.has(option.id)))
  }, [visibleGroups, subCategory, categoryProducts, numberMap, categoryAssignedOptionIds])

  function toggleOption(group: ProductFilterGroup, optionId: string) {
    setSelectedOptions(current => {
      const active = current.includes(optionId)
      if (group.selection_mode === 'multiple') return active ? current.filter(id => id !== optionId) : [...current, optionId]
      const groupOptionIds = new Set(group.options.map(option => option.id))
      const selectionsOutsideGroup = current.filter(id => !groupOptionIds.has(id))
      return active ? selectionsOutsideGroup : [...selectionsOutsideGroup, optionId]
    })
  }

  function toggleNumericPreset(group: ProductFilterGroup, presetId: string) {
    setNumericSelections(current => {
      const selected = current[group.id] ?? []
      const active = selected.includes(presetId)
      return { ...current, [group.id]: group.selection_mode === 'single'
        ? (active ? [] : [presetId])
        : (active ? selected.filter(id => id !== presetId) : [...selected, presetId]) }
    })
  }

  const optionNames = useMemo(() => new Map(groups.flatMap(group => group.options.map(option => [option.id, option.name] as const))), [groups])

  const quotationMethodCounts = useMemo(() => categoryProducts.reduce((counts, product) => {
    counts[catalogQuotationMethod(product)] += 1
    return counts
  }, { online: 0, project: 0 }), [categoryProducts])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return products.filter(product => {
      const category = resolveProductCategory(product)
      const specificationTerms = (optionMap[product.id] ?? []).map(optionId => optionNames.get(optionId) ?? '').join(' ')
      if (query && !`${product.brand ?? ''} ${product.model ?? ''} ${product.product_name} ${category.main} ${category.sub} ${specificationTerms}`.toLocaleLowerCase().includes(query)) return false
      if (brand && product.brand !== brand) return false
      if (mainCategory && category.main !== mainCategory) return false
      if (subCategory && category.sub !== subCategory) return false
      if (!matchesCatalogPriceRange(product, priceMin, priceMax)) return false
      if (quotationMethods.length > 0 && !quotationMethods.includes(catalogQuotationMethod(product))) return false
      if (!matchesGroupedOptions(optionMap[product.id] ?? [], selectedOptions, populatedGroups)) return false
      return matchesNumericPresetFilters(numberMap[product.id], numericSelections, populatedGroups)
    })
  }, [products, search, brand, mainCategory, subCategory, priceMin, priceMax, quotationMethods, optionMap, optionNames, selectedOptions, populatedGroups, numberMap, numericSelections])
  const visibleProducts = filtered.slice(0, resultLimit)

  useEffect(() => {
    setResultLimit(60)
  }, [search, mainCategory, subCategory, brand, priceMin, priceMax, quotationMethods, selectedOptions, numericSelections])

  useEffect(() => {
    const visibleGroupIds = new Set(populatedGroups.map(group => group.id))
    const visibleOptionIds = new Set(populatedGroups.flatMap(group => group.options.map(option => option.id)).filter(optionId => categoryAssignedOptionIds.has(optionId)))
    const groupByOption = new Map(populatedGroups.flatMap(group => group.options.map(option => [option.id, group] as const)))
    setSelectedOptions(current => {
      const selectedSingleGroups = new Set<string>()
      return current.filter(optionId => {
        if (!visibleOptionIds.has(optionId)) return false
        const group = groupByOption.get(optionId)
        if (group?.selection_mode !== 'single') return true
        if (selectedSingleGroups.has(group.id)) return false
        selectedSingleGroups.add(group.id)
        return true
      })
    })
    setNumericSelections(current => Object.fromEntries(Object.entries(current)
      .filter(([groupId]) => visibleGroupIds.has(groupId))
      .map(([groupId, values]) => [groupId, populatedGroups.find(group => group.id === groupId)?.selection_mode === 'single' ? values.slice(0, 1) : values])))
  }, [populatedGroups, categoryAssignedOptionIds])

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
    setSearch(''); setMainCategory(''); setSubCategory(''); setBrand(''); setPriceMin(''); setPriceMax(''); setQuotationMethods([]); setSelectedOptions([]); setNumericSelections({})
  }

  function toggleQuotationMethod(method: CatalogQuotationMethod) {
    setQuotationMethods(current => current.includes(method) ? current.filter(value => value !== method) : [...current, method])
  }

  const activeFilterCount = [search, mainCategory, subCategory, brand, priceMin || priceMax]
    .filter(Boolean).length + quotationMethods.length + selectedOptions.length
    + Object.values(numericSelections).reduce((total, values) => total + values.length, 0)

  const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })
  const selectedOptionLabels = selectedOptions.map(optionId => ({ id: optionId, label: optionNames.get(optionId) ?? '規格' }))
  const selectedNumericLabels = Object.entries(numericSelections).flatMap(([groupId, presetIds]) => {
    const group = populatedGroups.find(value => value.id === groupId)
    if (!group) return []
    const presets = new Map(numericRangePresets(group).map(preset => [preset.id, preset.label]))
    return presetIds.map(presetId => ({ groupId, presetId, label: `${group.name}：${presets.get(presetId) ?? presetId}` }))
  })

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><SlidersHorizontal size={21} /></div>
          <div><h1 className="text-xl font-bold text-gray-900">產品篩選與型錄分享</h1><p className="mt-0.5 text-sm text-gray-500">篩選產品、現場展示，或寄送專屬型錄給顧客</p></div>
        </div>
        <button type="button" onClick={clearFilters} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"><X size={14} />清除篩選{activeFilterCount > 0 ? `（${activeFilterCount}）` : ''}</button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)_320px]">
        <aside className="h-fit space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-900">型錄篩選器</h2>{activeFilterCount > 0 ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">已套用 {activeFilterCount}</span> : null}</div>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="品牌、型號、產品名稱、規格" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" /></div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-700">產品分類</label>
          <div className="grid grid-cols-2 gap-2">
            <select value={mainCategory} onChange={event => { setMainCategory(event.target.value); setSubCategory(''); setBrand(''); setSelectedOptions([]); setNumericSelections({}) }} className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs"><option value="">全部大類</option>{mainCategories.map(value => <option key={value}>{value}</option>)}</select>
            <select value={subCategory} onChange={event => { setSubCategory(event.target.value); setBrand(''); setSelectedOptions([]); setNumericSelections({}) }} disabled={!mainCategory} className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs disabled:bg-gray-50"><option value="">全部小類</option>{subCategories.map(value => <option key={value}>{value}</option>)}</select>
          </div>
          </div>
          <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">品牌</label><select value={brand} onChange={event => setBrand(event.target.value)} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs"><option value="">全部品牌（{categoryProducts.length}）</option>{brands.map(value => <option key={value} value={value}>{value}（{brandCounts.get(value)}）</option>)}</select></div>

          <fieldset className="border-t border-gray-100 pt-3">
            <legend className="mb-2 text-xs font-semibold text-gray-700">價格區間（網路標價）</legend>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input type="number" min="0" inputMode="numeric" value={priceMin} onChange={event => setPriceMin(event.target.value)} placeholder="最低價" aria-label="最低網路標價" className="min-w-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-500" />
              <span className="text-xs text-gray-400">至</span>
              <input type="number" min="0" inputMode="numeric" value={priceMax} onChange={event => setPriceMax(event.target.value)} placeholder="最高價" aria-label="最高網路標價" className="min-w-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </fieldset>

          <fieldset className="border-t border-gray-100 pt-3">
            <legend className="mb-2 text-xs font-semibold text-gray-700">報價方式</legend>
            <div className="grid grid-cols-2 gap-2">
              {([{ id: 'online', label: '網路標價', count: quotationMethodCounts.online }, { id: 'project', label: '專案報價', count: quotationMethodCounts.project }] as const).map(method => {
                const active = quotationMethods.includes(method.id)
                return <button key={method.id} type="button" aria-pressed={active} onClick={() => toggleQuotationMethod(method.id)} className={`rounded-lg border px-2.5 py-2 text-xs font-medium ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 text-gray-600 hover:border-violet-300'}`}>{method.label} <span className={active ? 'text-violet-100' : 'text-gray-400'}>({method.count})</span></button>
              })}
            </div>
          </fieldset>

          {!subCategory ? <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-3 text-xs leading-5 text-violet-700">請先選擇小類，系統會顯示該產品類別專用的篩選條件。</div> : null}
          {subCategory && visibleGroups.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-700">這個小類目前尚未設定專用篩選器。</div> : null}
          {subCategory && visibleGroups.length > 0 && populatedGroups.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-700">專用篩選欄位已建立，但目前商品尚未回填規格值；完成資料回填後會自動顯示。</div> : null}
          {subCategory ? <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-gray-700">{subCategory}專用規格</h3>{permissionsReady && can('product-selector', 'can_edit') && selectedCategoryId ? <button type="button" onClick={() => setFilterManagerOpen(true)} className="rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50">管理條件</button> : null}</div>
            {populatedGroups.length > 0 ? <p className="mt-1 text-[11px] text-gray-400">只顯示已有商品資料的條件；各組依設定支援單選或多選</p> : null}
          </div> : null}
          {populatedGroups.filter(group => group.input_type === 'multi_select').map(group => (
            <fieldset key={group.id} className="border-t border-gray-100 pt-3"><legend className="mb-2 text-xs font-semibold text-gray-700">{group.name}<span className="ml-1 font-normal text-gray-400">（{group.selection_mode === 'single' ? '單選' : '多選'}）</span></legend><div className="flex flex-wrap gap-1.5">{group.options.filter(option => categoryAssignedOptionIds.has(option.id)).map(option => { const active = selectedOptions.includes(option.id); return <button key={option.id} type="button" aria-pressed={active} onClick={() => toggleOption(group, option.id)} className={`rounded-full border px-2.5 py-1 text-[11px] ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 text-gray-600 hover:border-violet-300'}`}>{option.name}</button> })}</div></fieldset>
          ))}
          {populatedGroups.filter(group => group.input_type === 'number').map(group => (
            <fieldset key={group.id} className="border-t border-gray-100 pt-3">
              <legend className="mb-2 text-xs font-semibold text-gray-700">{group.name}<span className="ml-1 font-normal text-gray-400">（{group.selection_mode === 'single' ? '單選' : '多選'}）</span></legend>
              <div className="flex flex-wrap gap-1.5">{numericRangePresets(group).map(preset => {
                const active = numericSelections[group.id]?.includes(preset.id) ?? false
                return <button key={preset.id} type="button" aria-pressed={active} onClick={() => toggleNumericPreset(group, preset.id)} className={`rounded-full border px-2.5 py-1 text-[11px] ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 text-gray-600 hover:border-violet-300'}`}>{preset.label}</button>
              })}</div>
            </fieldset>
          ))}
        </aside>

        <main>
          <div className="mb-3 flex items-center justify-between"><p className="text-sm text-gray-600">找到 <strong className="text-violet-700">{filtered.length}</strong> 項產品</p><button type="button" onClick={() => setSelectedProducts(filtered.map(product => product.id))} className="text-xs text-violet-700 hover:underline">全選目前結果</button></div>
          {activeFilterCount > 0 ? <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50/50 p-2.5">
            <span className="mr-1 text-[11px] font-semibold text-violet-700">已套用</span>
            {search ? <button type="button" onClick={() => setSearch('')} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">搜尋：{search} ×</button> : null}
            {mainCategory ? <button type="button" onClick={() => { setMainCategory(''); setSubCategory(''); setBrand('') }} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">{mainCategory} ×</button> : null}
            {subCategory ? <button type="button" onClick={() => { setSubCategory(''); setBrand('') }} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">{subCategory} ×</button> : null}
            {brand ? <button type="button" onClick={() => setBrand('')} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">品牌：{brand} ×</button> : null}
            {priceMin || priceMax ? <button type="button" onClick={() => { setPriceMin(''); setPriceMax('') }} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">價格：{priceMin || '0'}～{priceMax || '不限'} ×</button> : null}
            {quotationMethods.map(method => <button key={method} type="button" onClick={() => toggleQuotationMethod(method)} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">{method === 'online' ? '網路標價' : '專案報價'} ×</button>)}
            {selectedOptionLabels.map(option => <button key={option.id} type="button" onClick={() => setSelectedOptions(current => current.filter(id => id !== option.id))} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">{option.label} ×</button>)}
            {selectedNumericLabels.map(selection => <button key={`${selection.groupId}-${selection.presetId}`} type="button" onClick={() => setNumericSelections(current => ({ ...current, [selection.groupId]: (current[selection.groupId] ?? []).filter(id => id !== selection.presetId) }))} className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 shadow-sm">{selection.label} ×</button>)}
            <button type="button" onClick={clearFilters} className="ml-auto text-[11px] font-medium text-violet-700 hover:underline">全部清除</button>
          </div> : null}
          {loading ? <div className="rounded-2xl bg-white p-16 text-center text-sm text-gray-400">載入產品中…</div> : loadError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">產品資料載入失敗：{loadError}</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center text-sm text-gray-400">沒有符合條件的產品</div> : <><div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{visibleProducts.map(product => {
            const active = selectedProducts.includes(product.id)
            const values = numberMap[product.id] ?? {}
            const catalogFile = primaryCatalogFile(product.product_downloads)
            const publicPrice = catalogPublicPrice(product)
            return <article key={product.id} className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm transition ${active ? 'border-violet-500 ring-2 ring-violet-100' : 'border-gray-100 hover:border-violet-200'}`}>
              <button type="button" aria-label={`${active ? '取消' : '選取'} ${product.product_name}`} onClick={() => setSelectedProducts(current => active ? current.filter(id => id !== product.id) : [...current, product.id])} className={`absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full border ${active ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 bg-white text-gray-300'}`}>{active ? <Check size={15} /> : null}</button>
              <a href={catalogFile?.file_url} target={catalogFile ? '_blank' : undefined} rel={catalogFile ? 'noreferrer' : undefined} aria-label={catalogFile ? `開啟 ${product.product_name} 產品型錄` : undefined} className={`block ${catalogFile ? 'group cursor-pointer' : ''}`}>
                <div className="grid h-44 place-items-center bg-gray-50 p-4">{product.web_main_image_url ? <img src={driveImageUrl(product.web_main_image_url, 600)} alt={product.product_name} loading="lazy" className="h-full w-full object-contain" /> : <Package size={36} className="text-gray-200" />}</div>
                <div className="p-4"><div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold text-violet-700">{product.brand || '未設定品牌'}</div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${publicPrice == null ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{publicPrice == null ? '專案報價' : '網路標價'}</span></div><h2 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{product.model ? `${product.model} ` : ''}{product.product_name}</h2>{publicPrice != null ? <p className="mt-2 text-sm font-bold text-gray-900">{currency.format(publicPrice)}</p> : <p className="mt-2 text-xs font-medium text-amber-700">請洽專案人員報價</p>}<div className="mt-2 flex flex-wrap gap-1">{populatedGroups.filter(group => group.input_type === 'number' && values[group.id] != null).map(group => <span key={group.id} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{group.name} {values[group.id]}{group.unit}</span>)}</div>{catalogFile ? <p className="mt-3 flex items-center gap-1 text-xs font-medium text-violet-700 group-hover:underline">開啟產品型錄 <ExternalLink size={12} /></p> : <p className="mt-3 text-xs text-gray-400">目前沒有產品型錄</p>}</div>
              </a>
            </article>
          })}</div>{visibleProducts.length < filtered.length ? <button type="button" onClick={() => setResultLimit(current => current + 60)} className="mt-4 w-full rounded-xl border border-violet-200 bg-white py-3 text-sm font-medium text-violet-700 hover:bg-violet-50">顯示更多（尚有 {filtered.length - visibleProducts.length} 項）</button> : null}</>}
        </main>

        <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-4 shadow-sm xl:sticky xl:top-4">
          <div className="mb-4 flex items-center gap-2"><Share2 size={17} className="text-violet-600" /><h2 className="font-semibold text-gray-900">分享型錄</h2><span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">{selectedProducts.length}</span></div>
          <div className="space-y-3"><input value={shareTitle} onChange={event => setShareTitle(event.target.value)} placeholder="分享標題" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /><textarea value={shareMessage} onChange={event => setShareMessage(event.target.value)} rows={4} placeholder="給顧客的說明" className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" /><input type="email" value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="顧客 Email（寄送時填寫）" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button disabled={sharing || selectedProducts.length === 0} onClick={() => createShare(false)} className="flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2.5 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-40"><Copy size={14} />複製連結</button><button disabled={sharing || selectedProducts.length === 0} onClick={() => createShare(true)} className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2.5 text-sm text-white hover:bg-violet-700 disabled:opacity-40"><Mail size={14} />直接寄送</button></div>
          {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><ExternalLink size={13} />開啟消費者展示頁</a> : null}
          <p className="mt-4 text-[11px] leading-5 text-gray-400">消費者頁面不顯示成本、庫存或內部備註；只顯示產品圖片、公開售價、規格 Tags 與型錄下載。</p>
        </aside>
      </div>
      {selectedCategoryId ? <ProductFilterManagerModal
        open={filterManagerOpen}
        categoryId={selectedCategoryId}
        categoryName={subCategory}
        groups={groups}
        supabase={supabase}
        onClose={() => setFilterManagerOpen(false)}
        onSaved={reloadFilterConfig}
      /> : null}
    </div>
  )
}
