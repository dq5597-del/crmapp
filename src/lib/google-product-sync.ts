import crypto from 'crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { matchKeys, parseRow } from '@/lib/product-import'
import { withProductDescriptionImages } from '@/lib/product-photo-import'
import {
  isConfiguredWordPressMediaUrl,
  uploadWordPressMedia,
  type WordPressImagePreset,
} from '@/lib/wordpress-media'

export const GOOGLE_SYNC_HEADERS = [
  'CRM產品ID',
  'CRM更新時間',
  '同步狀態',
  '最後同步時間',
  '同步訊息',
] as const

export interface GoogleSheetSyncRow {
  rowNo: number
  values: Record<string, unknown>
}

export interface GoogleSheetSyncResult {
  rowNo: number
  ok: boolean
  action: 'insert' | 'update' | 'skip' | 'conflict' | 'error'
  id?: string
  updatedAt?: string
  status: '已同步' | '衝突' | '錯誤' | '已略過'
  message: string
}

// 專案未產生 Supabase Database 泛型；沿用既有 API 路由的動態 client 型別，
// 避免 SDK 在未知 schema 下把 insert/select 推導成 never。
type SupabaseAdmin = any

function adminClient(): SupabaseAdmin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY 尚未設定')
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function verifyGoogleProductSync(secret: string, sheetId: string): string | null {
  const expectedSecret = process.env.GOOGLE_PRODUCT_SYNC_SECRET ?? ''
  const expectedSheetId = process.env.GOOGLE_PRODUCT_SHEET_ID ?? ''
  if (!expectedSecret || !expectedSheetId) return 'Google 產品同步尚未完成環境設定'
  const secretMatches = safeEqual(secret, expectedSecret)
  const sheetIdMatches = safeEqual(sheetId, expectedSheetId)
  if (!secretMatches || !sheetIdMatches) {
    console.warn('[google-product-sync] rejected credentials', {
      secretMatches,
      sheetIdMatches,
      receivedSecretLength: secret.length,
      expectedSecretLength: expectedSecret.length,
      receivedSheetIdLength: sheetId.length,
      expectedSheetIdLength: expectedSheetId.length,
    })
    return 'unauthorized'
  }
  return null
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function normalized(value: unknown): string {
  return text(value).normalize('NFKC').toLocaleUpperCase('en-US')
}

function filterKey(value: unknown): string {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function sameInstant(left: unknown, right: unknown): boolean {
  const a = Date.parse(text(left))
  const b = Date.parse(text(right))
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1000
}

async function loadProductIndex(supabase: SupabaseAdmin) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select('id,model,web_sku,updated_at')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  const byId = new Map<string, any>()
  const byModel = new Map<string, any>()
  const bySku = new Map<string, any>()
  for (const row of rows) {
    byId.set(row.id, row)
    const keys = matchKeys(row)
    if (keys.model) byModel.set(keys.model, row)
    if (keys.sku) bySku.set(keys.sku, row)
  }
  return { byId, byModel, bySku }
}

async function loadFilterCatalog(supabase: SupabaseAdmin) {
  const [{ data: groups, error: groupError }, { data: options, error: optionError }] = await Promise.all([
    supabase.from('product_filter_groups').select('id,name,slug,input_type').eq('is_active', true),
    supabase.from('product_filter_options').select('id,group_id,name,slug,aliases').eq('is_active', true),
  ])
  if (groupError) throw new Error(groupError.message)
  if (optionError) throw new Error(optionError.message)

  const groupsBySlug = new Map<string, any>()
  const nameBuckets = new Map<string, any[]>()
  for (const group of groups ?? []) {
    groupsBySlug.set(filterKey(group.slug), group)
    const key = filterKey(group.name)
    nameBuckets.set(key, [...(nameBuckets.get(key) ?? []), group])
  }
  const groupsByName = new Map<string, any>()
  nameBuckets.forEach((bucket, key) => {
    if (bucket.length === 1) groupsByName.set(key, bucket[0])
  })
  const optionsByGroup = new Map<string, any[]>()
  for (const option of options ?? []) {
    optionsByGroup.set(option.group_id, [...(optionsByGroup.get(option.group_id) ?? []), option])
  }
  return { groupsBySlug, groupsByName, optionsByGroup }
}

async function resolveCategory(
  supabase: SupabaseAdmin,
  cache: Map<string, string>,
  main: string,
  sub: string,
): Promise<string | null> {
  if (!main || !sub) return null
  const key = `${main}||${sub}`
  const cached = cache.get(key)
  if (cached) return cached

  const { data: found, error: findError } = await supabase
    .from('product_categories')
    .select('id')
    .eq('main_category', main)
    .eq('sub_category', sub)
    .maybeSingle()
  if (findError) throw new Error(findError.message)
  if (found?.id) {
    cache.set(key, found.id)
    return found.id
  }

  const { data: created, error } = await supabase
    .from('product_categories')
    .insert({ main_category: main, sub_category: sub })
    .select('id')
    .single()
  if (error) throw new Error(`建立分類「${main} > ${sub}」失敗：${error.message}`)
  cache.set(key, created.id)
  return created.id
}

function resolveExisting(
  values: Record<string, unknown>,
  parsed: ReturnType<typeof parseRow>,
  index: Awaited<ReturnType<typeof loadProductIndex>>,
): { product: any | null; error?: string } {
  const id = text(values['CRM產品ID'])
  if (id) {
    const product = index.byId.get(id)
    return product ? { product } : { product: null, error: `找不到 CRM產品ID：${id}` }
  }

  const keys = matchKeys(parsed.product)
  const modelMatch = keys.model ? index.byModel.get(keys.model) : null
  const skuMatch = keys.sku ? index.bySku.get(keys.sku) : null
  if (modelMatch && skuMatch && modelMatch.id !== skuMatch.id) {
    return { product: null, error: '型號與官網 SKU 分別對應到不同產品，請先在 CRM 修正' }
  }
  return { product: modelMatch ?? skuMatch ?? null }
}

export async function pushGoogleProductRows(rows: GoogleSheetSyncRow[]): Promise<GoogleSheetSyncResult[]> {
  if (!Array.isArray(rows) || rows.length === 0) return []
  if (rows.length > 100) throw new Error('單次最多同步 100 筆產品')

  const supabase = adminClient()
  const [index, filterCatalog, categoryRows] = await Promise.all([
    loadProductIndex(supabase),
    loadFilterCatalog(supabase),
    supabase.from('product_categories').select('id,main_category,sub_category'),
  ])
  if (categoryRows.error) throw new Error(categoryRows.error.message)
  const categoryCache = new Map<string, string>()
  for (const category of categoryRows.data ?? []) {
    categoryCache.set(`${category.main_category}||${category.sub_category}`, category.id)
  }

  const results: GoogleSheetSyncResult[] = []
  const imageCache = new Map<string, string>()

  for (const item of rows) {
    const rowNo = Number(item.rowNo)
    const values = item.values ?? {}
    const hasProductData = Object.entries(values).some(([header, value]) =>
      !GOOGLE_SYNC_HEADERS.includes(header as any) && text(value) !== '',
    )
    if (!hasProductData) {
      results.push({ rowNo, ok: true, action: 'skip', status: '已略過', message: '空白資料列' })
      continue
    }

    const parsed = parseRow(rowNo, values)
    if (parsed.errors.length) {
      results.push({ rowNo, ok: false, action: 'error', status: '錯誤', message: parsed.errors.join('；') })
      continue
    }

    const match = resolveExisting(values, parsed, index)
    if (match.error) {
      results.push({ rowNo, ok: false, action: 'error', status: '錯誤', message: match.error })
      continue
    }
    const existing = match.product
    const sheetId = text(values['CRM產品ID'])
    const sheetVersion = text(values['CRM更新時間'])
    if (existing && (!sheetId || !sheetVersion)) {
      results.push({
        rowNo,
        ok: false,
        action: 'conflict',
        id: existing.id,
        updatedAt: existing.updated_at,
        status: '衝突',
        message: 'CRM 已有相同型號或 SKU；請先執行「從 CRM 更新試算表」再修改',
      })
      continue
    }
    if (existing && !sameInstant(sheetVersion, existing.updated_at)) {
      results.push({
        rowNo,
        ok: false,
        action: 'conflict',
        id: existing.id,
        updatedAt: existing.updated_at,
        status: '衝突',
        message: 'CRM 產品已被其他人更新；請先重新拉取資料',
      })
      continue
    }

    try {
      const imageWarnings: string[] = []
      const payload: Record<string, any> = { ...parsed.product }
      const main = text(payload.main_category)
      const sub = text(payload.sub_category)
      delete payload.main_category
      delete payload.sub_category

      if (typeof payload.web_category === 'string') {
        const categories = payload.web_category.split(/[,，;；]/).map((v: string) => v.trim()).filter(Boolean)
        payload.web_categories = Array.from(new Set(categories))
        payload.web_category = categories[0] ?? null
      } else if ('官網分類' in values) {
        payload.web_categories = []
        payload.web_category = null
      }

      if ('主圖網址' in values) {
        payload.web_main_image_url = parsed.main_image_url
          ? await transferProductImage(parsed.main_image_url, imageCache, imageWarnings)
          : null
      }
      const syncedImageUrls: string[] = []
      for (const imageUrl of parsed.image_urls) {
        syncedImageUrls.push(await transferProductImage(imageUrl, imageCache, imageWarnings))
      }
      const descriptionImageUrls = text(values['產品介紹圖片'])
        .split(/[|｜\n]/)
        .map(value => value.trim())
        .filter(Boolean)
      if (descriptionImageUrls.length) {
        const invalidUrl = descriptionImageUrls.find(url => !/^https?:\/\//i.test(url))
        if (invalidUrl) throw new Error(`產品介紹圖片網址須為 http(s) 開頭：${invalidUrl}`)
        const uploadedDescriptionUrls: string[] = []
        for (const imageUrl of descriptionImageUrls) {
          uploadedDescriptionUrls.push(await transferProductImage(imageUrl, imageCache, imageWarnings, 'content'))
        }
        payload.web_description = withProductDescriptionImages(
          payload.web_description ?? '',
          uploadedDescriptionUrls,
          payload.product_name,
        )
      }
      payload.category_id = main && sub
        ? await resolveCategory(supabase, categoryCache, main, sub)
        : null

      const filterAssignments: { option_id: string }[] = []
      const filterNumbers: { group_id: string; numeric_value: number }[] = []
      const filterErrors: string[] = []
      for (const spec of parsed.filter_specs) {
        const key = filterKey(spec.group)
        const group = filterCatalog.groupsBySlug.get(key) ?? filterCatalog.groupsByName.get(key)
        if (!group) {
          filterErrors.push(`找不到或無法唯一辨識篩選規格「${spec.group}」`)
          continue
        }
        if (group.input_type === 'number') {
          const numeric = Number(String(spec.values[0] ?? '').replace(/[^0-9.+-]/g, ''))
          if (!Number.isFinite(numeric)) filterErrors.push(`「${group.name}」不是有效數字`)
          else filterNumbers.push({ group_id: group.id, numeric_value: numeric })
          continue
        }
        const candidates = filterCatalog.optionsByGroup.get(group.id) ?? []
        for (const value of spec.values) {
          const wanted = filterKey(value)
          const option = candidates.find(candidate =>
            [candidate.name, candidate.slug, ...(candidate.aliases ?? [])].some(alias => filterKey(alias) === wanted),
          )
          if (!option) filterErrors.push(`「${group.name}」沒有選項「${value}」`)
          else filterAssignments.push({ option_id: option.id })
        }
      }
      if (filterErrors.length) throw new Error(filterErrors.join('；'))

      let productId = existing?.id as string | undefined
      let action: 'insert' | 'update'
      if (productId) {
        action = 'update'
        delete payload.stock_qty
        const { error } = await supabase.from('products').update(payload).eq('id', productId)
        if (error) throw new Error(error.message)
      } else {
        action = 'insert'
        const { data, error } = await supabase.from('products').insert(payload).select('id').single()
        if (error) throw new Error(error.message)
        productId = data.id
      }

      const childWarnings: string[] = []
      const features = parsed.features.map((feature, sort_order) => ({
        product_id: productId,
        feature_text: feature,
        sort_order,
      }))
      const images = syncedImageUrls.map((image_url, sort_order) => ({
        product_id: productId,
        image_url,
        sort_order,
      }))

      const deletes = await Promise.all([
        supabase.from('product_features').delete().eq('product_id', productId),
        supabase.from('product_images').delete().eq('product_id', productId),
        supabase.from('product_filter_assignments').delete().eq('product_id', productId),
        supabase.from('product_filter_numbers').delete().eq('product_id', productId),
      ])
      deletes.forEach(result => { if (result.error) childWarnings.push(result.error.message) })

      const inserts = await Promise.all([
        features.length ? supabase.from('product_features').insert(features) : Promise.resolve({ error: null }),
        images.length ? supabase.from('product_images').insert(images) : Promise.resolve({ error: null }),
        filterAssignments.length
          ? supabase.from('product_filter_assignments').insert(
              Array.from(new Map(filterAssignments.map(row => [row.option_id, { product_id: productId, ...row }])).values()),
            )
          : Promise.resolve({ error: null }),
        filterNumbers.length
          ? supabase.from('product_filter_numbers').insert(
              Array.from(new Map(filterNumbers.map(row => [row.group_id, { product_id: productId, ...row }])).values()),
            )
          : Promise.resolve({ error: null }),
      ])
      inserts.forEach(result => { if (result.error) childWarnings.push(result.error.message) })

      const { data: saved, error: savedError } = await supabase
        .from('products')
        .select('id,model,web_sku,updated_at')
        .eq('id', productId)
        .single()
      if (savedError) throw new Error(savedError.message)

      index.byId.set(saved.id, saved)
      const keys = matchKeys(saved)
      if (keys.model) index.byModel.set(keys.model, saved)
      if (keys.sku) index.bySku.set(keys.sku, saved)

      const warningText = [...parsed.warnings, ...imageWarnings, ...childWarnings].filter(Boolean).join('；')
      results.push({
        rowNo,
        ok: true,
        action,
        id: saved.id,
        updatedAt: saved.updated_at,
        status: '已同步',
        message: warningText || (action === 'insert' ? '已新增至 CRM' : '已更新 CRM'),
      })
    } catch (error: any) {
      results.push({
        rowNo,
        ok: false,
        action: 'error',
        id: existing?.id,
        updatedAt: existing?.updated_at,
        status: '錯誤',
        message: error?.message ?? '同步失敗',
      })
    }
  }

  return results
}

async function transferProductImage(
  url: string,
  cache: Map<string, string>,
  warnings: string[],
  preset: WordPressImagePreset = 'product',
): Promise<string> {
  const normalizedUrl = url.trim()
  const cacheKey = `${preset}:${normalizedUrl}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  if (isConfiguredWordPressMediaUrl(normalizedUrl)) {
    cache.set(cacheKey, normalizedUrl)
    return normalizedUrl
  }

  try {
    const response = await fetch(normalizedUrl, { redirect: 'follow', cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!mimeType.startsWith('image/')) throw new Error(`不是圖片（${mimeType || '未知類型'}）`)
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > 10 * 1024 * 1024) throw new Error('圖片超過 10MB')
    const originalName = decodeURIComponent(normalizedUrl.split('/').pop() ?? 'product-image').split('?')[0]
    const fileName = /\.[a-z0-9]{2,5}$/i.test(originalName) ? originalName : `${originalName || 'product-image'}.jpg`
    const uploaded = await uploadWordPressMedia({
      data,
      mimeType,
      fileName: `${Date.now()}-${fileName}`,
      altText: fileName.replace(/\.[^.]+$/, ''),
      preset,
    })
    cache.set(cacheKey, uploaded.url)
    return uploaded.url
  } catch (error: any) {
    warnings.push(`圖片轉 WebP 失敗（${normalizedUrl}）：${error?.message ?? '未知錯誤'}，暫時沿用原網址`)
    cache.set(cacheKey, normalizedUrl)
    return normalizedUrl
  }
}

async function readAllProducts(supabase: SupabaseAdmin): Promise<any[]> {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('*').order('created_at').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  return rows
}

async function readChildRows(supabase: SupabaseAdmin, table: string, columns: string, ids: string[]) {
  const rows: any[] = []
  for (let start = 0; start < ids.length; start += 200) {
    const { data, error } = await supabase.from(table).select(columns).in('product_id', ids.slice(start, start + 200))
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
  }
  return rows
}

function yesNo(value: unknown): string {
  return value ? '是' : '否'
}

export async function pullGoogleProductRows(): Promise<Array<{ id: string; updatedAt: string; values: Record<string, unknown> }>> {
  const supabase = adminClient()
  const products = await readAllProducts(supabase)
  const ids = products.map(product => product.id)

  const categoryIds = Array.from(new Set(products.map(product => product.category_id).filter(Boolean)))
  const [{ data: categories, error: categoryError }, features, images, assignments, numbers, filterCatalog] = await Promise.all([
    categoryIds.length
      ? supabase.from('product_categories').select('id,main_category,sub_category').in('id', categoryIds)
      : Promise.resolve({ data: [], error: null }),
    readChildRows(supabase, 'product_features', 'product_id,feature_text,sort_order', ids),
    readChildRows(supabase, 'product_images', 'product_id,image_url,sort_order', ids),
    readChildRows(supabase, 'product_filter_assignments', 'product_id,option_id', ids),
    readChildRows(supabase, 'product_filter_numbers', 'product_id,group_id,numeric_value', ids),
    loadFilterCatalog(supabase),
  ])
  if (categoryError) throw new Error(categoryError.message)

  const categoryById = new Map<string, any>(
    (categories ?? []).map((category: any) => [category.id, category] as const),
  )
  const featureMap = new Map<string, any[]>()
  for (const row of features) featureMap.set(row.product_id, [...(featureMap.get(row.product_id) ?? []), row])
  const imageMap = new Map<string, any[]>()
  for (const row of images) imageMap.set(row.product_id, [...(imageMap.get(row.product_id) ?? []), row])

  const optionById = new Map<string, any>()
  filterCatalog.optionsByGroup.forEach(options => options.forEach(option => optionById.set(option.id, option)))
  const groupById = new Map<string, any>()
  filterCatalog.groupsBySlug.forEach(group => groupById.set(group.id, group))
  const filterMap = new Map<string, Map<string, string[]>>()
  for (const row of assignments) {
    const option = optionById.get(row.option_id)
    const group = option ? groupById.get(option.group_id) : null
    if (!option || !group) continue
    const productGroups = filterMap.get(row.product_id) ?? new Map<string, string[]>()
    productGroups.set(group.slug, [...(productGroups.get(group.slug) ?? []), option.name])
    filterMap.set(row.product_id, productGroups)
  }
  for (const row of numbers) {
    const group = groupById.get(row.group_id)
    if (!group) continue
    const productGroups = filterMap.get(row.product_id) ?? new Map<string, string[]>()
    productGroups.set(group.slug, [String(row.numeric_value)])
    filterMap.set(row.product_id, productGroups)
  }

  return products.map(product => {
    const category = categoryById.get(product.category_id)
    const productFeatures = (featureMap.get(product.id) ?? []).sort((a, b) => a.sort_order - b.sort_order)
    const productImages = (imageMap.get(product.id) ?? []).sort((a, b) => a.sort_order - b.sort_order)
    const filterGroups = filterMap.get(product.id) ?? new Map<string, string[]>()
    const filterText = Array.from(filterGroups.entries()).map(([group, values]) => `${group}=${values.join(',')}`).join('｜')
    const webCategories = Array.isArray(product.web_categories) && product.web_categories.length
      ? product.web_categories
      : product.web_category ? [product.web_category] : []

    return {
      id: product.id,
      updatedAt: product.updated_at,
      values: {
        '品牌': product.brand ?? '',
        '產品名稱': product.product_name ?? '',
        '型號': product.model ?? '',
        '主分類': category?.main_category ?? '',
        '次分類': category?.sub_category ?? '',
        '單位': product.unit ?? '台',
        '建議售價': product.list_price ?? 0,
        '成本': product.cost_price ?? 0,
        '寬cm': product.width_cm ?? '',
        '深cm': product.depth_cm ?? '',
        '高cm': product.height_cm ?? '',
        '備註': product.notes ?? '',
        '啟用': yesNo(product.is_active),
        '官網SKU': product.web_sku ?? '',
        '官網分類': webCategories.join(','),
        '官網售價': product.web_sale_price ?? '',
        '官網產品介紹': product.web_description ?? '',
        '系列代碼': product.variant_group_code ?? '',
        '變體屬性': product.variant_attribute_name ?? '',
        '變體選項': product.variant_value ?? '',
        '系列主商品': yesNo(product.variant_is_primary),
        '規格HTML': product.web_spec_html ?? '',
        'BSMI字號': product.web_bsmi_no ?? '',
        'NCC字號': product.web_ncc_no ?? '',
        '上架': yesNo(product.web_publish),
        '產品特色': productFeatures.map(row => row.feature_text).join('|'),
        '篩選規格': filterText,
        '主圖網址': product.web_main_image_url ?? '',
        '其他圖片網址': productImages.map(row => row.image_url).join('|'),
        '主圖圖片': '',
        '其他圖片': '',
        '產品介紹圖片': '',
        'CRM產品ID': product.id,
        'CRM更新時間': product.updated_at,
        '同步狀態': '已同步',
        '最後同步時間': new Date().toISOString(),
        '同步訊息': '已從 CRM 更新',
      },
    }
  })
}
