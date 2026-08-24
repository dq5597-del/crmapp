'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Settings2, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import ProductFilterManagerModal from '@/components/ProductFilterManagerModal'
import {
  buildCategoryGroupMappings,
  buildFilterGroups,
  filterGroupsForCategory,
  type ProductFilterGroup,
} from '@/lib/product-filters'

type ProductCategory = {
  id: string
  main_category: string
  mid_category: string | null
  sub_category: string
}

export default function ProductFilterSettings() {
  const supabase = useMemo(() => createClient(), [])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [groups, setGroups] = useState<ProductFilterGroup[]>([])
  const [mainCategory, setMainCategory] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exclusionsReady, setExclusionsReady] = useState(true)

  const loadConfiguration = useCallback(async () => {
    setError('')
    const [categoryRes, groupRes, optionRes, templateGroupRes, categoryTemplateRes, exclusionRes] = await Promise.all([
      supabase.from('product_categories').select('id,main_category,mid_category,sub_category').order('main_category').order('sub_category'),
      supabase.from('product_filter_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_options').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_template_groups').select('template_id,group_id,sort_order'),
      supabase.from('product_category_filter_templates').select('category_id,template_id'),
      supabase.from('product_category_filter_exclusions').select('category_id,group_id'),
    ])
    const firstError = categoryRes.error ?? groupRes.error ?? optionRes.error ?? templateGroupRes.error ?? categoryTemplateRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const nextCategories = (categoryRes.data ?? []) as ProductCategory[]
    const mappings = buildCategoryGroupMappings(
      templateGroupRes.data ?? [],
      categoryTemplateRes.data ?? [],
      exclusionRes.data ?? [],
    )
    setCategories(nextCategories)
    setGroups(buildFilterGroups(groupRes.data ?? [], optionRes.data ?? [], mappings))
    setExclusionsReady(!exclusionRes.error)
    setMainCategory(current => current || nextCategories[0]?.main_category || '')
    setCategoryId(current => current || nextCategories[0]?.id || '')
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadConfiguration()
  }, [loadConfiguration])

  const mainCategories = Array.from(new Set(categories.map(category => category.main_category)))
  const subCategories = categories.filter(category => category.main_category === mainCategory)
  const selectedCategory = categories.find(category => category.id === categoryId) ?? null
  const selectedGroups = filterGroupsForCategory(groups, selectedCategory?.id)
  const linkedGroupCount = selectedGroups.filter(group => group.web_sync_enabled !== false).length

  function selectMainCategory(value: string) {
    setMainCategory(value)
    setCategoryId(categories.find(category => category.main_category === value)?.id ?? '')
  }

  if (loading) {
    return <div className="grid min-h-64 place-items-center rounded-2xl border border-gray-100 bg-white text-sm text-gray-400"><Loader2 size={18} className="mr-2 inline animate-spin" />載入產品篩選器設定中…</div>
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-violet-600" />
              <h2 className="font-semibold text-gray-900">官網產品分類篩選器</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">
              依進銷存產品分類維護篩選條件。產品填入條件值後，推送官網時會自動對應 WooCommerce 全域商品屬性，供 av-shop.com 分類頁篩選器使用。
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={14} />已啟用官網屬性同步
          </div>
        </div>

        {error ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">載入失敗：{error}</div> : null}
        {!exclusionsReady ? <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">新增與修改可正常使用；若要刪除單一分類的條件，請先執行最新 Supabase migration。</div> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-xs font-medium text-gray-600">
            產品主分類
            <select value={mainCategory} onChange={event => selectMainCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500">
              {mainCategories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            產品小分類
            <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500">
              {subCategories.map(category => <option key={category.id} value={category.id}>{category.mid_category ? `${category.mid_category}／` : ''}{category.sub_category}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedCategory || !!error} onClick={() => setManagerOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
            <Settings2 size={15} />管理篩選條件
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{selectedCategory?.sub_category ?? '尚未選擇分類'}</h3>
            <p className="mt-1 text-xs text-gray-400">共 {selectedGroups.length} 個條件，其中 {linkedGroupCount} 個會同步官網</p>
          </div>
        </div>
        {selectedGroups.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedGroups.map(group => (
              <div key={group.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{group.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${group.web_sync_enabled !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>{group.web_sync_enabled !== false ? '同步官網' : '僅 CRM'}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">{group.input_type === 'number' ? `數值${group.unit ? `・${group.unit}` : ''}` : `${group.options.length} 個選項・${group.selection_mode === 'single' ? '單選' : '多選'}`}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">此分類尚無篩選條件，請點「管理篩選條件」新增。</div>
        )}
      </section>

      {selectedCategory ? (
        <ProductFilterManagerModal
          open={managerOpen}
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.sub_category}
          groups={groups}
          supabase={supabase}
          onClose={() => setManagerOpen(false)}
          onSaved={loadConfiguration}
        />
      ) : null}
    </div>
  )
}
