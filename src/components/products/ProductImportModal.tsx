'use client'

import { useMemo, useRef, useState } from 'react'
import {
  X, Upload, Download, ChevronRight, FileSpreadsheet,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Images, ImagePlus, Trash2,
} from 'lucide-react'
import type { ParsedRow } from '@/lib/product-import'
import {
  isSupportedProductPhoto,
  matchProductPhotos,
  productPhotoFileIdentity,
  PRODUCT_PHOTO_MAX_SIZE,
  withProductDescriptionImages,
} from '@/lib/product-photo-import'

type Action = 'insert' | 'update' | 'skip'

interface PreviewRow extends ParsedRow {
  action: Action
  matchedId: string | null
  matchedName: string | null
  matchedBy: '型號' | '官網SKU' | null
}

interface Props {
  products: any[]                 // 現有產品（父層已載入）
  onClose: () => void
  onDone: () => void              // 匯入成功後讓父層 refetch
}

export default function ProductImportModal({ products, onClose, onDone }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [result, setResult] = useState<any>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoWarnings, setPhotoWarnings] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const uploadedPhotoUrlsRef = useRef(new Map<string, string>())

  const photoMatch = useMemo(() => matchProductPhotos(
    rows.map(row => ({ rowNo: row.rowNo, model: row.product.model, webSku: row.product.web_sku })),
    photoFiles,
  ), [rows, photoFiles])

  const matchedPhotoStats = useMemo(() => {
    let product = 0
    let description = 0
    photoMatch.assignments.forEach(photos => {
      product += photos.filter(photo => photo.role === 'product').length
      description += photos.filter(photo => photo.role === 'description').length
    })
    return { product, description }
  }, [photoMatch])

  /** 以型號 → 官網SKU 比對既有產品 */
  function matchProduct(r: ParsedRow): Pick<PreviewRow, 'matchedId' | 'matchedName' | 'matchedBy'> {
    const model = String(r.product.model ?? '').trim().toUpperCase()
    const sku = String(r.product.web_sku ?? '').trim().toUpperCase()
    if (model) {
      const hit = products.find(p => String(p.model ?? '').trim().toUpperCase() === model)
      if (hit) return { matchedId: hit.id, matchedName: hit.product_name, matchedBy: '型號' }
    }
    if (sku) {
      const hit = products.find(p => String(p.web_sku ?? '').trim().toUpperCase() === sku)
      if (hit) return { matchedId: hit.id, matchedName: hit.product_name, matchedBy: '官網SKU' }
    }
    return { matchedId: null, matchedName: null, matchedBy: null }
  }

  function mergePhotoFiles(files: File[]) {
    if (!files.length) return
    setPhotoFiles(current => {
      const merged = new Map(current.map(file => [productPhotoFileIdentity(file), file]))
      files.forEach(file => merged.set(productPhotoFileIdentity(file), file))
      return Array.from(merged.values())
    })
  }

  async function handleFile(file: File) {
    setError('')
    setParsing(true)
    setFileName(file.name)
    try {
      let data: {
        rows: ParsedRow[]
        unknownHeaders?: string[]
        embeddedPhotos?: File[]
        warnings?: string[]
      }
      if (/\.xlsx$/i.test(file.name)) {
        const { parseProductXlsx } = await import('@/lib/product-xlsx-import')
        data = await parseProductXlsx(file)
        const embedded = data.embeddedPhotos ?? []
        const accepted = embedded.filter(photo => photo.size <= PRODUCT_PHOTO_MAX_SIZE)
        const oversized = embedded.length - accepted.length
        mergePhotoFiles(accepted)
        setPhotoWarnings(current => [
          ...current,
          ...(data.warnings ?? []),
          ...(oversized ? [`Excel 內有 ${oversized} 張圖片超過單張 4MB，未加入。`] : []),
        ])
      } else {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/products/import/parse', { method: 'POST', body: fd })
        data = await res.json()
        if (!res.ok) throw new Error((data as any).error ?? '解析失敗')
      }

      const preview: PreviewRow[] = (data.rows as ParsedRow[]).map(r => {
        const m = matchProduct(r)
        return {
          ...r,
          ...m,
          // 預設：找到 → 更新；沒找到 → 新增；有錯誤 → 跳過
          action: r.errors.length > 0 ? 'skip' : m.matchedId ? 'update' : 'insert',
        }
      })
      setRows(preview)
      setUnknownHeaders(data.unknownHeaders ?? [])
      if (!preview.length) throw new Error('檔案裡沒有可匯入的資料列')
      setStep(2)
    } catch (e: any) {
      setError(e?.message ?? '解析失敗')
    } finally {
      setParsing(false)
    }
  }

  async function handleSelectedFiles(selectedFiles: FileList | File[]) {
    const selected = Array.from(selectedFiles)
    if (!selected.length) return
    setError('')

    const spreadsheets = selected.filter(file => /\.(xlsx|csv)$/i.test(file.name))
    const imageCandidates = selected.filter(file => isSupportedProductPhoto(file))
    const oversized = imageCandidates.filter(file => file.size > PRODUCT_PHOTO_MAX_SIZE)
    const acceptedImages = imageCandidates.filter(file => file.size <= PRODUCT_PHOTO_MAX_SIZE)
    const ignored = selected.filter(file => !spreadsheets.includes(file) && !imageCandidates.includes(file))
    const warnings: string[] = []

    if (spreadsheets.length > 1) warnings.push('一次只能匯入一份 Excel／CSV，已採用第一份檔案。')
    if (oversized.length) warnings.push(`${oversized.length} 張圖片超過單張 4MB，未加入。`)
    if (ignored.length) warnings.push(`${ignored.length} 個不支援的檔案已略過。`)
    setPhotoWarnings(warnings)

    if (acceptedImages.length) {
      mergePhotoFiles(acceptedImages)
    }

    if (spreadsheets[0]) await handleFile(spreadsheets[0])
    else if (!acceptedImages.length) setError('請選擇 .xlsx、.csv 或支援的圖片檔案')
  }

  function removePhoto(file: File) {
    const identity = productPhotoFileIdentity(file)
    setPhotoFiles(files => files.filter(item => productPhotoFileIdentity(item) !== identity))
    uploadedPhotoUrlsRef.current.delete(identity)
  }

  function resetSelection() {
    setStep(1)
    setRows([])
    setError('')
    setUnknownHeaders([])
    setPhotoFiles([])
    setPhotoWarnings([])
    setUploadProgress(null)
    uploadedPhotoUrlsRef.current.clear()
  }

  function setAction(rowNo: number, action: Action) {
    setRows(rs => rs.map(r => (r.rowNo === rowNo ? { ...r, action } : r)))
  }

  function bulkAction(action: Action, only?: 'new' | 'existing') {
    setRows(rs => rs.map(r => {
      if (r.errors.length > 0) return r                       // 有錯誤的一律不動
      if (only === 'new' && r.matchedId) return r
      if (only === 'existing' && !r.matchedId) return r
      if (action === 'update' && !r.matchedId) return r       // 沒比對到不能更新
      return { ...r, action }
    }))
  }

  async function handleImport() {
    setImporting(true)
    setError('')
    try {
      const selectedRows = rows.filter(r => r.action !== 'skip' && r.errors.length === 0)
      const selectedRowNos = new Set(selectedRows.map(row => row.rowNo))
      const blockingDuplicates = photoMatch.duplicates.filter(item => selectedRowNos.has(item.rowNo))
      const blockingAmbiguous = photoMatch.ambiguous.filter(item => item.rowNos.some(rowNo => selectedRowNos.has(rowNo)))
      if (blockingDuplicates.length || blockingAmbiguous.length) {
        throw new Error('照片有重複序號或同時符合多筆商品，請先依預覽提示修正檔名或移除檔案。')
      }
      const descriptionOnSecondaryRows = selectedRows.filter(row => (
        row.product.variant_group_code
        && !row.product.variant_is_primary
        && (photoMatch.assignments.get(row.rowNo) ?? []).some(photo => photo.role === 'description')
      ))
      if (descriptionOnSecondaryRows.length) {
        throw new Error(`變體商品的介紹圖必須使用系列主商品型號命名；請修正第 ${descriptionOnSecondaryRows.map(row => row.rowNo).join('、')} 列的照片。`)
      }

      const uploadedUrls = await uploadSelectedPhotos(selectedRows)
      const items = selectedRows.map(r => {
        const directPhotos = photoMatch.assignments.get(r.rowNo) ?? []
        const productPhotos = directPhotos.filter(photo => photo.role === 'product')
        const descriptionPhotos = directPhotos.filter(photo => photo.role === 'description')
        const directMain = productPhotos.find(photo => photo.order === 1)
        const directExtras = productPhotos.filter(photo => photo.order > 1)
        const mainImageUrl = directMain
          ? uploadedUrls.get(productPhotoFileIdentity(directMain.file)) ?? r.main_image_url
          : r.main_image_url
        const imageUrls = Array.from(new Set([
          ...directExtras.map(photo => uploadedUrls.get(productPhotoFileIdentity(photo.file)) ?? '').filter(Boolean),
          ...r.image_urls,
        ]))
        const descriptionImageUrls = descriptionPhotos
          .map(photo => uploadedUrls.get(productPhotoFileIdentity(photo.file)) ?? '')
          .filter(Boolean)
        const existingProduct = r.matchedId ? products.find(product => product.id === r.matchedId) : null
        const baseDescription = r.product.web_description ?? existingProduct?.web_description ?? ''
        const productPayload = descriptionImageUrls.length
          ? {
              ...r.product,
              web_description: withProductDescriptionImages(
                baseDescription,
                descriptionImageUrls,
                r.product.product_name,
              ),
            }
          : r.product
        return {
          rowNo: r.rowNo,
          action: r.action,
          productId: r.matchedId,
          product: productPayload,
          features: r.features,
          main_image_url: mainImageUrl,
          image_urls: imageUrls,
          filter_specs: r.filter_specs,
        }
      })
      const res = await fetch('/api/products/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '匯入失敗')
      setResult(data)
      setStep(3)
      onDone()
    } catch (e: any) {
      setError(e?.message ?? '匯入失敗')
    } finally {
      setImporting(false)
      setUploadProgress(null)
    }
  }

  async function uploadSelectedPhotos(selectedRows: PreviewRow[]) {
    const altTextByIdentity = new Map<string, string>()
    const filesByIdentity = new Map<string, { file: File; preset: 'product' | 'content' }>()
    for (const row of selectedRows) {
      for (const photo of photoMatch.assignments.get(row.rowNo) ?? []) {
        const identity = productPhotoFileIdentity(photo.file)
        filesByIdentity.set(identity, {
          file: photo.file,
          preset: photo.role === 'description' ? 'content' : 'product',
        })
        altTextByIdentity.set(
          identity,
          `${String(row.product.product_name ?? photo.identifier)}${photo.role === 'description' ? ' 產品介紹圖' : ''}`,
        )
      }
    }

    const files = Array.from(filesByIdentity.entries())
    if (!files.length) return new Map<string, string>()

    const uploaded = new Map<string, string>()
    for (const [identity] of files) {
      const cached = uploadedPhotoUrlsRef.current.get(identity)
      if (cached) uploaded.set(identity, cached)
    }
    setUploadProgress({ done: uploaded.size, total: files.length })

    const pending = files.filter(([identity]) => !uploaded.has(identity))
    let cursor = 0
    async function worker() {
      while (cursor < pending.length) {
        const current = pending[cursor++]
        if (!current) return
        const [identity, task] = current
        const { file, preset } = task
        const fd = new FormData()
        fd.append('file', file)
        fd.append('alt_text', altTextByIdentity.get(identity) ?? file.name.replace(/\.[^.]+$/, ''))
        fd.append('preset', preset)
        const response = await fetch('/api/wordpress/media', { method: 'POST', body: fd })
        const data = await response.json()
        if (!response.ok || !data?.url) throw new Error(`圖片「${file.name}」上傳失敗：${data?.error ?? '未知錯誤'}`)
        uploaded.set(identity, data.url)
        uploadedPhotoUrlsRef.current.set(identity, data.url)
        setUploadProgress(progress => progress ? { ...progress, done: progress.done + 1 } : progress)
      }
    }
    const workerResults = await Promise.allSettled(
      Array.from({ length: Math.min(3, pending.length) }, () => worker()),
    )
    const failedWorker = workerResults.find(result => result.status === 'rejected')
    if (failedWorker?.status === 'rejected') throw failedWorker.reason
    return uploaded
  }

  const stats = useMemo(() => ({
    total: rows.length,
    insert: rows.filter(r => r.action === 'insert').length,
    update: rows.filter(r => r.action === 'update').length,
    skip: rows.filter(r => r.action === 'skip').length,
    error: rows.filter(r => r.errors.length > 0).length,
  }), [rows])

  const willImport = stats.insert + stats.update

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">匯入產品</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 text-xs">
          {(['上傳檔案', '預覽比對', '匯入結果'] as const).map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {step > i + 1 ? '✓' : i + 1}
              </span>
              <span className={step === i + 1 ? 'text-blue-700 font-medium' : 'text-gray-400'}>{label}</span>
              {i < 2 && <ChevronRight size={12} className="text-gray-300" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              <XCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {/* ── Step 1：上傳 ── */}
          {step === 1 && (
            <div className="space-y-4">
              <a
                href="/api/products/import/template"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Download size={15} /> 下載匯入範本（.xlsx）
              </a>

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  void handleSelectedFiles(e.dataTransfer.files)
                }}
                className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-2xl px-6 py-12 text-center cursor-pointer transition-colors"
              >
                {parsing ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <Loader2 size={28} className="animate-spin text-blue-600" />
                    <span className="text-sm">解析中…{fileName}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-gray-300">
                      <FileSpreadsheet size={32} />
                      <span className="text-xl">＋</span>
                      <Images size={32} />
                    </div>
                    <div className="text-sm text-gray-700 font-medium">把 Excel 和所有商品照片一起拖進來</div>
                    <div className="text-xs text-gray-400">或點此一次選取檔案；Excel 最多 1000 筆，單張照片最大 4MB</div>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={e => { if (e.target.files) void handleSelectedFiles(e.target.files); e.target.value = '' }}
              />

              {photoFiles.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                    <CheckCircle2 size={16} /> 已選擇 {photoFiles.length} 張照片
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 truncate">
                    {photoFiles.slice(0, 5).map(file => file.name).join('、')}
                    {photoFiles.length > 5 ? `，另 ${photoFiles.length - 5} 張` : ''}
                  </div>
                </div>
              )}

              {photoWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {photoWarnings.map((warning, index) => <div key={index}>⚠ {warning}</div>)}
                </div>
              )}

              <ul className="text-xs text-gray-500 space-y-1 leading-relaxed">
                <li>• 比對既有產品的依據：<b>型號</b> →（找不到再看）<b>官網SKU</b>，不分大小寫。</li>
                <li>• 下一步會逐筆列出「新增／更新／跳過」，確認後才會真的寫入。</li>
                <li>• 照片請命名為「型號_01.jpg、型號_02.jpg」；_01 是主圖，_02 之後是其他圖片。</li>
                <li>• 產品介紹圖片請命名為「型號_DESC_01.jpg、型號_DESC_02.jpg」，會依序放在產品介紹文字後方。</li>
                <li>• 也可以直接把圖片貼在 Excel 的「主圖圖片／其他圖片／產品介紹圖片」欄，不需要另外選照片。</li>
                <li>• 商品圖會轉為 600 × 600；介紹圖保留比例並限制在 1800 × 2600 內，兩者都轉成 WebP 存入 WordPress。</li>
                <li>• 更新既有產品時<b>不會覆蓋庫存數量</b>。</li>
              </ul>
            </div>
          )}

          {/* ── Step 2：預覽 ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault()
                  void handleSelectedFiles(event.dataTransfer.files)
                }}
                className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Images size={16} className="text-emerald-700" />
                  <span className="text-sm font-medium text-emerald-900">照片自動配對</span>
                  <span className="text-xs text-emerald-800">
                    已選 {photoFiles.length} 張／商品圖 {matchedPhotoStats.product} 張／介紹圖 {matchedPhotoStats.description} 張
                  </span>
                  {photoMatch.unmatched.length > 0 && <span className="text-xs text-amber-700">未配對 {photoMatch.unmatched.length}</span>}
                  {photoMatch.ambiguous.length > 0 && <span className="text-xs text-red-700">無法唯一配對 {photoMatch.ambiguous.length}</span>}
                  {photoMatch.duplicates.length > 0 && <span className="text-xs text-red-700">重複序號 {photoMatch.duplicates.length} 組</span>}
                  <button
                    type="button"
                    onClick={() => photoRef.current?.click()}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <ImagePlus size={14} /> 新增照片
                  </button>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={event => { if (event.target.files) void handleSelectedFiles(event.target.files); event.target.value = '' }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-emerald-700">型號_01 是主圖，_02 之後是相簿；型號_DESC_01 之後會依序放入產品介紹。</p>

                {(photoMatch.unmatched.length > 0 || photoMatch.ambiguous.length > 0 || photoMatch.duplicates.length > 0) && (
                  <div className="mt-2 space-y-1 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-[11px]">
                    {photoMatch.unmatched.slice(0, 8).map(file => (
                      <div key={`unmatched-${productPhotoFileIdentity(file)}`} className="flex items-center gap-2 text-amber-700">
                        <span className="min-w-0 flex-1 truncate">未配對：{file.name}</span>
                        <button type="button" onClick={() => removePhoto(file)} className="text-gray-400 hover:text-red-600" aria-label={`移除 ${file.name}`}><Trash2 size={12} /></button>
                      </div>
                    ))}
                    {photoMatch.ambiguous.slice(0, 8).map(item => (
                      <div key={`ambiguous-${productPhotoFileIdentity(item.file)}`} className="flex items-center gap-2 text-red-700">
                        <span className="min-w-0 flex-1 truncate">同時符合第 {item.rowNos.join('、')} 列：{item.file.name}</span>
                        <button type="button" onClick={() => removePhoto(item.file)} className="text-gray-400 hover:text-red-600" aria-label={`移除 ${item.file.name}`}><Trash2 size={12} /></button>
                      </div>
                    ))}
                    {photoMatch.duplicates.slice(0, 8).map(item => (
                      <div key={`duplicate-${item.rowNo}-${item.role}-${item.order}`} className="text-red-700">
                        <div>
                          第 {item.rowNo} 列的{item.role === 'description' ? '介紹圖 ' : '商品圖 '}
                          _{String(item.order).padStart(2, '0')} 有 {item.files.length} 張，請只保留一張：
                        </div>
                        {item.files.map(file => (
                          <div key={productPhotoFileIdentity(file)} className="ml-3 flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">{file.name}</span>
                            <button type="button" onClick={() => removePhoto(file)} className="text-gray-400 hover:text-red-600" aria-label={`移除 ${file.name}`}><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    ))}
                    {(photoMatch.unmatched.length + photoMatch.ambiguous.length + photoMatch.duplicates.length) > 8 && (
                      <div className="text-gray-500">尚有其他問題，請依各商品列的圖片狀態檢查。</div>
                    )}
                  </div>
                )}
              </div>

              {unknownHeaders.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>以下欄位不認得，將被忽略：{unknownHeaders.join('、')}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-gray-500">共 {stats.total} 列 ·</span>
                <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">新增 {stats.insert}</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">更新 {stats.update}</span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">跳過 {stats.skip}</span>
                {stats.error > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">錯誤 {stats.error}</span>}
                <div className="ml-auto flex gap-2">
                  <button onClick={() => bulkAction('update', 'existing')} className="text-blue-600 hover:underline">既有全部更新</button>
                  <button onClick={() => bulkAction('skip', 'existing')} className="text-gray-500 hover:underline">既有全部跳過</button>
                  <button onClick={() => bulkAction('skip')} className="text-gray-500 hover:underline">全部跳過</button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-2 text-left w-10">列</th>
                      <th className="px-2 py-2 text-left">產品</th>
                      <th className="px-2 py-2 text-left w-28">型號</th>
                      <th className="px-2 py-2 text-left w-24">照片</th>
                      <th className="px-2 py-2 text-right w-20">建議售價</th>
                      <th className="px-2 py-2 text-left w-40">比對結果</th>
                      <th className="px-2 py-2 text-left w-44">動作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(r => {
                      const bad = r.errors.length > 0
                      const matchedPhotos = photoMatch.assignments.get(r.rowNo) ?? []
                      const productPhotos = matchedPhotos.filter(photo => photo.role === 'product')
                      const hasDirectMain = productPhotos.some(photo => photo.order === 1)
                      const directExtraCount = productPhotos.filter(photo => photo.order > 1).length
                      const descriptionPhotoCount = matchedPhotos.filter(photo => photo.role === 'description').length
                      const descriptionOnSecondary = descriptionPhotoCount > 0 && r.product.variant_group_code && !r.product.variant_is_primary
                      return (
                        <tr key={r.rowNo} className={bad ? 'bg-red-50/50' : r.action === 'skip' ? 'opacity-50' : ''}>
                          <td className="px-2 py-2 text-gray-400">{r.rowNo}</td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-gray-900">
                              {r.product.brand ? <span className="text-gray-400 mr-1">{r.product.brand}</span> : null}
                              {r.product.product_name || <span className="text-red-500">（無產品名稱）</span>}
                            </div>
                            {(bad || r.warnings.length > 0) && (
                              <div className="mt-0.5 space-y-0.5">
                                {r.errors.map((e, i) => <div key={i} className="text-red-600">✕ {e}</div>)}
                                {r.warnings.map((w, i) => <div key={i} className="text-amber-600">⚠ {w}</div>)}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-gray-600">{r.product.model ?? '—'}</td>
                          <td className="px-2 py-2">
                            {matchedPhotos.length > 0 ? (
                              <div className="text-emerald-700">
                                {productPhotos.length > 0 && (
                                  <div>{hasDirectMain ? '主圖' : '無主圖'}{directExtraCount > 0 ? `＋${directExtraCount} 張` : ''}</div>
                                )}
                                {descriptionPhotoCount > 0 && (
                                  <div className={descriptionOnSecondary ? 'text-red-700' : 'text-violet-700'}>
                                    介紹 {descriptionPhotoCount} 張{descriptionOnSecondary ? '（請改用主商品型號）' : ''}
                                  </div>
                                )}
                              </div>
                            ) : (r.main_image_url || r.image_urls.length > 0) ? (
                              <span className="text-blue-700">Excel 網址</span>
                            ) : (
                              <span className="text-gray-400">未提供</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-600">
                            {r.product.list_price != null ? Number(r.product.list_price).toLocaleString() : '—'}
                          </td>
                          <td className="px-2 py-2">
                            {r.matchedId ? (
                              <span className="text-blue-700">
                                已存在（{r.matchedBy}）
                                <div className="text-gray-400 truncate max-w-[150px]">{r.matchedName}</div>
                              </span>
                            ) : (
                              <span className="text-green-700">新產品</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {bad ? (
                              <span className="text-red-600 font-medium">無法匯入</span>
                            ) : (
                              <div className="flex gap-1">
                                {(['insert', 'update', 'skip'] as Action[]).map(a => {
                                  const disabled = (a === 'update' && !r.matchedId)
                                  const label = a === 'insert' ? '新增' : a === 'update' ? '更新' : '跳過'
                                  const on = r.action === a
                                  const color = a === 'insert' ? 'bg-green-600' : a === 'update' ? 'bg-blue-600' : 'bg-gray-500'
                                  return (
                                    <button
                                      key={a}
                                      disabled={disabled}
                                      onClick={() => setAction(r.rowNo, a)}
                                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors
                                        ${on ? `${color} text-white border-transparent` : 'border-gray-200 text-gray-600 hover:bg-gray-50'}
                                        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                「新增」既有產品會建立一筆重複資料（型號若重複，資料庫可能擋下）；建議既有產品選「更新」。
              </p>
            </div>
          )}

          {/* ── Step 3：結果 ── */}
          {step === 3 && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="text-green-600" />
                <div className="text-sm text-gray-700">
                  匯入完成：新增 <b className="text-green-700">{result.inserted}</b> 筆、
                  更新 <b className="text-blue-700">{result.updated}</b> 筆
                  {result.failed > 0 && <>、失敗 <b className="text-red-600">{result.failed}</b> 筆</>}
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left w-10">列</th>
                      <th className="px-2 py-2 text-left">產品</th>
                      <th className="px-2 py-2 text-left w-20">結果</th>
                      <th className="px-2 py-2 text-left">說明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.results.map((r: any) => (
                      <tr key={r.rowNo} className={r.ok ? '' : 'bg-red-50/50'}>
                        <td className="px-2 py-2 text-gray-400">{r.rowNo}</td>
                        <td className="px-2 py-2 text-gray-900">{r.name}</td>
                        <td className="px-2 py-2">
                          {r.ok
                            ? <span className={r.action === 'insert' ? 'text-green-700' : 'text-blue-700'}>{r.action === 'insert' ? '已新增' : '已更新'}</span>
                            : <span className="text-red-600">失敗</span>}
                        </td>
                        <td className="px-2 py-2 text-gray-500">{r.error ?? r.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <div className="text-xs text-gray-400">
            {fileName}{photoFiles.length > 0 ? ` · ${photoFiles.length} 張照片` : ''}
          </div>
          <div className="flex gap-2">
            {step === 2 && (
              <>
                <button onClick={resetSelection} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  重新選擇檔案
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || willImport === 0}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {importing && <Loader2 size={14} className="animate-spin" />}
                  {importing
                    ? uploadProgress
                      ? `上傳照片 ${uploadProgress.done}/${uploadProgress.total}`
                      : '寫入產品中…'
                    : `確認匯入 ${willImport} 筆`}
                </button>
              </>
            )}
            {step !== 2 && (
              <button onClick={onClose} className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-medium">
                {step === 3 ? '完成' : '關閉'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
