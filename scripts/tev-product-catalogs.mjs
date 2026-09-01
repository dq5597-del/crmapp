import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SOURCE_DIR = 'G:\\我的雲端硬碟\\網站資料\\Tev'
const OUTPUT_DIR = path.resolve('outputs', 'tev-product-catalogs')
const MEDIA_ENDPOINT = process.env.TEV_MEDIA_ENDPOINT || 'https://crmapp-topaz.vercel.app/api/wordpress/media'

const catalogs = [
  { file: '1785916119147.jpg', label: 'TR-389', models: ['TR-389'] },
  { file: '1785916077311.jpg', label: 'TR-7500', models: ['TR-7500'] },
  { file: '1785916118917.jpg', label: 'TS-680_TS-780', models: [] },
  { file: '1785916078518.jpg', label: 'TR-101', models: ['TR-101'] },
  { file: '1785916078742.jpg', label: 'AD-100', models: [] },
  { file: '1785916079628.jpg', label: 'TR-5700', models: [] },
  { file: '1785916079370.jpg', label: 'TR-5100', models: ['TR-5100'] },
  { file: '1785916118375.jpg', label: 'TR-102', models: ['TR-102'] },
  { file: '1785916077956.jpg', label: 'TA-220DL', models: ['TA-220DL'] },
  { file: '1785916078224.jpg', label: 'TR-7100', models: ['TR-7100'] },
  { file: '1785916079163.jpg', label: 'TM-600_TM-700_TM-800_TM-999', models: ['TM-600', 'TM-700', 'TM-800', 'TM-999'] },
  { file: '1785916078928.jpg', label: 'TM-326_TM-621_TM-933_TOP-II', models: ['TM-326', 'TM-621', 'TM-933', 'TOP-II'] },
  { file: '1785916118141.jpg', label: 'TA-380', models: ['TA-300雙頻', 'TA-380單頻'] },
  { file: '1785916118531.jpg', label: 'TR-9100', models: ['TR-9100'] },
  { file: '1785916118751.jpg', label: 'TR-8100', models: ['TR-8100TD'] },
  { file: '1785916077642.jpg', label: 'TA-780D', models: ['TA-780D'] },
  { file: '1785916117863.jpg', label: 'TA-680iD', models: ['TA-680iD'] },
  { file: '1785916117595.jpg', label: 'TA-680D', models: ['TA-680D'] },
]

async function uploadCatalog(item, outputPath, webp) {
  const body = new FormData()
  body.append('file', new Blob([webp], { type: 'image/webp' }), path.basename(outputPath))
  body.append('alt_text', `TEV ${item.label.replaceAll('_', ' / ')} 產品型錄`)
  body.append('preset', 'content')
  const response = await fetch(MEDIA_ENDPOINT, { method: 'POST', body })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.url) throw new Error(result?.error || `WordPress 上傳失敗（HTTP ${response.status}）`)
  return result
}

async function main() {
  await fs.mkdir(path.join(OUTPUT_DIR, 'images'), { recursive: true })
  const results = []
  for (const item of catalogs) {
    const sourcePath = path.join(SOURCE_DIR, item.file)
    const outputPath = path.join(OUTPUT_DIR, 'images', `TEV_${item.label}_catalog.webp`)
    const source = await fs.readFile(sourcePath)
    const webp = await sharp(source)
      .rotate()
      .resize(1800, 2600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, effort: 6 })
      .toBuffer()
    await fs.writeFile(outputPath, webp)

    const matchedModels = item.models
    const missingModels = []
    let wordpress = null
    let status = 'converted-only'
    if (matchedModels.length) {
      wordpress = await uploadCatalog(item, outputPath, webp)
      status = 'uploaded'
    }
    const metadata = await sharp(webp).metadata()
    const result = {
      source_file: sourcePath,
      local_file: outputPath,
      label: item.label,
      requested_models: item.models,
      matched_models: matchedModels,
      missing_models: missingModels,
      status,
      width: metadata.width,
      height: metadata.height,
      bytes: webp.length,
      wordpress,
    }
    results.push(result)
    await fs.writeFile(path.join(OUTPUT_DIR, 'upload-results.json'), JSON.stringify(results, null, 2))
    console.log(`${status.padEnd(14)} ${item.label.padEnd(31)} ${matchedModels.join(', ') || 'CRM 無對應產品'}`)
  }

  const remoteChecks = []
  for (const result of results.filter(item => item.wordpress?.url)) {
    const response = await fetch(result.wordpress.url, { method: 'HEAD' })
    remoteChecks.push({ label: result.label, url: result.wordpress.url, ok: response.ok, status: response.status })
  }
  const verification = {
    verified_at: new Date().toISOString(),
    supplied_catalogs: catalogs.length,
    converted_webp: results.length,
    uploaded_catalogs: results.filter(item => item.status === 'uploaded').length,
    target_products: new Set(results.flatMap(item => item.matched_models)).size,
    unmatched_catalogs: results.filter(item => item.status === 'converted-only').map(item => item.label),
    remote_checked: remoteChecks.length,
    remote_failed: remoteChecks.filter(item => !item.ok).length,
    remote_checks: remoteChecks,
    database_updated: false,
  }
  await fs.writeFile(path.join(OUTPUT_DIR, 'verification.json'), JSON.stringify(verification, null, 2))
  console.log(JSON.stringify(verification, null, 2))
  if (verification.remote_failed) process.exitCode = 1
}

main().catch(error => {
  console.error(error?.stack || error)
  process.exitCode = 1
})
