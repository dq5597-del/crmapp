export type PurchaseOptionSelectionMode = 'single' | 'multiple'

export type ProductPurchaseOptionValue = {
  id?: string
  label: string
  price_adjustment: number
  is_default: boolean
}

export type ProductPurchaseOptionGroup = {
  id?: string
  name: string
  description: string
  selection_mode: PurchaseOptionSelectionMode
  is_required: boolean
  options: ProductPurchaseOptionValue[]
}

export function blankPurchaseOptionGroup(): ProductPurchaseOptionGroup {
  return {
    name: '配件選擇',
    description: '',
    selection_mode: 'single',
    is_required: true,
    options: [
      { label: '', price_adjustment: 0, is_default: false },
      { label: '', price_adjustment: 0, is_default: false },
    ],
  }
}

export function normalizedPurchaseOptionGroups(groups: ProductPurchaseOptionGroup[]) {
  return groups.map(group => ({
    ...group,
    name: group.name.trim(),
    description: group.description.trim(),
    options: group.options.map(option => ({
      ...option,
      label: option.label.trim(),
      price_adjustment: Math.max(0, Number(option.price_adjustment) || 0),
    })).filter(option => option.label),
  })).filter(group => group.name && group.options.length > 0)
}

export function validatePurchaseOptionGroups(groups: ProductPurchaseOptionGroup[]): string | null {
  for (const group of groups) {
    if (!group.name.trim()) return '每個購買選項群組都要填寫名稱。'
    const labels = group.options.map(option => option.label.trim()).filter(Boolean)
    if (labels.length < 2) return `「${group.name.trim()}」至少需要兩個選項。`
    if (new Set(labels.map(label => label.toLocaleLowerCase('zh-TW'))).size !== labels.length) {
      return `「${group.name.trim()}」有重複選項。`
    }
    if (group.options.some(option => Number(option.price_adjustment) < 0)) {
      return `「${group.name.trim()}」的加價不可小於 0。`
    }
    if (group.selection_mode === 'single' && group.options.filter(option => option.is_default).length > 1) {
      return `「${group.name.trim()}」的單選群組只能有一個預設值。`
    }
  }
  return null
}

export function purchaseOptionsForWoo(groups: ProductPurchaseOptionGroup[]) {
  return normalizedPurchaseOptionGroups(groups).map(group => ({
    name: group.name,
    description: group.description,
    selection_mode: group.selection_mode,
    required: group.is_required,
    options: group.options.map(option => ({
      label: option.label,
      price_adjustment: option.price_adjustment,
      default: option.is_default,
    })),
  }))
}
