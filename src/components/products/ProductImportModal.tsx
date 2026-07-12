'use client'

import { useMemo, useRef, useState } from 'react'
import {
  X, Upload, Download, ChevronRight, FileSpreadsheet,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
} from 'lucide-react'
import type { ParsedRow } from '@/lib/product-import'

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
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function handleFile(file: File) {
    setError('')
    setParsing(true)
    setFileName(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/products/import/parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '解析失敗')

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
      const items = rows
        .filter(r => r.action !== 'skip' && r.errors.length === 0)
        .map(r => ({
          rowNo: r.rowNo,
          action: r.action,
          productId: r.matchedId,
          product: r.product,
          features: r.features,
          main_image_url: r.main_image_url,
          image_urls: r.image_urls,
        }))
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
    }
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
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
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
                    <FileSpreadsheet size={32} className="text-gray-300" />
                    <div className="text-sm text-gray-600">點此選擇檔案，或直接把檔案拖進來</div>
                    <div className="text-xs text-gray-400">支援 .xlsx / .csv，單次最多 1000 筆</div>
                  </div>
                )}
              </div>
              <input
                ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
              />

              <ul className="text-xs text-gray-500 space-y-1 leading-relaxed">
                <li>• 比對既有產品的依據：<b>型號</b> →（找不到再看）<b>官網SKU</b>，不分大小寫。</li>
                <li>• 下一步會逐筆列出「新增／更新／跳過」，確認後才會真的寫入。</li>
                <li>• 圖片欄位填公開的 http(s) 網址，匯入時自動轉存 Google Drive。</li>
                <li>• 更新既有產品時<b>不會覆蓋庫存數量</b>。</li>
              </ul>
            </div>
          )}

          {/* ── Step 2：預覽 ── */}
          {step === 2 && (
            <div className="space-y-3">
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
                      <th className="px-2 py-2 text-right w-20">建議售價</th>
                      <th className="px-2 py-2 text-left w-40">比對結果</th>
                      <th className="px-2 py-2 text-left w-44">動作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(r => {
                      const bad = r.errors.length > 0
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
          <div className="text-xs text-gray-400">{fileName}</div>
          <div className="flex gap-2">
            {step === 2 && (
              <>
                <button onClick={() => { setStep(1); setRows([]); setError('') }} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  重新選擇檔案
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || willImport === 0}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {importing && <Loader2 size={14} className="animate-spin" />}
                  {importing ? '匯入中…' : `確認匯入 ${willImport} 筆`}
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
