'use client'

import { useMemo, useState } from 'react'
import { Package, Search, X } from 'lucide-react'
import type { Product } from '@/types'

export type ProductHierarchyValue = {
  product_type: 'main' | 'child'
  parent_product_id: string | null
  variant_attribute_name: string
  variant_value: string
}

type Props = {
  products: Product[]
  editingId: string | 'new'
  value: ProductHierarchyValue
  onChange: (patch: Partial<ProductHierarchyValue>) => void
}

const inputClass = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function productLabel(product: Product): string {
  return [product.brand, product.product_name, product.model ? `(${product.model})` : ''].filter(Boolean).join(' ')
}

export default function ProductHierarchyFields({ products, editingId, value, onChange }: Props) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selectedParent = products.find(product => product.id === value.parent_product_id) ?? null
  const candidates = useMemo(() => {
    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    return products
      .filter(product => product.id !== editingId && (product.product_type ?? 'main') === 'main')
      .filter(product => {
        if (terms.length === 0) return true
        const haystack = [product.brand, product.product_name, product.model, product.product_code]
          .filter(Boolean).join(' ').toLocaleLowerCase()
        return terms.every(term => haystack.includes(term))
      })
      .slice(0, 12)
  }, [editingId, products, search])
  const childCount = editingId === 'new'
    ? 0
    : products.filter(product => product.parent_product_id === editingId).length

  function chooseType(productType: 'main' | 'child') {
    if (productType === 'child' && childCount > 0) return
    setSearch('')
    setOpen(false)
    onChange({ product_type: productType, parent_product_id: null })
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Package size={16} className="text-blue-600" />
        <div>
          <div className="text-sm font-semibold text-blue-900">主商品／子商品</div>
          <div className="text-[11px] text-blue-700/70">子商品保有自己的型號、價格、條碼與庫存，並連結到一筆主商品。</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        {(['main', 'child'] as const).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => chooseType(type)}
            disabled={type === 'child' && childCount > 0}
            aria-pressed={value.product_type === type}
            title={type === 'child' && childCount > 0 ? '此主商品已有子商品，不能再改成子商品' : undefined}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition ${value.product_type === type
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'} disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-100 disabled:text-gray-400`}
          >
            {type === 'main' ? '主商品' : '子商品'}
          </button>
        ))}
      </div>

      {value.product_type === 'main' ? (
        <div className="mt-3 text-xs text-gray-500">
          主商品可被多個子商品引用。{childCount > 0 ? `目前已有 ${childCount} 個子商品。` : '例如先建立「移動式擴音器」，再建立紅色、白色子商品。'}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <label className="mb-1 block text-xs text-gray-600">所屬主商品 *</label>
            {selectedParent ? (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{productLabel(selectedParent)}</div>
                  {selectedParent.product_code && <div className="text-[11px] font-mono text-gray-400">{selectedParent.product_code}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => { onChange({ parent_product_id: null }); setSearch(''); setOpen(true) }}
                  title="重新選擇主商品"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <>
                <Search size={15} className="absolute left-3 top-[34px] text-gray-400" />
                <input
                  value={search}
                  onChange={event => { setSearch(event.target.value); setOpen(true) }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  placeholder="搜尋主商品名稱、品牌、型號或料號"
                  className={`${inputClass} pl-9`}
                  autoComplete="off"
                />
                {open && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                    {candidates.length > 0 ? candidates.map(product => (
                      <button
                        key={product.id}
                        type="button"
                        onMouseDown={() => {
                          onChange({ parent_product_id: product.id })
                          setSearch('')
                          setOpen(false)
                        }}
                        className="block min-h-11 w-full border-b border-gray-50 px-3 py-2.5 text-left last:border-0 hover:bg-blue-50"
                      >
                        <div className="text-sm font-medium text-gray-900">{productLabel(product)}</div>
                        <div className="mt-0.5 text-[11px] text-gray-400">{product.product_code || '無公司料號'}｜庫存 {product.stock_qty}</div>
                      </button>
                    )) : (
                      <div className="px-3 py-6 text-center text-xs text-gray-400">找不到可選的主商品</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-600">子商品區分欄位</label>
              <input
                value={value.variant_attribute_name}
                onChange={event => onChange({ variant_attribute_name: event.target.value })}
                className={inputClass}
                placeholder="顏色"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">此子商品選項 *</label>
              <input
                value={value.variant_value}
                onChange={event => onChange({ variant_value: event.target.value })}
                className={inputClass}
                placeholder="例如：紅色、白色"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
