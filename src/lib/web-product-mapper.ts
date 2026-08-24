/**
 * CRM 產品 → WooCommerce (av-shop.com) 商品 payload 對照
 *
 * 網站端對應（WPCode 片段 10557 / 10558 / 10592 / 10597）：
 *   feature_1~10        → 首頁與相關商品的紅字特色標章（相關商品用 feature_2~4）
 *   av_feature_item_1~8 → 商品頁「產品特色」編號清單
 *   av_download_*       → 檔案下載分頁
 *   av_download_files   → CRM 的完整下載檔清單（JSON）
 *   av_tab_specs        → 詳細規格分頁（留空則用商品屬性自動產生）
 *   av_tab_shipping     → 購物說明分頁（留空則用全站預設）
 *   av_source / av_crm_id → 後台「CRM 待審」清單用
 */

import { wooImageUrl } from './drive-url'

export type CrmProductRow = {
  id: string
  brand: string | null
  product_name: string
  model: string | null
  list_price: number
  catalog_url: string | null
  manual_url: string | null
  notes: string | null
  web_sku?: string | null
  web_category?: string | null
  web_categories?: string[] | null
  web_description?: string | null
  web_main_image_url?: string | null
  web_sale_price?: number | null
  web_allow_backorder?: boolean | null
  web_bsmi_no?: string | null
  web_ncc_no?: string | null
  web_promo_price?: number | null
  web_promo_price_from?: string | null
  web_promo_price_to?: string | null
  web_spec_html?: string | null
  web_product_id?: string | null
  web_variation_id?: string | null
  web_tab?: string | null // 官網首頁區塊：'none' | 'new'(最新商品) | 'hot'(熱銷商品)
  variant_group_code?: string | null
  variant_attribute_name?: string | null
  variant_value?: string | null
  variant_is_primary?: boolean | null
  stock_qty?: number | null
}

export type CrmSubData = {
  images: { image_url: string; sort_order: number }[]
  downloads: { file_name: string; file_url: string; sort_order: number }[]
  features: { feature_text: string; sort_order: number }[]
  purchaseOptions?: {
    name: string
    description: string
    selection_mode: 'single' | 'multiple'
    required: boolean
    options: { label: string; price_adjustment: number; default: boolean }[]
  }[]
}

export type WooPayload = {
  name: string
  slug?: string
  type: 'simple' | 'variable'
  status: 'draft' | 'publish'
  sku?: string
  regular_price?: string
  sale_price?: string
  date_on_sale_from?: string | null
  date_on_sale_to?: string | null
  description?: string
  backorders?: 'no' | 'notify' | 'yes'
  categories?: { id?: number; name?: string }[]
  brands?: { id: number }[]
  images?: { src: string }[]
  tags?: { name: string }[]
  attributes?: { id?: number; name?: string; visible: boolean; variation: boolean; options: string[] }[]
  meta_data: { key: string; value: string }[]
}

export type WooVariationPayload = {
  sku?: string
  regular_price?: string
  sale_price?: string
  date_on_sale_from?: string | null
  date_on_sale_to?: string | null
  manage_stock: boolean
  stock_quantity: number
  backorders: 'no' | 'notify' | 'yes'
  image?: { src: string }
  attributes: { id?: number; name?: string; option: string }[]
  meta_data: { key: string; value: string }[]
}

/**
 * 產生純英數的官網網址代稱（slug）：品牌 + 型號，
 * 避免 WordPress 用中文品名生成網址（中文網址分享時會變一長串亂碼）。
 * 例：YAMAHA + STAGEPAS 1K → yamaha-stagepas-1k
 */
export function makeSlug(p: CrmProductRow): string {
  const raw = `${p.brand ?? ''} ${(p.web_sku || p.model) ?? ''}`
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')   // 非英數（含中文）一律轉 -
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return slug || `product-${p.id.slice(0, 8)}`
}

function metaPush(meta: { key: string; value: string }[], key: string, value: unknown) {
  const v = value === null || value === undefined ? '' : String(value)
  meta.push({ key, value: v })
}

export function buildWooPayload(
  p: CrmProductRow,
  sub: CrmSubData,
  categoryIds: number[],
  opts: { status: 'draft' | 'publish' } = { status: 'draft' }
): WooPayload {
  const features = [...sub.features].sort((a, b) => a.sort_order - b.sort_order).map(f => f.feature_text.trim()).filter(Boolean)
  const images = [...sub.images].sort((a, b) => a.sort_order - b.sort_order).map(i => wooImageUrl(i.image_url)).filter(Boolean)
  const downloads = [...sub.downloads].sort((a, b) => a.sort_order - b.sort_order)

  const mainImage = wooImageUrl(p.web_main_image_url)
  const allImages = [mainImage, ...images].filter(Boolean)
  const uniqueImages = Array.from(new Set(allImages))

  const regular = p.web_sale_price && p.web_sale_price > 0 ? p.web_sale_price : p.list_price
  const promoActive = !!(p.web_promo_price && p.web_promo_price > 0)

  const meta: { key: string; value: string }[] = []

  // 來源標記（後台「CRM 待審」清單靠這個）
  metaPush(meta, 'av_source', 'crm')
  metaPush(meta, 'av_crm_id', p.id)

  // 特色標章 feature_1~10（相關商品區塊顯示 feature_2~4）
  for (let i = 0; i < 10; i++) {
    metaPush(meta, `feature_${i + 1}`, features[i] ?? '')
  }

  // 產品特色列表 av_feature_item_1~8（商品頁上方編號清單）
  for (let i = 0; i < 8; i++) {
    metaPush(meta, `av_feature_item_${i + 1}`, features[i] ?? '')
  }

  // 檔案下載
  const cad = downloads.find(d => /cad|規格書|圖面/i.test(d.file_name))
  metaPush(meta, 'av_download_catalog', p.catalog_url ?? downloads.find(d => /型錄|catalog/i.test(d.file_name))?.file_url ?? '')
  metaPush(meta, 'av_download_manual', p.manual_url ?? downloads.find(d => /說明書|manual/i.test(d.file_name))?.file_url ?? '')
  metaPush(meta, 'av_download_cad', cad?.file_url ?? '')
  const downloadFiles = downloads
    .filter(d => d.file_name.trim() && d.file_url.trim())
    .map(d => ({ name: d.file_name.trim(), url: d.file_url.trim() }))
  if (p.catalog_url && !downloadFiles.some(d => d.url === p.catalog_url)) {
    downloadFiles.unshift({ name: '產品型錄', url: p.catalog_url })
  }
  if (p.manual_url && !downloadFiles.some(d => d.url === p.manual_url)) {
    downloadFiles.push({ name: '使用說明書', url: p.manual_url })
  }
  metaPush(meta, 'av_download_files', JSON.stringify(downloadFiles))

  // 客戶在加入購物車前必須選擇的配件／規格，由官網 CRM 商品購買選項片段呈現。
  metaPush(meta, 'gh_purchase_options', JSON.stringify(sub.purchaseOptions ?? []))

  // 分頁內容
  metaPush(meta, 'av_tab_specs', p.web_spec_html ?? '')
  metaPush(meta, 'av_tab_shipping', '') // 留空 → 網站用全站預設購物說明

  // 認證字號
  metaPush(meta, 'av_bsmi_no', p.web_bsmi_no ?? '')
  metaPush(meta, 'av_ncc_no', p.web_ncc_no ?? '')

  const payload: WooPayload = {
    name: p.product_name,
    slug: makeSlug(p),
    type: 'simple',
    status: opts.status,
    sku: ((p.web_sku || p.model) ?? '').trim() || undefined,
    regular_price: regular > 0 ? String(regular) : undefined,
    description: p.web_description ?? '',
    backorders: p.web_allow_backorder ? 'notify' : 'no',
    meta_data: meta,
  }

  if (promoActive) {
    payload.sale_price = String(p.web_promo_price)
    payload.date_on_sale_from = p.web_promo_price_from || null
    payload.date_on_sale_to = p.web_promo_price_to || null
  }

  if (categoryIds.length > 0) payload.categories = categoryIds.map(id => ({ id }))
  if (uniqueImages.length > 0) payload.images = uniqueImages.map(src => ({ src }))

  // 官網首頁區塊標籤（網站端每日排程會把「最新商品」上架滿 30 天自動轉「熱銷商品」）
  // 促銷區塊不用標籤：官網依限時促銷價自動判斷
  if (p.web_tab === 'new') payload.tags = [{ name: '最新商品' }]
  else if (p.web_tab === 'hot') payload.tags = [{ name: '熱銷商品' }]
  else payload.tags = []

  return payload
}

/** 將系列主商品轉成 WooCommerce variable 父商品；售價、SKU、庫存由各 variation 管理。 */
export function buildWooVariablePayload(
  primary: CrmProductRow,
  sub: CrmSubData,
  categoryIds: number[],
  attributeName: string,
  options: string[],
  opts: { status: 'draft' | 'publish' } = { status: 'draft' }
): WooPayload {
  const payload = buildWooPayload(primary, sub, categoryIds, opts)
  payload.type = 'variable'
  // 明確清空，才能安全地把既有 simple product 轉成 variable product，
  // 否則父商品殘留的 SKU 會和第一個 variation 發生重複。
  payload.sku = ''
  payload.regular_price = ''
  payload.sale_price = ''
  payload.date_on_sale_from = null
  payload.date_on_sale_to = null
  delete payload.backorders
  payload.attributes = [{
    name: attributeName,
    visible: true,
    variation: true,
    options: Array.from(new Set(options.map(value => value.trim()).filter(Boolean))),
  }]
  return payload
}

/** 每筆 CRM 商品仍保存自己的 SKU、價格、庫存與圖片，作為父商品下的可選變體。 */
export function buildWooVariationPayload(p: CrmProductRow, attributeName: string, sub?: CrmSubData): WooVariationPayload {
  const regular = p.web_sale_price && p.web_sale_price > 0 ? p.web_sale_price : p.list_price
  const promoActive = !!(p.web_promo_price && p.web_promo_price > 0)
  const fallbackImage = sub?.images
    ? [...sub.images].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url
    : null
  const image = wooImageUrl(p.web_main_image_url || fallbackImage)
  const payload: WooVariationPayload = {
    sku: ((p.web_sku || p.model) ?? '').trim() || undefined,
    regular_price: regular > 0 ? String(regular) : undefined,
    manage_stock: true,
    stock_quantity: Number(p.stock_qty ?? 0),
    backorders: p.web_allow_backorder ? 'notify' : 'no',
    attributes: [{ name: attributeName, option: (p.variant_value ?? '').trim() }],
    meta_data: [
      { key: 'av_source', value: 'crm' },
      { key: 'av_crm_id', value: p.id },
    ],
  }
  if (image) payload.image = { src: image }
  if (promoActive) {
    payload.sale_price = String(p.web_promo_price)
    payload.date_on_sale_from = p.web_promo_price_from || null
    payload.date_on_sale_to = p.web_promo_price_to || null
  }
  return payload
}

/** 上傳前檢查：回傳缺少的必要欄位 */
export function validateForWeb(p: CrmProductRow, sub: CrmSubData): string[] {
  const missing: string[] = []
  if (!p.product_name?.trim()) missing.push('產品名稱')
  if (!p.brand?.trim()) missing.push('品牌')
  if (!((p.web_sku || p.model) ?? '').trim()) missing.push('SKU / 型號')
  const price = p.web_sale_price && p.web_sale_price > 0 ? p.web_sale_price : p.list_price
  if (!price || price <= 0) missing.push('網站售價')
  if (!(p.web_main_image_url ?? '').trim() && sub.images.length === 0) missing.push('主圖')
  const webCategories = p.web_categories?.filter(c => c.trim()) ?? []
  if (webCategories.length === 0 && !(p.web_category ?? '').trim()) missing.push('網站分類')
  if (sub.features.filter(f => f.feature_text.trim()).length < 3) missing.push('特色（至少 3 項）')
  return missing
}
