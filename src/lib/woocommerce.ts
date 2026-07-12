/**
 * WooCommerce REST API 客戶端（僅限伺服器端使用）
 *
 * 需要在 .env.local 設定：
 *   WC_STORE_URL=https://av-shop.com
 *   WC_CONSUMER_KEY=ck_xxx
 *   WC_CONSUMER_SECRET=cs_xxx
 *   WC_WEBHOOK_SECRET=自訂一組字串（供 av-shop 回寫時驗證）
 */

const STORE_URL = process.env.WC_STORE_URL ?? ''
const CK = process.env.WC_CONSUMER_KEY ?? ''
const CS = process.env.WC_CONSUMER_SECRET ?? ''

export function wcConfigured(): boolean {
  return Boolean(STORE_URL && CK && CS)
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${CK}:${CS}`).toString('base64')
}

async function wcFetch(path: string, init?: RequestInit): Promise<any> {
  if (!wcConfigured()) {
    throw new Error('WooCommerce 尚未設定，請在 .env.local 填入 WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET')
  }
  const url = `${STORE_URL.replace(/\/$/, '')}/wp-json/wc/v3${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`WooCommerce 回應非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    const msg = json?.message ?? `HTTP ${res.status}`
    throw new Error(`WooCommerce 錯誤：${msg}`)
  }
  return json
}

export const wc = {
  get: (path: string) => wcFetch(path, { method: 'GET' }),
  post: (path: string, body: any) => wcFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body: any) => wcFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
}

/** 依分類名稱找 WooCommerce 商品分類 ID（找不到回 null，不自動新增，避免誤建分類） */
export async function findCategoryIdByName(name: string): Promise<number | null> {
  if (!name?.trim()) return null
  const list = await wc.get(`/products/categories?search=${encodeURIComponent(name.trim())}&per_page=20`)
  if (!Array.isArray(list) || list.length === 0) return null
  const exact = list.find((c: any) => c.name?.trim() === name.trim())
  return (exact ?? list[0]).id ?? null
}

/** 依 SKU 找既有商品（避免重複建立） */
export async function findProductBySku(sku: string): Promise<any | null> {
  if (!sku?.trim()) return null
  const list = await wc.get(`/products?sku=${encodeURIComponent(sku.trim())}`)
  return Array.isArray(list) && list.length > 0 ? list[0] : null
}
