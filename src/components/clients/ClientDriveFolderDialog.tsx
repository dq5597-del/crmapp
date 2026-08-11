'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Folder, Loader2, RotateCcw, X } from 'lucide-react'
import {
  assignClientDriveFolder,
  ClientDriveFolderResult,
  DriveFolderOption,
  listClientDriveFolders,
  resetClientDriveFolder,
} from '@/lib/client-drive-folder'

type BreadcrumbItem = DriveFolderOption

interface ClientDriveFolderDialogProps {
  clientId: string
  clientName: string
  currentPath: string | null
  isCustom: boolean
  onClose: () => void
  onSaved: (folder: ClientDriveFolderResult) => void
}

const ROOT_FOLDER: BreadcrumbItem = { id: 'root', name: '我的雲端硬碟' }

export default function ClientDriveFolderDialog({
  clientId,
  clientName,
  currentPath,
  isCustom,
  onClose,
  onSaved,
}: ClientDriveFolderDialogProps) {
  const [folders, setFolders] = useState<DriveFolderOption[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([ROOT_FOLDER])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const browseTo = useCallback(async (folder: BreadcrumbItem, nextBreadcrumbs: BreadcrumbItem[]) => {
    setLoading(true)
    setError('')
    try {
      const items = await listClientDriveFolders(folder.id)
      setFolders(items)
      setBreadcrumbs(nextBreadcrumbs)
    } catch (browseError: any) {
      setError(browseError?.message ?? '讀取 Google Drive 資料夾失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void browseTo(ROOT_FOLDER, [ROOT_FOLDER])
  }, [browseTo])

  async function handleAssign() {
    const selected = breadcrumbs[breadcrumbs.length - 1]
    if (!selected || selected.id === 'root' || saving) return
    setSaving(true)
    setError('')
    try {
      const result = await assignClientDriveFolder(clientId, selected.id)
      onSaved(result)
      onClose()
    } catch (saveError: any) {
      setError(saveError?.message ?? '儲存資料夾位置失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const result = await resetClientDriveFolder(clientId)
      onSaved(result)
      onClose()
    } catch (resetError: any) {
      setError(resetError?.message ?? '恢復預設資料夾失敗')
    } finally {
      setSaving(false)
    }
  }

  const selected = breadcrumbs[breadcrumbs.length - 1]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="drive-folder-dialog-title">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="drive-folder-dialog-title" className="font-semibold text-gray-900">設定客戶資料夾位置</h2>
            <p className="mt-0.5 text-sm text-gray-500">{clientName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="關閉資料夾設定">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-blue-800">
              <span className="font-medium">目前指派：</span>
              {isCustom ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs">自訂位置</span> : <span className="rounded-full bg-white px-2 py-0.5 text-xs">系統預設</span>}
            </div>
            <p className="mt-1 break-all text-blue-700">{currentPath ?? '尚未建立，開啟時會自動建立預設資料夾'}</p>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">瀏覽 Google Drive 並選擇正確資料夾</div>
            <div className="flex flex-wrap items-center gap-1 rounded-t-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.id} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight size={14} className="text-gray-400" />}
                  <button
                    type="button"
                    onClick={() => browseTo(crumb, breadcrumbs.slice(0, index + 1))}
                    disabled={loading || saving}
                    className="max-w-48 truncate rounded px-1.5 py-1 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    title={crumb.name}
                  >
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>

            <div className="min-h-64 max-h-80 overflow-y-auto rounded-b-xl border-x border-b border-gray-200">
              {loading ? (
                <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" />讀取資料夾中…
                </div>
              ) : folders.length === 0 ? (
                <div className="flex min-h-64 items-center justify-center text-sm text-gray-400">這個位置沒有子資料夾</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => browseTo(folder, [...breadcrumbs, folder])}
                      disabled={saving}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <Folder size={17} className="shrink-0 text-amber-500" />
                      <span className="flex-1 truncate">{folder.name}</span>
                      <ChevronRight size={15} className="shrink-0 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <p className="text-xs text-gray-500">變更只會更新 CRM 的資料夾指派，不會移動或刪除原本的 Google Drive 資料夾。</p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw size={14} />恢復預設位置
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:flex-none">取消</button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={saving || loading || selected?.id === 'root'}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              使用目前資料夾
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
