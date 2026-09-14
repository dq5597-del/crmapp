'use client'

import { Hash, Tag, Pencil } from 'lucide-react'
import type { ProductFilterGroup } from '@/lib/product-filters'

/**
 * 產品 Tags 與篩選規格欄位
 * 依「官網小類」顯示該類別專用的 Tags（多選）與數值規格（number）。
 * 同一商品最多 20 個 Tag；single 模式的群組會互斥，選新的自動換掉同群組舊的。
 */

const MAX_SELECTED_OPTIONS = 20

type Props = {
  groups: ProductFilterGroup[]
  hasSelectedCategory: boolean
  selectedOptionIds: string[]
  numericValues: Record<string, string>
  onSelectedOptionIdsChange: (value: string[]) => void
  onNumericValuesChange: (value: Record<string, string>) => void
  activeCategoryLabel?: string
  onManage?: () => void
}

export default function ProductFilterFields({
  groups,
  hasSelectedCategory,
  selectedOptionIds,
  numericValues,
  onSelectedOptionIdsChange,
  onNumericValuesChange,
  activeCategoryLabel,
  onManage,
}: Props) {
  const selected = new Set(selectedOptionIds)
  const multiGroups = groups.filter(group => group.input_type === 'multi_select')
  const numberGroups = groups.filter(group => group.input_type === 'number')

  function toggleOption(group: ProductFilterGroup, optionId: string) {
    if (selected.has(optionId)) {
      onSelectedOptionIdsChange(selectedOptionIds.filter(id => id !== optionId))
      return
    }
    const groupOptionIds = new Set(group.options.map(option => option.id))
    const retained = group.selection_mode === 'single'
      ? selectedOptionIds.filter(id => !groupOptionIds.has(id))
      : selectedOptionIds
    onSelectedOptionIdsChange([...retained, optionId].slice(0, MAX_SELECTED_OPTIONS))
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800">
            <Tag size={13} /> 產品 Tags 與篩選規格
          </div>
          <p className="mt-1 text-[11px] text-violet-600">
            {activeCategoryLabel ? `目前套用：${activeCategoryLabel}。` : ''}
            同一商品可選多個 Tags；型錄會同步建立「_篩選器／群組／Tag」捷徑。
          </p>
        </div>
        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
          >
            <Pencil size={12} />編輯篩選內容
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-violet-200 bg-white p-3 text-xs text-violet-600">
          {hasSelectedCategory
            ? '此官網小類尚未設定專用篩選器，可點右上方「編輯篩選內容」直接新增。'
            : '請先選擇官網小類；系統會顯示該類別專用的 Tags 與數值規格。'}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {multiGroups.map(group => (
          <fieldset key={group.id} className="rounded-lg border border-violet-100 bg-white p-2.5">
            <legend className="px-1 text-[11px] font-medium text-gray-600">{group.name}</legend>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map(option => {
                const isOn = selected.has(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => toggleOption(group, option.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      isOn
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300'
                    }`}
                  >
                    {option.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {numberGroups.map(group => (
          <label key={group.id} className="block">
            <span className="mb-1 flex items-center gap-1 text-[11px] text-gray-600">
              <Hash size={11} />{group.name}
            </span>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={numericValues[group.id] ?? ''}
                onChange={e => onNumericValuesChange({ ...numericValues, [group.id]: e.target.value })}
                placeholder="未設定"
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              />
              {group.unit ? (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                  {group.unit}
                </span>
              ) : null}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
