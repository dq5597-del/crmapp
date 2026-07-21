'use client'

/**
 * 品牌輸入欄（2026-07 新增）— 估價單/銷貨單/訂購單/產品建檔共用
 * - 品牌清單自 products 表歸納（去重、A-Z 排序），全站共用一份快取
 * - 打字即前綴搜尋（輸入 Y → YAMAHA...），點選帶入，確保拼法一致
 * - 清單沒有的顯示「＋ 新增品牌」，直接使用新名稱
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

let brandCache: string[] | null = null

export function addBrandToCache(b: string) {
  const v = (b ?? '').trim()
  if (!v || !brandCache) return
  if (!brandCache.some(x => x.toLowerCase() === v.toLowerCase())) {
    brandCache = [...brandCache, v].sort((a, c) => a.localeCompare(c, 'en', { sensitivity: 'base' }))
  }
}

export default function BrandInput({ value, onChange, className, placeholder = '品牌' }: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const supabase = createClient()
  const [brands, setBrands] = useState<string[]>(brandCache ?? [])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (brandCache) { setBrands(brandCache); return }
    supabase.from('products').select('brand').not('brand', 'is', null).then(({ data }) => {
      const list = [...new Set((data ?? []).map((r: any) => (r.brand ?? '').trim()).filter(Boolean))]
        .sort((a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      brandCache = list
      setBrands(list)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = (value ?? '').trim().toLowerCase()
  const hits = brands.filter(b => !q || b.toLowerCase().startsWith(q)).slice(0, 12)
  const exact = brands.some(b => b.toLowerCase() === q)

  return (
    <div className="relative">
      <input value={value}
        onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); addBrandToCache(value) }, 150)}
        className={className} placeholder={placeholder} autoComplete="off" />
      {open && (hits.length > 0 || (q && !exact)) && (
        <div className="absolute left-0 top-full mt-1 min-w-[150px] bg-white border border-gray-200 rounded-lg shadow-lg z-40 max-h-44 overflow-y-auto">
          {hits.map(b => (
            <button key={b} type="button" onMouseDown={() => { onChange(b); setOpen(false) }}
              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-blue-50">{b}</button>
          ))}
          {q && !exact && (
            <button type="button" onMouseDown={() => setOpen(false)}
              className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 border-t border-gray-100">
              ＋ 新增品牌「{value}」
            </button>
          )}
        </div>
      )}
    </div>
  )
}
