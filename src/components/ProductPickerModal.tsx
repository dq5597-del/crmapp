'use client'


import { useEffect, useMemo, useState } from 'react'
import { X, Search, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'


const PAGE_SIZE = 10


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
  const [brand, setBrand] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())


  const catOf = (p: any) => p.product_categories?.main_category ?? '未分類'
  const subOf = (p: any) => p.product_categories?.sub_category ?? '未分類'


  const mainCats = useMemo(() => Array.from(new Set(products.map(catOf))), [products])
  const subCats = useMemo(() => {
    const list = mainCat ? products.filter(p => catOf(p) === mainCat) : products
    return Array.from(new Set(list.map(subOf)))
  }, [products, mainCat])
  const brands = useMemo(() => {
    const seen = new Map<string, string>()
    for (const product of products) {
      const value = (product.brand ?? '').trim()
      if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value)
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  }, [products])

  const filtered = useMemo(() => {
    let list = products
    if (mainCat) list = list.filter(p => catOf(p) === mainCat)
    if (subCat) list = list.filter(p => subOf(p) === subCat)
    if (brand) list = list.filter(p => (p.brand ?? '').trim().toLowerCase() === brand.toLowerCase())
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(p =>
        p.product_name.toLowerCase().includes(q) ||
        (p.model?.toLowerCase() ?? '').includes(q) ||
        (p.brand?.toLowerCase() ?? '').includes(q) ||
        (p.product_code?.toLowerCase() ?? '').includes(q))
    }
    return list
  }, [products, mainCat, subCat, brand, search])


  // 分頁：一頁 10 筆。勾選狀態存在 selected(Set<id>) 且 handleConfirm 從 products
  // 全集取回，因此翻頁不會掉勾選。
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))


  // 搜尋／分類一變動就回第 1 頁，否則會停在已不存在的頁碼變成空白
  useEffect(() => { setPage(1) }, [mainCat, subCat, brand, search])
  // 防呆：篩選後總頁數變少時把 page 拉回範圍內
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])


  const paged = useMemo(
