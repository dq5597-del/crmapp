import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { websiteCategoryLeaf } from '@/lib/catalog-drive'
import {
  buildCategoryGroupMappings,
  buildFilterGroups,
  filterGroupsForCategory,
  type ProductFilterGroup,
} from '@/lib/product-filters'
import { findExactCategoryByName } from '@/lib/woocommerce'
import { WooFilterSync } from '@/lib/woocommerce-filter-sync'
import { syncWordPressFilterSets, type WordPressCategoryFilter } from '@/lib/wordpress-filter-set-publisher'

export const maxDuration = 300

type ProductCategory = {
  id: string
  main_category: string
  mid_category: string | null
  sub_category: string
}

function wooAuth() {
  const store = (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
  const key = process.env.WC_CONSUMER_KEY ?? ''
  const secret = process.env.WC_CONSUMER_SECRET ?? ''
  if (!store || !key || !secret) return null
  return { store, header: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }
}

function categoryWebsiteNames(category: ProductCategory, products: any[]) {
  const names = products.flatMap(product => {
    const values = Array.isArray(product.web_categories) && product.web_categories.length
      ? product.web_categories
      : [product.web_category ?? '']
    return values.map((value: string) => websiteCategoryLeaf(value)).filter(Boolean)
  })
  if (!names.length && category.sub_category?.trim()) names.push(category.sub_category.trim())
  return Array.from(new Set(names.map(name => name.normalize('NFKC').trim()).filter(Boolean)))
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const supabase = createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: '登入已逾時，請重新登入後再同步官網篩選器' }, { status: 401 })
  }

  const woo = wooAuth()
  if (!woo) {
    return NextResponse.json({ error: '尚未設定 WooCommerce API 金鑰' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const categoryId = typeof body?.category_id === 'string' ? body.category_id : ''
  const legacyGroupId = typeof body?.group_id === 'string' ? body.group_id : ''
  const groupIds = Array.from(new Set([
    legacyGroupId,
    ...(Array.isArray(body?.group_ids) ? body.group_ids.filter((id: unknown): id is string => typeof id === 'string') : []),
  ].map(id => id.trim()).filter(Boolean)))
  if (!categoryId) {
    return NextResponse.json({ error: '缺少產品分類 ID' }, { status: 400 })
  }

  try {
    const [categoryRes, groupRes, optionRes, templateGroupRes, categoryTemplateRes, exclusionRes] = await Promise.all([
      supabase.from('product_categories').select('id,main_category,mid_category,sub_category'),
      supabase.from('product_filter_groups').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_options').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('product_filter_template_groups').select('template_id,group_id,sort_order'),
      supabase.from('product_category_filter_templates').select('category_id,template_id'),
      supabase.from('product_category_filter_exclusions').select('category_id,group_id'),
    ])
    const queryError = categoryRes.error ?? groupRes.error ?? optionRes.error ?? templateGroupRes.error
      ?? categoryTemplateRes.error ?? exclusionRes.error
    if (queryError) throw queryError

    const categories = (categoryRes.data ?? []) as ProductCategory[]
    const mappings = buildCategoryGroupMappings(
      templateGroupRes.data ?? [], categoryTemplateRes.data ?? [], exclusionRes.data ?? [],
    )
    const groups = buildFilterGroups(groupRes.data ?? [], optionRes.data ?? [], mappings)
    const affectedIds = new Set<string>([categoryId])
    if (groupIds.length) {
      const requestedGroups = new Set(groupIds)
      for (const group of groups) {
        if (requestedGroups.has(group.id)) group.category_ids.forEach(id => affectedIds.add(id))
      }
    }
    const affectedCategories = categories.filter(category => affectedIds.has(category.id))
    if (!affectedCategories.length) throw new Error('找不到要同步的產品分類')

    const { data: products, error: productError } = await supabase.from('products')
      .select('category_id,web_categories,web_category').in('category_id', Array.from(affectedIds))
    if (productError) throw productError
    const productsByCategory = new Map<string, any[]>()
    for (const product of products ?? []) {
      const rows = productsByCategory.get(product.category_id) ?? []
      rows.push(product)
      productsByCategory.set(product.category_id, rows)
    }

    const categoryGroups = new Map<string, ProductFilterGroup[]>()
    const uniqueGroups = new Map<string, ProductFilterGroup>()
    for (const category of affectedCategories) {
      const visible = filterGroupsForCategory(groups, category.id)
      categoryGroups.set(category.id, visible)
      visible.filter(group => group.web_sync_enabled !== false).forEach(group => uniqueGroups.set(group.id, group))
    }

    const filterSync = new WooFilterSync(supabase, woo.store, woo.header)
    const definitions = await filterSync.prepareFilterDefinitions(Array.from(uniqueGroups.values()))
    const definitionByGroup = new Map(definitions.map(definition => [definition.crm_group_id, definition]))
    const unresolved: Array<{ category_id: string; name: string }> = []
    const payloadByWooCategory = new Map<number, WordPressCategoryFilter & { crmIds: Set<string> }>()

    for (const category of affectedCategories) {
      const filterDefinitions = (categoryGroups.get(category.id) ?? [])
        .filter(group => group.web_sync_enabled !== false)
        .flatMap(group => definitionByGroup.get(group.id) ?? [])
      const names = categoryWebsiteNames(category, productsByCategory.get(category.id) ?? [])
      for (const name of names) {
        const websiteCategory = await findExactCategoryByName(name)
        if (!websiteCategory) {
          unresolved.push({ category_id: category.id, name })
          continue
        }
        const current = payloadByWooCategory.get(websiteCategory.id) ?? {
          crm_category_id: category.id,
          woo_category_id: websiteCategory.id,
          title: websiteCategory.name,
          filters: [],
          crmIds: new Set<string>(),
        }
        current.crmIds.add(category.id)
        const existing = new Set(current.filters.map(filter => filter.crm_group_id))
        for (const definition of filterDefinitions) {
          if (!existing.has(definition.crm_group_id)) {
            current.filters.push(definition)
            existing.add(definition.crm_group_id)
          }
        }
        payloadByWooCategory.set(websiteCategory.id, current)
      }
    }

    const payloads = Array.from(payloadByWooCategory.values()).map(({ crmIds, ...payload }) => ({
      ...payload,
      crm_category_id: Array.from(crmIds).sort().join(','),
    }))
    if (!payloads.length) {
      return NextResponse.json({
        error: `找不到官網完全同名分類：${unresolved.map(row => row.name).join('、') || '未設定官網分類'}`,
      }, { status: 422 })
    }

    const batches: WordPressCategoryFilter[][] = []
    for (let index = 0; index < payloads.length; index += 80) batches.push(payloads.slice(index, index + 80))
    const synced = []
    for (const batch of batches) synced.push(await syncWordPressFilterSets(batch))
    console.info('[wordpress/filter-sets/sync] completed', {
      categoryId,
      groupCount: groupIds.length,
      categoryCount: payloads.length,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({
      ok: true,
      categories: payloads.length,
      filters: synced.reduce((sum, row) => sum + Number(row.filters ?? 0), 0),
      trashed: synced.reduce((sum, row) => sum + Number(row.trashed ?? 0), 0),
      unresolved,
      warnings: synced.flatMap(row => Array.isArray(row.warnings) ? row.warnings : []),
      snippet: synced[0]?.snippet ?? null,
    })
  } catch (error: any) {
    console.error('[wordpress/filter-sets/sync] failed', {
      categoryId,
      groupCount: groupIds.length,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: error?.message ?? '官網篩選器同步失敗' }, { status: 500 })
  }
}
