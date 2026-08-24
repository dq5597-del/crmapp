'use client'

import { CircleDollarSign, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { blankPurchaseOptionGroup, type ProductPurchaseOptionGroup } from '@/lib/product-purchase-options'

type Props = {
  groups: ProductPurchaseOptionGroup[]
  onChange: (groups: ProductPurchaseOptionGroup[]) => void
}

export default function ProductPurchaseOptionFields({ groups, onChange }: Props) {
  function updateGroup(index: number, patch: Partial<ProductPurchaseOptionGroup>) {
    onChange(groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group))
  }

  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<ProductPurchaseOptionGroup['options'][number]>) {
    const group = groups[groupIndex]
    let options = group.options.map((option, index) => index === optionIndex ? { ...option, ...patch } : option)
    if (patch.is_default && group.selection_mode === 'single') {
      options = options.map((option, index) => ({ ...option, is_default: index === optionIndex }))
    }
    updateGroup(groupIndex, { options })
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <ShoppingCart size={14} /> 客戶購買選項／配件
          </div>
          <p className="mt-1 text-[11px] text-amber-700">顯示在官網加入購物車前；客戶的選擇會保存到購物車與訂單。</p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...groups, blankPurchaseOptionGroup()])}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
        >
          <Plus size={12} /> 新增欄位
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-200 bg-white p-3 text-xs text-amber-700">
          此商品沒有購買選項。可新增「麥克風類型」，再加入「手持麥克風／頭戴式麥克風」。
        </div>
      ) : null}

      {groups.map((group, groupIndex) => (
        <section key={group.id ?? `new-${groupIndex}`} className="rounded-lg border border-amber-200 bg-white p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
            <input
              value={group.name}
              onChange={event => updateGroup(groupIndex, { name: event.target.value })}
              placeholder="欄位名稱，例如：麥克風類型"
              maxLength={80}
              className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            />
            <select
              value={group.selection_mode}
              onChange={event => {
                const selectionMode = event.target.value === 'multiple' ? 'multiple' : 'single'
                const firstDefault = group.options.findIndex(option => option.is_default)
                updateGroup(groupIndex, {
                  selection_mode: selectionMode,
                  options: selectionMode === 'single' && firstDefault >= 0
                    ? group.options.map((option, index) => ({ ...option, is_default: index === firstDefault }))
                    : group.options,
                })
              }}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="single">單選</option>
              <option value="multiple">可複選</option>
            </select>
            <button type="button" onClick={() => onChange(groups.filter((_, index) => index !== groupIndex))} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="刪除購買選項群組">
              <Trash2 size={15} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <input type="checkbox" checked={group.is_required} onChange={event => updateGroup(groupIndex, { is_required: event.target.checked })} className="accent-amber-600" />
              客戶必須選擇
            </label>
            <input
              value={group.description}
              onChange={event => updateGroup(groupIndex, { description: event.target.value })}
              placeholder="說明（選填）"
              maxLength={200}
              className="min-w-52 flex-1 border-0 border-b border-gray-200 px-1 py-1 text-[11px] outline-none focus:border-amber-500"
            />
          </div>

          <div className="mt-3 space-y-2">
            {group.options.map((option, optionIndex) => (
              <div key={option.id ?? `new-${groupIndex}-${optionIndex}`} className="grid grid-cols-[auto_1fr_130px_auto] items-center gap-2">
                <label title="預設選項" className="flex items-center">
                  <input type={group.selection_mode === 'single' ? 'radio' : 'checkbox'} name={`purchase-default-${groupIndex}`} checked={option.is_default} onChange={event => updateOption(groupIndex, optionIndex, { is_default: event.target.checked })} className="accent-amber-600" />
                </label>
                <input
                  value={option.label}
                  onChange={event => updateOption(groupIndex, optionIndex, { label: event.target.value })}
                  placeholder={optionIndex === 0 ? '手持麥克風' : '頭戴式麥克風'}
                  maxLength={100}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
                <label className="relative">
                  <CircleDollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="number" min="0" step="1" value={option.price_adjustment} onChange={event => updateOption(groupIndex, optionIndex, { price_adjustment: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded-lg border border-gray-200 py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-amber-500" aria-label="加價金額" />
                </label>
                <button type="button" onClick={() => updateGroup(groupIndex, { options: group.options.filter((_, index) => index !== optionIndex) })} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="刪除選項"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => updateGroup(groupIndex, { options: [...group.options, { label: '', price_adjustment: 0, is_default: false }] })} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900">
            <Plus size={12} /> 新增選項
          </button>
        </section>
      ))}
    </div>
  )
}
