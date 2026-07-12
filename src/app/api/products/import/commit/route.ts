import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { uploadToDrive, driveConfigured } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const maxDuration = 300

interface CommitItem {
  rowNo: number
  action: 'insert' | 'update' | 'skip'
  productId?: string | null
  product: Record<string, any>       // 含 main_category / sub_category（會被抽走）
  features?: string[]
  main_image_url?: string
  image_urls?: string[]
}

/**
 * POST /api/products/import/commit
 * body: { items: CommitItem[] }
 * 逐筆寫入，單筆失敗不影響其他筆，回傳每列結果。
 */
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  let items: CommitItem[] = []
  try {
    const body = await req.json()
    items = (body.items ?? []).filter((i: CommitItem) => i.action !== 'skip')
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  if (!items.length) return NextResponse.json({ error: '沒有要匯入的資料' }, { status: 400 })

  // 分類快取：'主分類||次分類' → id
  const { data: cats } = await supabase.from('product_categories').select('id,main_category,sub_category')
  const catMap = new Map<string, string>()
  for (const c of cats ?? []) catMap.set(`${c.main_category}||${c.sub_category}`, c.id)

  const results: { rowNo: number; ok: boolean; action: string; name: string; error?: string; note?: string }[] = []
  const imageCache = new Map<string, string>()   // 原網址 → Drive 公開連結（同檔只上傳一次）
  let inserted = 0, updated = 0, failed = 0

  for (const item of items) {
    const notes: string[] = []
    const name = String(item.product?.product_name ?? '')
    try {
      const payload: Record<string, any> = { ...item.product }
      const main = String(payload.main_category ?? '').trim()
      const sub = String(payload.sub_category ?? '').trim()
      delete payload.main_category
      delete payload.sub_category

      // ── 分類：找不到就建立 ──
      if (main && sub) {
        const key = `${main}||${sub}`
        let catId = catMap.get(key)
        if (!catId) {
          const { data: newCat, error } = await supabase
            .from('product_categories')
            .insert({ main_category: main, sub_category: sub })
            .select('id')
            .single()
          if (error) throw new Error(`建立分類「${main} > ${sub}」失敗：${error.message}`)
          catId = newCat!.id
          catMap.set(key, catId!)
          notes.push(`已新增分類「${main} > ${sub}」`)
        }
        payload.category_id = catId
      }

      // ── 圖片：下載外部網址 → 轉存 Google Drive 公開連結 ──
      const mainImg = (item.main_image_url ?? '').trim()
      if (mainImg) {
        const url = await transferImage(mainImg, imageCache, notes)
        if (url) payload.web_main_image_url = url
      }

      // ── 寫入 products ──
      let productId = item.productId ?? null
      if (item.action === 'insert') {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single()
        if (error) throw new Error(error.message)
        productId = data!.id
        inserted++
      } else {
        if (!productId) throw new Error('缺少要更新的產品 id')
        // 更新時不覆蓋庫存
        delete payload.stock_qty
        const { error } = await supabase.from('products').update(payload).eq('id', productId)
        if (error) throw new Error(error.message)
        updated++
      }

      // ── 子表：產品特色 ──
      const feats = (item.features ?? []).filter(f => f.trim())
      if (feats.length) {
        await supabase.from('product_features').delete().eq('product_id', productId)
        const rows = feats.slice(0, 10).map((f, i) => ({
          product_id: productId, feature_text: f.trim().slice(0, 5), sort_order: i,
        }))
        const { error } = await supabase.from('product_features').insert(rows)
        if (error) notes.push(`產品特色寫入失敗：${error.message}`)
      }

      // ── 子表：圖片集 ──
      const extra = (item.image_urls ?? []).filter(u => u.trim())
      if (extra.length) {
        const urls: string[] = []
        for (const u of extra) {
          const url = await transferImage(u, imageCache, notes)
          if (url) urls.push(url)
        }
        if (urls.length) {
          await supabase.from('product_images').delete().eq('product_id', productId)
          const rows = urls.map((u, i) => ({ product_id: productId, image_url: u, sort_order: i }))
          const { error } = await supabase.from('product_images').insert(rows)
          if (error) notes.push(`圖片集寫入失敗：${error.message}`)
        }
      }

      results.push({
        rowNo: item.rowNo, ok: true, action: item.action, name,
        note: notes.length ? notes.join('；') : undefined,
      })
    } catch (e: any) {
      failed++
      results.push({ rowNo: item.rowNo, ok: false, action: item.action, name, error: e?.message ?? '未知錯誤' })
    }
  }

  return NextResponse.json({ inserted, updated, failed, results })
}

/** 下載外部圖片 → 上傳 Google Drive（公開連結）。失敗則沿用原網址並記警告。 */
async function transferImage(
  url: string,
  cache: Map<string, string>,
  notes: string[],
): Promise<string | null> {
  const u = url.trim()
  if (!u) return null
  if (cache.has(u)) return cache.get(u)!

  // 已經是 Drive 連結就不再搬
  if (/drive\.google\.com|googleusercontent\.com/i.test(u)) {
    cache.set(u, u)
    return u
  }
  if (!/^https?:\/\//i.test(u)) return null
  if (!driveConfigured()) {
    notes.push('Google Drive 未設定，圖片沿用原網址')
    cache.set(u, u)
    return u
  }

  try {
    const res = await fetch(u, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') ?? ''
    if (!/^image\//i.test(ct)) throw new Error(`不是圖片（${ct || '未知類型'}）`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 10 * 1024 * 1024) throw new Error('圖片超過 10MB')

    const ext = (ct.split('/')[1] ?? 'jpg').split(';')[0].replace('jpeg', 'jpg')
    const base = decodeURIComponent(u.split('/').pop() ?? 'image').split('?')[0] || 'image'
    const fileName = /\.\w{3,4}$/.test(base) ? base : `${base}.${ext}`

    const result = await uploadToDrive({
      folder: '產品圖片',
      name: `${Date.now()}_${fileName}`,
      mimeType: ct,
      data: buf,
      makePublic: true,
    })
    const publicUrl = result.publicUrl ?? u
    cache.set(u, publicUrl)
    return publicUrl
  } catch (e: any) {
    notes.push(`圖片轉存失敗（${u}）：${e?.message ?? ''}，沿用原網址`)
    cache.set(u, u)
    return u
  }
}
