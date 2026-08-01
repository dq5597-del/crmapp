'use client'

/**
 * 共用附件元件（任務清單 / 交辦任務共用）
 *
 * 功能：
 *   - 圖片上傳 + 縮圖預覽（點擊開新分頁看原圖）
 *   - 任意檔案上傳（PDF / Excel / Word …），列表顯示檔名與大小
 *   - Ctrl+V 直接貼上截圖（capturePaste=true 時掛 window paste 監聽）
 *   - 拖曳檔案進區塊上傳（支援多檔）
 *
 * 儲存：Supabase Storage bucket `chat-files`（既有 bucket，policy 已驗證可用），
 *       以 folder prefix 區分模組，例如 todos/ 、assigned-tasks/。
 *       附件 metadata 以 jsonb 陣列存在各自資料表的 attachments 欄位。
 *
 * ⚠ Storage object key 只接受 ASCII 安全字元，中文檔名必須經 toStorageSafeName()，
 *   原始檔名另存在 name 欄位供介面顯示（見 src/lib/storage-key.ts）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { toStorageSafeName } from '@/lib/storage-key'
import { Paperclip, Image as ImageIcon, X, FileText, Loader2, Download } from 'lucide-react'

const BUCKET = 'chat-files'
const MAX_SIZE = 20 * 1024 * 1024 // 單檔 20MB

export interface Attachment {
  url: string
  name: string
  type: string
  size: number
  path: string
}

interface Props {
  value: Attachment[]
  onChange: (next: Attachment[]) => void
  /** Storage 子資料夾，例如 'todos' 或 'assigned-tasks' */
  folder: string
  /** 是否攔截 window 的 Ctrl+V 貼上（同一畫面只能有一個為 true） */
  capturePaste?: boolean
  disabled?: boolean
  /** 主色，預設藍色；交辦任務用 orange */
  accent?: 'blue' | 'orange'
}

function isImage(a: Attachment) {
  return a.type?.startsWith('image/')
}

function humanSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AttachmentBox({
  value, onChange, folder, capturePaste = false, disabled = false, accent = 'blue',
}: Props) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // value 用 ref 保存，避免 paste 監聽抓到過期的 closure
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])

  const accentBtn = accent === 'orange'
    ? 'bg-orange-600 hover:bg-orange-700'
    : 'bg-blue-600 hover:bg-blue-700'
  const accentRing = accent === 'orange' ? 'border-orange-400 bg-orange-50' : 'border-blue-400 bg-blue-50'

  const uploadFiles = useCallback(async (files: File[]) => {
    if (disabled || files.length === 0) return
    const accepted = files.filter(f => {
      if (f.size > MAX_SIZE) { alert(`「${f.name}」超過 20MB，請壓縮後再上傳。`); return false }
      return true
    })
    if (accepted.length === 0) return

    setUploading(n => n + accepted.length)
    const done: Attachment[] = []
    for (const file of accepted) {
      try {
        const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${toStorageSafeName(file.name)}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        })
        if (error) throw error
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
        done.push({
          url: data.publicUrl,
          name: file.name || '貼上的圖片.png',
          type: file.type || 'application/octet-stream',
          size: file.size,
          path,
        })
      } catch (e: any) {
        alert(`「${file.name}」上傳失敗：${e?.message ?? e}`)
      } finally {
        setUploading(n => n - 1)
      }
    }
    if (done.length > 0) onChange([...valueRef.current, ...done])
  }, [disabled, folder, onChange, supabase])

  // Ctrl+V 貼上截圖
  useEffect(() => {
    if (!capturePaste || disabled) return
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const files = items
        .filter(i => i.kind === 'file')
        .map(i => i.getAsFile())
        .filter((f): f is File => !!f)
      if (files.length === 0) return
      e.preventDefault()
      // 截圖的 File.name 常是 image.png，補上時間讓檔名可辨識
      uploadFiles(files.map(f =>
        f.name && f.name !== 'image.png'
          ? f
          : new File([f], `截圖_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`, { type: f.type })
      ))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [capturePaste, disabled, uploadFiles])

  async function removeAt(idx: number) {
    const a = value[idx]
    if (!a) return
    if (!confirm(`移除附件「${a.name}」？`)) return
    // 先從清單移除（畫面即時反應），再嘗試刪除 storage 實體檔
    onChange(value.filter((_, i) => i !== idx))
    if (a.path) await supabase.storage.from(BUCKET).remove([a.path]).catch(() => {})
  }

  return (
    <div
      onDragOver={e => { if (!disabled) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        if (disabled) return
        e.preventDefault(); setDragOver(false)
        uploadFiles(Array.from(e.dataTransfer.files ?? []))
      }}
      className={`rounded-xl border border-dashed p-3 transition-colors ${
        dragOver ? accentRing : 'border-gray-300 bg-gray-50/60'
      }`}
    >
      <input ref={imgRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <input ref={fileRef} type="file" multiple className="hidden"
        onChange={e => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={disabled} onClick={() => imgRef.current?.click()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60 transition-colors ${accentBtn}`}>
          <ImageIcon size={13} /> 上傳圖片
        </button>
        <button type="button" disabled={disabled} onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60 transition-colors">
          <Paperclip size={13} /> 上傳檔案
        </button>
        <span className="text-[11px] text-gray-400">
          可直接 Ctrl+V 貼上截圖，或把檔案拖進這個區塊（單檔上限 20MB）
        </span>
        {uploading > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-500">
            <Loader2 size={12} className="animate-spin" /> 上傳中 {uploading} 個…
          </span>
        )}
      </div>

      {value.length > 0 && (
        <>
          {/* 圖片縮圖 */}
          {value.some(isImage) && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
              {value.map((a, i) => isImage(a) && (
                <div key={a.path || i} className="relative group">
                  <a href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.name}
                      className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                  </a>
                  {!disabled && (
                    <button type="button" onClick={() => removeAt(i)} title="移除"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 shadow text-gray-400 hover:text-red-600 flex items-center justify-center">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 非圖片檔案列表 */}
          {value.some(a => !isImage(a)) && (
            <div className="mt-3 space-y-1.5">
              {value.map((a, i) => !isImage(a) && (
                <div key={a.path || i}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                  <FileText size={14} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-700 truncate flex-1" title={a.name}>{a.name}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{humanSize(a.size)}</span>
                  <a href={a.url} target="_blank" rel="noreferrer" title="下載 / 開啟"
                    className="text-gray-400 hover:text-blue-600 shrink-0"><Download size={13} /></a>
                  {!disabled && (
                    <button type="button" onClick={() => removeAt(i)} title="移除"
                      className="text-gray-300 hover:text-red-600 shrink-0"><X size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
