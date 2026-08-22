import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  buildWooPayload,
  buildWooVariablePayload,
  buildWooVariationPayload,
  validateForWeb,
  type CrmProductRow,
  type CrmSubData,
} from '@/lib/web-product-mapper'
import { websiteCategoryLeaf } from '@/lib/catalog-drive'
import { ensureWordPressProductDownloadsSnippet } from '@/lib/wordpress-product-downloads-publisher'
import { WooFilterSync } from '@/lib/woocommerce-filter-sync'

/**
 * POST /api/woocommerce/push
 * body: { product_ids: string[], publish?: boolean }
 *
 * 把 CRM 產品推到 av-shop.com（WooCommerce REST API v3）。
 * 已推過的（有 web_product_id）→ 更新（不覆蓋官網的發佈狀態）；沒推過的 → 新建為草稿。
 * 商品會帶 av_source=crm，出現在 WP 後台「商品 → CRM 待審」清單。
 *
 * 欄位對應集中在 src/lib/web-product-mapper.ts：
 *   product_features  → feature_1~10（特色標章）+ av_feature_item_1~8（產品特色列表）
 *   web_spec_html     → av_tab_specs（詳細規格分頁）
 *   catalog/manual/CAD→ av_download_*（檔案下載分頁）
 *
 * 需要的環境變數（設在 Vercel，勿寫進程式碼）：
 *   WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET
 */

function wcAuthHeader() {
  const k = process.env.WC_CONSUMER_KEY
  const s = process.env.WC_CONSUMER_SECRET
  if (!k || !s) return null
  return 'Basic ' + Buffer.from(`${k}:${s}`).toString('base64')
}

function storeBase() {
  return (process.env.WC_STORE_URL ?? '').replace(/\/$/, '')
}

/** 依分類名稱找官網分類 ID（找不到回 null，不自動新增分類） */
async function findCategoryId(name: string, auth: string): Promise<number | null> {
  if (!name?.trim()) return null
  try {
    const res = await fetch(
      `${storeBase()}/wp-json/wc/v3/products/categories?search=${encodeURIComponent(name.trim())}&per_page=20`,
      { headers: { Authorization: auth }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list) || list.length === 0) return null
    const exact = list.find((c: any) => c.name?.trim() === name.trim())
    return (exact ?? list[0]).id ?? null
  } catch {
    return null
  }
}

/** 取得官網分類 ID；若官網尚無此分類，建立後回傳新 ID。 */
async function findOrCreateCategoryId(name: string, auth: string): Promise<number | null> {
  const existingId = await findCategoryId(name, auth)
  if (existingId) return existingId
  try {
    const res = await fetch(`${storeBase()}/wp-json/wc/v3/products/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (!res.ok) return null
    const category = await res.json()
    return category?.id ?? null
  } catch {
    return null
  }
}

type WooBrand = { id: number; name: string }

function normalizeBrandName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

/**
 * 將 CRM 品牌對應至 WooCommerce 內建 product_brand taxonomy。
 * 僅接受正規化後完全相同的品牌名稱，避免模糊搜尋誤綁其他品牌。
 */
async function findBrandId(name: string, auth: string): Promise<number | null> {
  const wanted = normalizeBrandName(name)
  if (!wanted) return null

  const res = await fetch(
    `${storeBase()}/wp-json/wc/v3/products/brands?search=${encodeURIComponent(name.trim())}&per_page=100`,
    { headers: { Authorization: auth }, cache: 'no-store' }
  )
  if (!res.ok) {
    throw new Error(`讀取官網品牌失敗（HTTP ${res.status}）`)
  }

  const list = await res.json() as WooBrand[]
  const exact = Array.isArray(list)
    ? list.find(brand => Number.isFinite(brand.id) && normalizeBrandName(brand.name ?? '') === wanted)
    : null
  return exact?.id ?? null
}

async function findOrCreateBrandId(
  name: string,
  auth: string,
  cache: Map<string, number>
): Promise<number | null> {
  const displayName = name.normalize('NFKC').trim().replace(/\s+/g, ' ')
  const key = normalizeBrandName(displayName)
  if (!key) return null

  const cached = cache.get(key)
  if (cached) return cached

  const existingId = await findBrandId(displayName, auth)
  if (existingId) {
    cache.set(key, existingId)
    return existingId
  }

  const res = await fetch(`${storeBase()}/wp-json/wc/v3/products/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ name: displayName }),
  })
  const data = await res.json().catch(() => null)

  if (res.ok && Number.isFinite(data?.id)) {
    cache.set(key, data.id)
    return data.id
  }

  // 併發推送同一新品牌時，另一個請求可能已先建立 term。
  const conflictId = Number(data?.data?.resource_id)
  if (data?.code === 'term_exists' && Number.isFinite(conflictId) && conflictId > 0) {
    cache.set(key, conflictId)
    return conflictId
  }

  const recoveredId = await findBrandId(displayName, auth)
  if (recoveredId) {
    cache.set(key, recoveredId)
    return recoveredId
  }

  throw new Error(data?.message ?? `建立官網品牌失敗（HTTP ${res.status}）`)
}

export async function POST(req: Request) {
  const auth = wcAuthHeader()
  const store = storeBase()
  if (!auth || !store) {
    return NextResponse.json({
      error: '尚未設定官網 API 金鑰。請在 Vercel 環境變數加入 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET 後重新部署。',
    }, { status: 500 })
  }
  const authHeader = auth

  const { product_ids, publish } = await req.json()
  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return NextResponse.json({ error: '沒有選擇要推送的產品' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const results: any[] = []
  const brandIdCache = new Map<string, number>()
  const filterSync = new WooFilterSync(supabase, store, authHeader)
  let downloadTab: any = null
  try {
    downloadTab = await ensureWordPressProductDownloadsSnippet()
  } catch (error: any) {
    downloadTab = { error: error?.message ?? '官網產品資料下載片段安裝失敗' }
  }

  async function loadSubData(productId: string): Promise<CrmSubData> {
    const [{ data: feats }, { data: imgs }, { data: dls }] = await Promise.all([
      supabase.from('product_features').select('feature_text, sort_order').eq('product_id', productId).order('sort_order'),
      supabase.from('product_images').select('image_url, sort_order').eq('product_id', productId).order('sort_order'),
      supabase.from('product_downloads').select('file_name, file_url, sort_order').eq('product_id', productId).order('sort_order'),
    ])
    return { features: (feats ?? []) as any, images: (imgs ?? []) as any, downloads: (dls ?? []) as any }
  }

  async function resolveCategories(row: CrmProductRow) {
    const names = Array.from(new Set(
      (row.web_categories?.length ? row.web_categories : [row.web_category ?? ''])
        .map(name => websiteCategoryLeaf(name)).map(name => name.trim()).filter(Boolean)
    ))
    const resolved = await Promise.all(names.map(async name => ({ name, id: await findOrCreateCategoryId(name, authHeader) })))
    return { resolved, ids: resolved.flatMap(category => category.id ? [category.id] : []) }
  }

  async function attachBrand(payload: any, row: CrmProductRow) {
    const brandName = row.brand?.trim() ?? ''
    const brandId = await findOrCreateBrandId(brandName, authHeader, brandIdCache)
    if (brandId) payload.brands = [{ id: brandId }]
    return { brandId, brandName }
  }

  async function sendWoo(url: string, method: 'POST' | 'PUT', payload: any) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => null)
    return { response, data }
  }

  const { data: requestedRows } = await supabase.from('products').select('*').in('id', product_ids)
  const requestedMap = new Map((requestedRows ?? []).map(row => [row.id, row as CrmProductRow]))
  const processedGroups = new Set<string>()

  for (const id of product_ids) {
    const row = requestedMap.get(id)
    if (!row) { results.push({ id, ok: false, error: '找不到產品' }); continue }
    const groupCode = row.variant_group_code?.trim() ?? ''

    if (groupCode) {
      const groupKey = groupCode.toLocaleLowerCase('en-US')
      if (processedGroups.has(groupKey)) continue
      processedGroups.add(groupKey)

      const { data: memberData, error: memberError } = await supabase
        .from('products').select('*').eq('variant_group_code', groupCode).order('product_name')
      const members = (memberData ?? []) as CrmProductRow[]
      const failGroup = (error: string) => {
        for (const member of members.length ? members : [row]) {
          if (results.some(result => result.group === groupCode && result.id === member.id)) continue
          results.push({ id: member.id, name: member.product_name, group: groupCode, ok: false, error })
        }
      }
      if (memberError) { failGroup(`讀取系列失敗：${memberError.message}`); continue }
      if (members.length < 2) { failGroup(`系列「${groupCode}」至少需要 2 個不同選項`); continue }

      const primaries = members.filter(member => member.variant_is_primary)
      if (primaries.length !== 1) {
        failGroup(`系列「${groupCode}」必須且只能指定 1 筆「系列主商品」，目前為 ${primaries.length} 筆`)
        continue
      }
      const primary = primaries[0]
      const attributeNames = Array.from(new Set(members.map(member => (member.variant_attribute_name ?? '顏色').trim()).filter(Boolean)))
      const options = members.map(member => member.variant_value?.trim() ?? '')
      if (attributeNames.length !== 1) { failGroup(`系列「${groupCode}」的變體屬性必須一致`); continue }
      if (options.some(option => !option)) { failGroup(`系列「${groupCode}」每個 SKU 都必須填寫變體選項`); continue }
      if (new Set(options.map(option => option.toLocaleLowerCase('en-US'))).size !== options.length) {
        failGroup(`系列「${groupCode}」有重複的變體選項`); continue
      }
      const missingSkus = members.filter(member => !((member.web_sku || member.model) ?? '').trim())
      if (missingSkus.length) { failGroup(`系列內每個商品都必須有 SKU／型號：${missingSkus.map(member => member.product_name).join('、')}`); continue }

      // 若舊資料已分別同步成多個 Woo 單品，禁止自動合併，避免破壞既有網址與訂單關聯。
      const parentIds = Array.from(new Set(members.map(member => member.web_product_id?.trim()).filter(Boolean)))
      if (parentIds.length > 1) {
        failGroup(`系列內偵測到 ${parentIds.length} 個既有官網商品 ID，請先人工決定保留哪一個父商品，系統不會自動刪除或合併`)
        continue
      }

      const primarySub = await loadSubData(primary.id)
      const missing = validateForWeb(primary, primarySub)
      const { resolved, ids: categoryIds } = await resolveCategories(primary)
      const attributeName = attributeNames[0]
      let filterPayload
      let variantAttribute
      try {
        filterPayload = await filterSync.prepareProductFilters([
          primary.id,
          ...members.filter(member => member.id !== primary.id).map(member => member.id),
        ])
        variantAttribute = await filterSync.prepareVariantAttribute(attributeName, options)
      } catch (error: any) {
        failGroup(`官網篩選屬性同步失敗：${error?.message ?? '未知錯誤'}`)
        continue
      }
      const parentPayload: any = buildWooVariablePayload(
        primary, primarySub, categoryIds, attributeName, options,
        { status: publish ? 'publish' : 'draft' }
      )
      parentPayload.attributes = [
        ...filterPayload.attributes.filter(attribute => attribute.id !== variantAttribute.id),
        variantAttribute,
      ]
      parentPayload.meta_data.push(...filterPayload.metaData)
      parentPayload.manage_stock = false
      parentPayload.stock_quantity = null
      let brandId: number | null = null
      let brandName = primary.brand?.trim() ?? ''
      try {
        const brand = await attachBrand(parentPayload, primary)
        brandId = brand.brandId
        brandName = brand.brandName
      } catch (error: any) {
        failGroup(error?.message ?? '官網品牌同步失敗')
        continue
      }

      const existingParentId = parentIds[0] ?? null
      if (existingParentId) { delete parentPayload.status; delete parentPayload.slug }
      try {
        const parentResult = await sendWoo(
          existingParentId
            ? `${store}/wp-json/wc/v3/products/${existingParentId}`
            : `${store}/wp-json/wc/v3/products`,
          existingParentId ? 'PUT' : 'POST',
          parentPayload
        )
        if (!parentResult.response.ok) {
          if (parentResult.response.status === 404 && existingParentId) {
            await supabase.from('products').update({ web_product_id: null, web_product_url: null, web_variation_id: null }).eq('variant_group_code', groupCode)
          }
          failGroup(parentResult.data?.message ?? `父商品同步失敗（HTTP ${parentResult.response.status}）`)
          continue
        }

        const parent = parentResult.data
        for (const member of members) {
          const memberSub = member.id === primary.id ? primarySub : await loadSubData(member.id)
          const variationPayload = buildWooVariationPayload(member, attributeName, memberSub)
          variationPayload.attributes = [{
            id: variantAttribute.id,
            name: variantAttribute.name,
            option: member.variant_value?.trim() ?? '',
          }]
          const existingVariationId = member.web_variation_id?.trim() || null
          let variationResult = await sendWoo(
            existingVariationId
              ? `${store}/wp-json/wc/v3/products/${parent.id}/variations/${existingVariationId}`
              : `${store}/wp-json/wc/v3/products/${parent.id}/variations`,
            existingVariationId ? 'PUT' : 'POST',
            variationPayload
          )
          // 官網變體已被人工刪除時，直接重建，不必讓使用者再推送一次。
          if (variationResult.response.status === 404 && existingVariationId) {
            variationResult = await sendWoo(
              `${store}/wp-json/wc/v3/products/${parent.id}/variations`, 'POST', variationPayload
            )
          }
          if (!variationResult.response.ok) {
            results.push({
              id: member.id, name: member.product_name, group: groupCode, ok: false,
              error: variationResult.data?.message ?? `變體同步失敗（HTTP ${variationResult.response.status}）`,
            })
            continue
          }
          const variation = variationResult.data
          const syncedAt = new Date().toISOString()
          const { error: updateError } = await supabase.from('products').update({
            web_product_id: String(parent.id),
            web_variation_id: String(variation.id),
            web_product_url: parent.permalink ?? null,
            web_synced_at: syncedAt,
            web_sync_status: parent.status ?? null,
          }).eq('id', member.id)
          if (updateError) {
            results.push({
              id: member.id, name: member.product_name, group: groupCode, ok: false,
              error: `官網變體已建立（ID ${variation.id}），但 CRM 回寫失敗：${updateError.message}`,
            })
            continue
          }
          results.push({
            id: member.id,
            name: member.product_name,
            group: groupCode,
            variant: member.variant_value,
            ok: true,
            wc_id: parent.id,
            variation_id: variation.id,
            url: parent.permalink,
            status: parent.status,
            action: existingVariationId ? '已更新變體' : '已建立變體',
            missing: member.id === primary.id ? missing : [],
            category_matched: resolved.every(category => !!category.id),
            brand_matched: !!brandId,
            brand_id: brandId,
            brand_name: brandName || null,
          })
        }
      } catch (error: any) {
        failGroup(error?.message ?? '系列同步連線失敗')
      }
      continue
    }

    const sub = await loadSubData(id)
    const missing = validateForWeb(row, sub)
    const { resolved, ids: categoryIds } = await resolveCategories(row)
    const payload: any = buildWooPayload(row, sub, categoryIds, { status: publish ? 'publish' : 'draft' })
    try {
      const filterPayload = await filterSync.prepareProductFilters([id])
      if (filterPayload.attributes.length) payload.attributes = filterPayload.attributes
      payload.meta_data.push(...filterPayload.metaData)
    } catch (error: any) {
      results.push({ id, name: row.product_name, ok: false, error: `官網篩選屬性同步失敗：${error?.message ?? '未知錯誤'}` })
      continue
    }
    let brandId: number | null = null
    let brandName = row.brand?.trim() ?? ''
    try {
      const brand = await attachBrand(payload, row)
      brandId = brand.brandId
      brandName = brand.brandName
    } catch (error: any) {
      results.push({ id, name: row.product_name, ok: false, error: error?.message ?? '官網品牌同步失敗' })
      continue
    }
    payload.manage_stock = true
    payload.stock_quantity = Number(row.stock_qty ?? 0)
    const wcId = row.web_product_id
    if (wcId) { delete payload.status; delete payload.slug }
    try {
      const { response, data } = await sendWoo(
        wcId ? `${store}/wp-json/wc/v3/products/${wcId}` : `${store}/wp-json/wc/v3/products`,
        wcId ? 'PUT' : 'POST', payload
      )
      if (!response.ok) {
        if (response.status === 404 && wcId) {
          await supabase.from('products').update({ web_product_id: null, web_product_url: null }).eq('id', id)
        }
        results.push({ id, name: row.product_name, ok: false, error: data?.message ?? `HTTP ${response.status}` })
        continue
      }
      const { error: updateError } = await supabase.from('products').update({
        web_product_id: String(data.id), web_variation_id: null,
        web_product_url: data.permalink ?? null,
        web_synced_at: new Date().toISOString(), web_sync_status: data.status ?? null,
      }).eq('id', id)
      if (updateError) {
        results.push({ id, name: row.product_name, ok: false, error: `官網商品已同步，但 CRM 回寫失敗：${updateError.message}` })
        continue
      }
      results.push({
        id, name: row.product_name, ok: true, wc_id: data.id, url: data.permalink, status: data.status,
        action: wcId ? '已更新' : '已建立', missing,
        category_matched: resolved.every(category => !!category.id),
        brand_matched: !!brandId, brand_id: brandId, brand_name: brandName || null,
      })
    } catch (error: any) {
      results.push({ id, name: row.product_name, ok: false, error: error?.message ?? '連線失敗' })
    }
  }

  const okCount = results.filter(r => r.ok).length
  return NextResponse.json({ ok: okCount, failed: results.length - okCount, download_tab: downloadTab, results })
}

/** GET /api/woocommerce/push → 測試連線 */
export async function GET() {
  const auth = wcAuthHeader()
  const store = storeBase()
  if (!auth || !store) {
    return NextResponse.json({ connected: false, error: '尚未設定 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET' })
  }
  try {
    const res = await fetch(`${store}/wp-json/wc/v3/products?per_page=1`, {
      headers: { Authorization: auth },
    })
    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json({ connected: false, error: `HTTP ${res.status}：${t.slice(0, 120)}` })
    }
    return NextResponse.json({ connected: true, store })
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e.message })
  }
}
