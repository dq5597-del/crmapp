import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const TEV_ORIGIN = 'https://www.tev.com.tw'
const DEFAULT_MEDIA_ENDPOINT = 'https://crmapp-topaz.vercel.app/api/wordpress/media'
const OUTPUT_ROOT = path.resolve('outputs', 'tev-product-images')
const APPLY = process.argv.includes('--apply')
const UPLOAD_ONLY = process.argv.includes('--upload-only')
const UPLOAD_GALLERY_ONLY = process.argv.includes('--upload-gallery-only')
const OVERWRITE = process.argv.includes('--overwrite')
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const TEV_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  Referer: `${TEV_ORIGIN}/`,
}
const CRM_TEV_MODELS = [
  'ST-220', 'ST-380', 'ST-780', 'TA-220DL', 'TA-300雙頻', 'TA-380單頻',
  'TA-680D', 'TA-680iD', 'TA-780D', 'TM-326', 'TM-600', 'TM-621', 'TM-700',
  'TM-800', 'TM-933', 'TM-999', 'TOP-II', 'TR-101', 'TR-102', 'TR-310',
  'TR-389', 'TR-5100', 'TR-7100', 'TR-7500', 'TR-8100TD', 'TR-9100',
]
const MODEL_SOURCE_OVERRIDES = new Map([
  ['TA300', 'TA380D'],
  ['TA380', 'TA380D'],
])

async function loadEnvFile(fileName) {
  const text = await fs.readFile(fileName, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

function decodeHtml(value = '') {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+-\s+台灣電音\s*$/u, '')
    .trim()
}

function normalizeModel(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function modelAliases(value = '') {
  const aliases = new Set([normalizeModel(value)])
  for (const part of value.split(/[\/、,，]/)) aliases.add(normalizeModel(part))
  aliases.delete('')
  return [...aliases]
}

function modelsMatch(target, source) {
  const targetAliases = modelAliases(target)
  const sourceAliases = modelAliases(source)
  return targetAliases.some(left => sourceAliases.some(right => left === right))
}

function sourceScore(candidate, targetModel) {
  const pathModel = normalizeModel(new URL(candidate.page_url).pathname)
  const wanted = normalizeModel(targetModel)
  let score = 0
  if (candidate.image_url.includes('/images/430560')) score -= 1000
  if (pathModel.includes(wanted)) score += 100
  if (normalizeModel(candidate.title).includes(wanted)) score += 40
  if (new URL(candidate.page_url).pathname.startsWith('/data-')) score -= 5
  return score
}

async function fetchText(url) {
  const response = await fetch(url, { headers: TEV_HEADERS })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

function productPageFromHtml(pageUrl, html) {
  const model = decodeHtml(html.match(/data-model=["']([^"']+)["']/i)?.[1] ?? '')
  const productArea = html.match(/<div class=["'][^"']*product-show-left[^"']*["']>([\s\S]*?)<div class=["'][^"']*product-show-right/i)?.[1] ?? ''
  const mainCarousel = productArea.match(/<div class=["']main-carousel["']>([\s\S]*?)<div class=["']sub-carousel["']>/i)?.[1] ?? productArea
  const imageUrls = [...mainCarousel.matchAll(/data-lazy-src=["']([^"']+)["']/gi)]
    .map(match => new URL(decodeHtml(match[1]).replace(/\/400\/0(?=\?|$)/, ''), pageUrl).href)
    .filter((url, index, all) => all.indexOf(url) === index)
  const ogImageUrl = decodeHtml(html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
    ?? '')
  if (!imageUrls.length && ogImageUrl) imageUrls.push(new URL(ogImageUrl, pageUrl).href)
  const title = decodeHtml(html.match(/<title>(.*?)<\/title>/is)?.[1] ?? '')
  if (!model || !imageUrls.length) return null
  return { model, page_url: pageUrl, image_url: imageUrls[0], image_urls: imageUrls, title }
}

async function discoverTevProducts() {
  const sitemapHtml = await fetchText(`${TEV_ORIGIN}/sitemap`)
  const paths = new Set()
  for (const match of sitemapHtml.matchAll(/href=["'](\/(?:data-[0-9]+|[a-z0-9-]+))["']/gi)) paths.add(match[1])
  const excluded = new Set([
    '/', '/about-us', '/contact-us', '/download', '/exhibition-review', '/incentive-travel',
    '/inquiry', '/news', '/portable-pa-system', '/privacy-policy', '/products', '/sitemap',
    '/tev-news', '/trolly-portable-pa-system',
  ])
  const urls = [...paths].filter(item => !excluded.has(item)).map(item => new URL(item, TEV_ORIGIN).href)
  const discovered = []
  const failures = []
  const concurrency = 8
  let cursor = 0
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      try {
        const product = productPageFromHtml(url, await fetchText(url))
        if (product) discovered.push(product)
      } catch (error) {
        failures.push({ url, error: error.message })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { discovered, failures, scanned: urls.length }
}

async function getTevProducts(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select('id,brand,product_name,model,web_main_image_url')
    .ilike('brand', 'TEV')
    .order('model', { ascending: true })
  if (error) throw error
  return data ?? []
}

function buildAudit(products, discovered) {
  return products.map(product => {
    const normalizedProductModel = normalizeModel(product.model ?? '')
      .replace(/(?:雙頻|單頻)$/u, '')
    const sourceModel = MODEL_SOURCE_OVERRIDES.get(normalizedProductModel) ?? normalizedProductModel
    const source = discovered
      .filter(candidate => modelsMatch(sourceModel, candidate.model))
      .sort((left, right) => sourceScore(right, sourceModel) - sourceScore(left, sourceModel))[0] ?? null
    return {
      id: product.id,
      brand: product.brand,
      model: product.model,
      product_name: product.product_name,
      before_main_image_url: product.web_main_image_url || null,
      status: source ? (product.web_main_image_url && !OVERWRITE ? 'existing' : 'ready') : 'unmatched',
      source,
    }
  })
}

async function downloadAndConvertImage(entry, sourceUrl = entry.source.image_url, galleryIndex = null) {
  const response = await fetch(sourceUrl, { headers: TEV_HEADERS })
  if (!response.ok) throw new Error(`官方圖片下載失敗（HTTP ${response.status}）`)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`官方圖片不是圖片格式（${contentType || 'unknown'}）`)
  }
  const sourceData = Buffer.from(await response.arrayBuffer())
  const safeModel = String(entry.model).replace(/[^A-Za-z0-9_-]+/g, '-')
  const suffix = galleryIndex === null ? 'main' : `gallery_${String(galleryIndex + 1).padStart(2, '0')}`
  const fileName = `TEV_${safeModel}_${suffix}.webp`
  const outputPath = path.join(OUTPUT_ROOT, 'images', fileName)
  const webp = await sharp(sourceData, { animated: false })
    .rotate()
    .resize(800, 800, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      withoutEnlargement: false,
    })
    .webp({ quality: 85, effort: 6 })
    .toBuffer()
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, webp)
  return { fileName, outputPath, webp }
}

async function uploadToWordPress(entry, image, mediaEndpoint, galleryIndex = null) {
  const body = new FormData()
  body.append('file', new Blob([image.webp], { type: 'image/webp' }), image.fileName)
  const imageLabel = galleryIndex === null ? '' : ` 圖片 ${galleryIndex + 2}`
  body.append('alt_text', `TEV ${entry.model} ${entry.product_name}${imageLabel}`.trim())
  body.append('preset', 'product')
  const response = await fetch(mediaEndpoint, { method: 'POST', body })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.url) {
    throw new Error(result?.error ?? `WordPress 上傳失敗（HTTP ${response.status}）`)
  }
  return result
}

async function updateProductMainImage(supabase, entry, imageUrl) {
  const { data, error } = await supabase
    .from('products')
    .update({ web_main_image_url: imageUrl })
    .eq('id', entry.id)
    .select('id,model,web_main_image_url')
    .single()
  if (error) throw error
  if (!data || data.web_main_image_url !== imageUrl) throw new Error('Supabase 更新後驗證不一致')
  return data
}

async function main() {
  await loadEnvFile(path.resolve('.env.local'))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) throw new Error('缺少 Supabase 環境變數')
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const mediaEndpoint = process.env.TEV_MEDIA_ENDPOINT || DEFAULT_MEDIA_ENDPOINT
  await fs.mkdir(OUTPUT_ROOT, { recursive: true })

  const [queriedProducts, crawl] = await Promise.all([getTevProducts(supabase), discoverTevProducts()])
  const products = queriedProducts.length ? queriedProducts : CRM_TEV_MODELS.map(model => ({
    id: null,
    brand: 'TEV',
    model,
    product_name: model,
    web_main_image_url: null,
  }))
  const audit = buildAudit(products, crawl.discovered)
  const auditPayload = {
    generated_at: new Date().toISOString(),
    mode: UPLOAD_GALLERY_ONLY ? 'upload-gallery-only' : UPLOAD_ONLY ? 'upload-only' : APPLY ? 'apply' : 'audit',
    overwrite: OVERWRITE,
    crm_product_count: products.length,
    tev_pages_scanned: crawl.scanned,
    tev_pages_discovered: crawl.discovered.length,
    tev_discovered_products: crawl.discovered.sort((a, b) => a.model.localeCompare(b.model)),
    crawl_failures: crawl.failures,
    counts: {
      ready: audit.filter(item => item.status === 'ready').length,
      existing: audit.filter(item => item.status === 'existing').length,
      unmatched: audit.filter(item => item.status === 'unmatched').length,
    },
    products: audit,
  }
  await fs.writeFile(path.join(OUTPUT_ROOT, 'audit.json'), JSON.stringify(auditPayload, null, 2))

  console.log(`CRM TEV 產品：${products.length} 筆`)
  console.log(`官網商品頁：掃描 ${crawl.scanned}，辨識 ${crawl.discovered.length}，失敗 ${crawl.failures.length}`)
  console.log(`待處理 ${auditPayload.counts.ready}｜已有主圖 ${auditPayload.counts.existing}｜未配對 ${auditPayload.counts.unmatched}`)
  for (const entry of audit) {
    console.log(`${entry.status.padEnd(9)} ${String(entry.model).padEnd(20)} ${entry.source?.page_url ?? '-'}`)
  }

  if (!APPLY && !UPLOAD_ONLY && !UPLOAD_GALLERY_ONLY) {
    console.log(`\nDry-run 完成：${path.join(OUTPUT_ROOT, 'audit.json')}`)
    return
  }
  if (auditPayload.counts.unmatched > 0) {
    throw new Error(`仍有 ${auditPayload.counts.unmatched} 筆 TEV 型號未配對；為避免錯圖，已停止寫入`)
  }

  const backup = audit.map(entry => ({
    id: entry.id,
    model: entry.model,
    web_main_image_url: entry.before_main_image_url,
  }))
  await fs.writeFile(path.join(OUTPUT_ROOT, 'before-update.json'), JSON.stringify(backup, null, 2))
  const results = []
  const resultsFile = path.join(OUTPUT_ROOT, UPLOAD_GALLERY_ONLY ? 'gallery-results.json' : 'results.json')
  for (const entry of audit.filter(item => item.status === 'ready')) {
    try {
      if (UPLOAD_GALLERY_ONLY) {
        const gallery = []
        for (const [galleryIndex, sourceUrl] of entry.source.image_urls.slice(1).entries()) {
          const image = await downloadAndConvertImage(entry, sourceUrl, galleryIndex)
          const uploaded = await uploadToWordPress(entry, image, mediaEndpoint, galleryIndex)
          gallery.push({ source_url: sourceUrl, local_file: image.outputPath, wordpress: uploaded })
        }
        results.push({
          model: entry.model,
          status: 'updated',
          source_page: entry.source.page_url,
          source_image_count: entry.source.image_urls.length,
          gallery,
        })
        console.log(`updated   ${entry.model} -> 主圖 1＋圖片集 ${gallery.length}`)
      } else {
        const image = await downloadAndConvertImage(entry)
        const uploaded = await uploadToWordPress(entry, image, mediaEndpoint)
        const updated = UPLOAD_ONLY ? null : await updateProductMainImage(supabase, entry, uploaded.url)
        results.push({
          model: entry.model,
          status: 'updated',
          source: entry.source,
          local_file: image.outputPath,
          wordpress: uploaded,
          updated,
        })
        console.log(`updated   ${entry.model} -> ${uploaded.url}`)
      }
    } catch (error) {
      results.push({ model: entry.model, status: 'failed', source: entry.source, error: error.message })
      console.error(`failed    ${entry.model}: ${error.message}`)
    }
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2))
  }

  if (UPLOAD_GALLERY_ONLY) {
    const summary = {
      verified_at: new Date().toISOString(),
      products: products.length,
      source_images: results.reduce((sum, item) => sum + (item.source_image_count ?? 0), 0),
      gallery_uploaded: results.reduce((sum, item) => sum + (item.gallery?.length ?? 0), 0),
      failed_products: results.filter(item => item.status === 'failed').length,
      database_updated: false,
    }
    await fs.writeFile(path.join(OUTPUT_ROOT, 'gallery-verification.json'), JSON.stringify(summary, null, 2))
    console.log(`\n圖片集上傳：產品 ${summary.products}｜官網圖片 ${summary.source_images}｜新圖片集 ${summary.gallery_uploaded}｜失敗產品 ${summary.failed_products}｜資料庫待回寫`)
    if (summary.failed_products) process.exitCode = 1
    return
  }

  if (UPLOAD_ONLY) {
    const summary = {
      verified_at: new Date().toISOString(),
      total: products.length,
      uploaded: results.filter(item => item.status === 'updated').length,
      failed: results.filter(item => item.status === 'failed').length,
      database_updated: false,
    }
    await fs.writeFile(path.join(OUTPUT_ROOT, 'verification.json'), JSON.stringify(summary, null, 2))
    console.log(`\n上傳：共 ${summary.total}｜成功 ${summary.uploaded}｜失敗 ${summary.failed}｜資料庫待回寫`)
    if (summary.failed) process.exitCode = 1
    return
  }

  const verified = await getTevProducts(supabase)
  const missing = verified.filter(item => !String(item.web_main_image_url ?? '').trim())
  const nonWebp = verified.filter(item => item.web_main_image_url && !/\.webp(?:\?|$)/i.test(item.web_main_image_url))
  const summary = {
    verified_at: new Date().toISOString(),
    total: verified.length,
    updated: results.filter(item => item.status === 'updated').length,
    failed: results.filter(item => item.status === 'failed').length,
    missing: missing.map(item => item.model),
    non_webp: nonWebp.map(item => ({ model: item.model, url: item.web_main_image_url })),
  }
  await fs.writeFile(path.join(OUTPUT_ROOT, 'verification.json'), JSON.stringify(summary, null, 2))
  console.log(`\n驗證：共 ${summary.total}｜本次更新 ${summary.updated}｜失敗 ${summary.failed}｜缺圖 ${summary.missing.length}｜非 WebP ${summary.non_webp.length}`)
  if (summary.failed || summary.missing.length || summary.non_webp.length) process.exitCode = 1
}

main().catch(error => {
  console.error(error?.stack ?? error)
  process.exitCode = 1
})
