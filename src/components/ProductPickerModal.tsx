'use client'

import { useMemo, useState } from 'react'
import { X, Search, Plus } from 'lucide-react'

/**
 * 選擇產品彈出視窗（多選）。
 * 桌機：左大分類｜中小分類｜右產品清單（單價/庫存）。
 * 手機：分類改兩排橫向捲動膠囊，清單直列。
 * 「＋ 新增產品」在右上角，點了由宿主開快速新增視窗。
 */
export default function ProductPickerModal({
  products, onClose, onConfirm, onQuickAdd, confirmLabel = '帶入',
}: {
  products: any[]
  onClose: () => void
  onConfirm: (selected: any[]) => void
  onQuickAdd?: (searchText: string) => void
  confirmLabel?: string
}) {
  const [mainCat, setMainCat] = useState('')   // '' = 全部
  const [subCat, setSubCat] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const catOf = (p: any) => p.product_categories?.main_category ?? '未分類'
  const subOf = (p: any) => p.product_categories?.sub_category ?? '未分類'

  const mainCats = useMemo(() => Array.from(new Set(products.map(catOf))), [products])
  const subCats = useMemo(() => {
    const list = mainCat ? products.filter(p => catOf(p) === mainCat) : products
    return Array.from(new Set(list.map(subOf)))
  }, [products, mainCat])

  const filtered = useMemo(() => {
    let list = products
    if (mainCat) list = list.filter(p => catOf(p) === mainCat)
    if (subCat) list = list.filter(p => subOf(p) === subCat)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(p =>
        p.product_name.toLowerCase().includes(q) ||
        (p.model?.toLowerCase() ?? '').includes(q) ||
        (p.brand?.toLowerCase() ?? '').includes(q))
    }
    return list
  }, [products, mainCat, subCat, search])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleConfirm() {
    const picked = products.filter(p => selected.has(p.id))
    if (picked.length === 0) return
    onConfirm(picked)
  }

  const fmt = (n: number) => Number(n || 0).toLocaleString('zh-TW')

  const catBtn = (active: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg text-sm transition ${active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`
  const chip = (active: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-full text-xs border transition ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'}`

  const ProductRow = ({ p }: { p: any }) => (
    <label className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 cursor-pointer ${selected.has(p.id) ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}>
      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-blue-600 w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-900 truncate">{p.product_name}</div>
        <div className="text-[11px] text-gray-400 truncate">{[p.brand, p.model].filter(Boolean).join('　') || '—'}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-medium text-gray-900">{fmt(p.list_price)}</div>
        <div className={`text-[11px] ${Number(p.stock_qty) <= 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>庫存 {p.stock_qty ?? 0}</div>
      </div>
    </label>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="font-semibold text-gray-900 whitespace-nowrap text-sm sm:text-base">選擇產品<span className="hidden sm:inline">（可多選）</span></h3>
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋品名／型號／品牌…"
              className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          </div>
          {onQuickAdd && (
            <button onClick={() => onQuickAdd(search.trim())}
              className="shrink-0 flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-2 rounded-lg whitespace-nowrap">
              <Plus size={13} /> 新增<span className="hidden sm:inline">產品</span>
            </button>
          )}
          <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* 手機版分類（橫向膠囊，lg 隱藏） */}
        <div className="lg:hidden shrink-0 border-b border-gray-100">
          <div className="flex gap-1.5 px-3 pt-2.5 pb-1 overflow-x-auto">
            <button onClick={() => { setMainCat(''); setSubCat('') }} className={chip(!mainCat)}>全部</button>
            {mainCats.map(m => (
              <button key={m} onClick={() => { setMainCat(m === mainCat ? '' : m); setSubCat('') }} className={chip(mainCat === m)}>{m}</button>
            ))}
          </div>
          <div className="flex gap-1.5 px-3 pt-1 pb-2.5 overflow-x-auto">
            <button onClick={() => setSubCat('')} className={chip(!subCat)}>全部小類</button>
            {subCats.map(s => (
              <button key={s} onClick={() => setSubCat(s === subCat ? '' : s)} className={chip(subCat === s)}>{s}</button>
            ))}
          </div>
        </div>

        {/* 內容區 */}
        <div className="flex-1 min-h-0 flex">
          {/* 桌機左：大分類 */}
          <div className="hidden lg:block w-36 border-r border-gray-100 overflow-y-auto p-2 shrink-0">
            <div className="text-[11px] text-gray-400 px-2 py-1">大分類</div>
            <button onClick={() => { setMainCat(''); setSubCat('') }} className={catBtn(!mainCat)}>全部</button>
            {mainCats.map(m => (
              <button key={m} onClick={() => { setMainCat(m === mainCat ? '' : m); setSubCat('') }} className={catBtn(mainCat === m)}>{m}</button>
            ))}
          </div>
          {/* 桌機中：小分類 */}
          <div className="hidden lg:block w-36 border-r border-gray-100 overflow-y-auto p-2 shrink-0">
            <div className="text-[11px] text-gray-400 px-2 py-1">小分類</div>
            <button onClick={() => setSubCat('')} className={catBtn(!subCat)}>全部</button>
            {subCats.map(s => (
              <button key={s} onClick={() => setSubCat(s === subCat ? '' : s)} className={catBtn(subCat === s)}>{s}</button>
            ))}
          </div>
          {/* 產品清單 */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-12">
                找不到符合的產品
                {onQuickAdd && search.trim() && (
                  <div className="mt-2">
                    <button onClick={() => onQuickAdd(search.trim())} className="text-blue-600 hover:underline text-sm">
                      ＋ 新增「{search.trim()}」到產品資料庫
                    </button>
                  </div>
                )}
              </div>
            ) : (
              filtered.map(p => <ProductRow key={p.id} p={p} />)
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 shrink-0">
          <span className="text-sm text-blue-700 font-medium">{selected.size > 0 ? `已選 ${selected.size} 項` : '尚未選取'}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
            <button onClick={handleConfirm} disabled={selected.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {confirmLabel}（{selected.size}）
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
