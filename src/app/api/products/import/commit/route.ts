import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isConfiguredWordPressMediaUrl, uploadWordPressMedia } from '@/lib/wordpress-media'

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
  filter_specs?: { group: string; values: string[] }[]
}

function normalizeFilterKey(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
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

  const [{ data: filterGroups }, { data: filterOptions }] = await Promise.all([
    supabase.from('product_filter_groups').select('id,name,slug,input_type,unit').eq('is_active', true),
    supabase.from('product_filter_options').select('id,group_id,name,slug,aliases').eq('is_active', true),
  ])
  const groupsBySlug = new Map<string, any>()
  const groupNameBuckets = new Map<string, any[]>()
  for (const group of filterGroups ?? []) {
    groupsBySlug.set(normalizeFilterKey(group.slug), group)
    const key = normalizeFilterKey(group.name)
    groupNameBuckets.set(key, [...(groupNameBuckets.get(key) ?? []), group])
  }
  const groupsByUniqueName = new Map<string, any>()
  groupNameBuckets.forEach((groups, key) => {
    if (groups.length === 1) groupsByUniqueName.set(key, groups[0])
  })
  const optionsByGroup = new Map<string, any[]>()
  for (const option of filterOptions ?? []) {
    optionsByGroup.set(option.group_id, [...(optionsByGroup.get(option.group_id) ?? []), option])
  }

  const results: { rowNo: number; ok: boolean; action: string; name: string; error?: string; note?: string }[] = []
  const imageCache = new Map<string, string>()   // 原網址 → WordPress 媒體網址（同檔只上傳一次）
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

      // Excel 沿用單一「官網分類」欄；匯入時同時寫入新的多選欄位。
      if (typeof payload.web_category === 'string' && payload.web_category.trim()) {
        const webCategories = payload.web_category
          .split(/[,，;；]/)
          .map((value: string) => value.trim())
          .filter(Boolean)
        payload.web_categories = Array.from(new Set(webCategories))
        payload.web_category = webCategories[0] ?? null
      }

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

      // ── 圖片：下載外部網址 → 轉存 WordPress 媒體庫 ──
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

      // ── 分類頁篩選規格：有提供此欄時才覆蓋，空白欄不動既有資料 ──
      if ((item.filter_specs?.length ?? 0) > 0) {
        const assignmentRows: { product_id: string; option_id: string }[] = []
        const numberRows: { product_id: string; group_id: string; numeric_value: number }[] = []
        const filterErrors: string[] = []
        for (const spec of item.filter_specs ?? []) {
          const key = normalizeFilterKey(spec.group)
          const group = groupsBySlug.get(key) ?? groupsByUniqueName.get(key)
          if (!group) {
            filterErrors.push(`找不到或無法唯一辨識「${spec.group}」，請改用英文 slug`)
            continue
          }
          if (group.input_type === 'number') {
            const numeric = Number(String(spec.values[0] ?? '').replace(/[^0-9.+-]/g, ''))
            if (!Number.isFinite(numeric)) filterErrors.push(`「${group.name}」不是有效數字：${spec.values[0] ?? ''}`)
            else numberRows.push({ product_id: productId!, group_id: group.id, numeric_value: numeric })
            continue
          }
          const candidates = optionsByGroup.get(group.id) ?? []
          for (const value of spec.values) {
            const wanted = normalizeFilterKey(value)
            const option = candidates.find(candidate => [candidate.name, candidate.slug, ...(candidate.aliases ?? [])]
              .some(alias => normalizeFilterKey(alias) === wanted))
            if (!option) filterErrors.push(`「${group.name}」沒有選項「${value}」`)
            else assignmentRows.push({ product_id: productId!, option_id: option.id })
          }
        }
        if (filterErrors.length) {
          notes.push(`篩選規格未更新：${filterErrors.join('、')}`)
        } else {
          await Promise.all([
            supabase.from('product_filter_assignments').delete().eq('product_id', productId),
            supabase.from('product_filter_numbers').delete().eq('product_id', productId),
          ])
          if (assignmentRows.length) {
            const uniqueRows = Array.from(new Map(assignmentRows.map(row => [row.option_id, row])).values())
            const { error } = await supabase.from('product_filter_assignments').insert(uniqueRows)
            if (error) notes.push(`篩選選項寫入失敗：${error.message}`)
          }
          if (numberRows.length) {
            const uniqueRows = Array.from(new Map(numberRows.map(row => [row.group_id, row])).values())
            const { error } = await supabase.from('product_filter_numbers').insert(uniqueRows)
            if (error) notes.push(`數值規格寫入失敗：${error.message}`)
          }
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

/** 下載外部圖片 → 上傳 WordPress 媒體庫。失敗則沿用原網址並記警告。 */
async function transferImage(
  url: string,
  cache: Map<string, string>,
  notes: string[],
): Promise<string | null> {
  const u = url.trim()
  if (!u) return null
  if (cache.has(u)) return cache.get(u)!
  if (isConfiguredWordPressMediaUrl(u)) {
    cache.set(u, u)
    return u
  }
  if (!/^https?:\/\//i.test(u)) return null

  try {
    const res = await fetch(u, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!/^image\//i.test(ct)) throw new Error(`不是圖片（${ct || '未知類型'}）`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 10 * 1024 * 1024) throw new Error('圖片超過 10MB')

    const ext = (ct.split('/')[1] ?? 'jpg').split(';')[0].replace('jpeg', 'jpg')
    const base = decodeURIComponent(u.split('/').pop() ?? 'image').split('?')[0] || 'image'
    const fileName = /\.\w{3,4}$/.test(base) ? base : `${base}.${ext}`

    const result = await uploadWordPressMedia({
      fileName: `${Date.now()}_${fileName}`,
      mimeType: ct,
      data: buf,
      altText: fileName.replace(/\.[^.]+$/, ''),
    })
    cache.set(u, result.url)
    return result.url
  } catch (e: any) {
    notes.push(`圖片轉存失敗（${u}）：${e?.message ?? ''}，沿用原網址`)
    cache.set(u, u)
    return u
  }
}
