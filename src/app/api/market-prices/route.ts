import { NextRequest, NextResponse } from 'next/server'

// 市場行情查詢：PChome / momo / 蝦皮
// GET /api/market-prices?q=Yamaha HS5
// 回傳各平台 最低/中間/最高 價（未含運費），供報價參考

export const maxDuration = 30
export const dynamic = 'force-dynamic'

type PlatformResult = {
  key: 'pchome' | 'momo' | 'shopee'
  name: string
  ok: boolean
  count: number
  min: number | null
  mid: number | null
  max: number | null
  searchUrl: string
  note?: string
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function stats(prices: number[]): { min: number; mid: number; max: number } | null {
  const p = prices.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (p.length === 0) return null
  const mid =
    p.length % 2 === 1
      ? p[(p.length - 1) / 2]
      : Math.round((p[p.length / 2 - 1] + p[p.length / 2]) / 2)
  return { min: p[0], mid, max: p[p.length - 1] }
}

// 以查詢關鍵字過濾商品名稱（每個 token 都要出現），過濾後為空則退回原列表
function tokenFilter<T>(list: T[], getName: (x: T) => string, q: string): T[] {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return list
  const filtered = list.filter(x => {
    const name = getName(x).toLowerCase()
    return tokens.every(t => name.includes(t))
  })
  return filtered.length > 0 ? filtered : list
}

async function fetchPchome(q: string): Promise<PlatformResult> {
  const searchUrl = `https://24h.pchome.com.tw/search/?q=${encodeURIComponent(q)}`
  const base: PlatformResult = { key: 'pchome', name: 'PChome', ok: false, count: 0, min: null, mid: null, max: null, searchUrl }
  try {
    const res = await fetch(
      `https://ecshweb.pchome.com.tw/search/v3.3/all/results?q=${encodeURIComponent(q)}&page=1&sort=rnk/dc`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    let prods: any[] = data?.prods ?? []
    prods = tokenFilter(prods, p => `${p.name ?? ''} ${p.describe ?? ''}`, q)
    const s = stats(prods.map(p => Number(p.price)))
    if (!s) return { ...base, ok: true, note: '無符合商品' }
    return { ...base, ok: true, count: prods.length, ...s }
  } catch (e: any) {
    return { ...base, note: '查詢失敗' }
  }
}

async function fetchMomo(q: string): Promise<PlatformResult> {
  const searchUrl = `https://www.momoshop.com.tw/search/searchShop.jsp?keyword=${encodeURIComponent(q)}`
  const base: PlatformResult = { key: 'momo', name: 'momo', ok: false, count: 0, min: null, mid: null, max: null, searchUrl }
  try {
    const res = await fetch('https://apisearch.momoshop.com.tw/momoSearchCloud/moec/textsearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Referer: 'https://www.momoshop.com.tw/' },
      body: JSON.stringify({
        host: 'momoshop',
        flag: 'searchEngine',
        data: { searchValue: q, curPage: '1', priceS: '0', priceE: '9999999', searchType: '1', maxPage: '1' },
      }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    let goods: any[] =
      data?.rtnSearchData?.goodsInfoList ?? data?.rtnData?.searchResult?.rtnSearchData?.goodsInfoList ?? []
    goods = tokenFilter(goods, g => `${g.goodsName ?? g.GOODS_NAME ?? ''}`, q)
    const prices = goods.map(g => {
      const raw = g.goodsPrice ?? g.SALE_PRICE ?? g.salePrice ?? g.price ?? ''
      return Number(String(raw).replace(/[^\d.]/g, ''))
    })
    const s = stats(prices)
    if (!s) return { ...base, ok: true, note: '無符合商品' }
    return { ...base, ok: true, count: goods.length, ...s }
  } catch {
    return { ...base, note: '查詢失敗，請點連結手動查看' }
  }
}

async function fetchShopee(q: string): Promise<PlatformResult> {
  const searchUrl = `https://shopee.tw/search?keyword=${encodeURIComponent(q)}`
  const base: PlatformResult = { key: 'shopee', name: '蝦皮', ok: false, count: 0, min: null, mid: null, max: null, searchUrl }
  try {
    const res = await fetch(
      `https://shopee.tw/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(q)}&limit=30&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`,
      {
        headers: { 'User-Agent': UA, Referer: `https://shopee.tw/search?keyword=${encodeURIComponent(q)}`, 'x-api-source': 'pc' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    let items: any[] = (data?.items ?? []).map((it: any) => it.item_basic ?? it).filter(Boolean)
    items = tokenFilter(items, it => `${it.name ?? ''}`, q)
    const prices = items.map(it => Number(it.price) / 100000)
    const s = stats(prices)
    if (!s) return { ...base, ok: true, note: '無符合商品' }
    return { ...base, ok: true, count: items.length, ...s }
  } catch {
    return { ...base, note: '蝦皮防爬蟲限制，請點連結手動查看' }
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: '缺少查詢關鍵字' }, { status: 400 })

  const [pchome, momo, shopee] = await Promise.all([fetchPchome(q), fetchMomo(q), fetchShopee(q)])

  return NextResponse.json({
    q,
    fetched_at: new Date().toISOString(),
    platforms: [shopee, pchome, momo],
  })
}
