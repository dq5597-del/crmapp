export type ProductFilterInputType = 'multi_select' | 'number'

export type ProductFilterOption = {
  id: string
  group_id: string
  name: string
  slug: string
  aliases: string[]
  sort_order: number
  is_active: boolean
}
export type ProductFilterGroup = {
  id: string
  name: string
  slug: string
  input_type: ProductFilterInputType
  unit: string | null
  sort_order: number
  is_active: boolean
  options: ProductFilterOption[]
}

export type ProductNumberMap = Record<string, Record<string, number>>

export type ProductCategorySource = {
  category?: {
    main_category?: string | null
    mid_category?: string | null
    sub_category?: string | null
  } | null
  web_categories?: string[] | null
  web_category?: string | null
}

export function resolveProductCategory(product: ProductCategorySource) {
  const internalMain = product.category?.main_category?.trim() ?? ''
  const internalSub = product.category?.sub_category?.trim()
    || product.category?.mid_category?.trim()
    || ''
  if (internalMain) return { main: internalMain, sub: internalSub }

  const fallback = product.web_categories?.[0] || product.web_category || ''
  if (!fallback) return { main: '未分類', sub: '' }
  const [main, sub = ''] = fallback.includes(' > ')
    ? fallback.split(' > ', 2)
    : [fallback, '']
  return { main: main.trim(), sub: sub.trim() }
}

export function buildFilterGroups(groups: any[], options: any[]): ProductFilterGroup[] {
  const byGroup = new Map<string, ProductFilterOption[]>()
  for (const option of options) {
    const rows = byGroup.get(option.group_id) ?? []
    rows.push({ ...option, aliases: Array.isArray(option.aliases) ? option.aliases : [] })
    byGroup.set(option.group_id, rows)
  }
  return groups
    .filter(group => group.is_active !== false)
    .map(group => ({
      ...group,
      options: (byGroup.get(group.id) ?? [])
        .filter(option => option.is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-Hant')),
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-Hant'))
}

export function buildProductOptionMap(rows: any[]): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const row of rows) {
    if (!result[row.product_id]) result[row.product_id] = []
    result[row.product_id].push(row.option_id)
  }
  return result
}

export function buildProductNumberMap(rows: any[]): ProductNumberMap {
  const result: ProductNumberMap = {}
  for (const row of rows) {
    if (!result[row.product_id]) result[row.product_id] = {}
    result[row.product_id][row.group_id] = Number(row.numeric_value)
  }
  return result
}

export function matchesGroupedOptions(
  productOptionIds: string[],
  selectedOptionIds: string[],
  groups: ProductFilterGroup[],
): boolean {
  if (selectedOptionIds.length === 0) return true
  const productSet = new Set(productOptionIds)
  const selectedSet = new Set(selectedOptionIds)
  return groups
    .filter(group => group.input_type === 'multi_select')
    .every(group => {
      const groupSelections = group.options.filter(option => selectedSet.has(option.id))
      return groupSelections.length === 0 || groupSelections.some(option => productSet.has(option.id))
    })
}

export function matchesNumberRanges(
  productValues: Record<string, number> | undefined,
  ranges: Record<string, { min: string; max: string }>,
): boolean {
  return Object.entries(ranges).every(([groupId, range]) => {
    if (!range.min && !range.max) return true
    const value = productValues?.[groupId]
    if (value == null || Number.isNaN(value)) return false
    if (range.min && value < Number(range.min)) return false
    if (range.max && value > Number(range.max)) return false
    return true
  })
}
