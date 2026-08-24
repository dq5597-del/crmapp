export type ProductFilterInputType = 'multi_select' | 'number'
export type ProductFilterSelectionMode = 'single' | 'multiple'

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
  selection_mode: ProductFilterSelectionMode
  unit: string | null
  sort_order: number
  is_active: boolean
  options: ProductFilterOption[]
  category_ids: string[]
  category_sort_orders?: Record<string, number>
  woo_attribute_id?: number | null
  woo_attribute_slug?: string | null
  web_sync_enabled?: boolean
  woo_synced_at?: string | null
}

export type ProductNumberMap = Record<string, Record<string, number>>
export type NumericRangePreset = { id: string; label: string; min?: number; max?: number }
export type NumericPresetSelections = Record<string, string[]>
export type CatalogQuotationMethod = 'online' | 'project'

export type CatalogPriceSource = {
  web_sale_price?: number | string | null
}

export type ProductFilterTemplateGroup = { template_id: string; group_id: string; sort_order?: number }
export type ProductCategoryFilterTemplate = { category_id: string; template_id: string }
export type ProductCategoryFilterExclusion = { category_id: string; group_id: string }

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

export function buildFilterGroups(groups: any[], options: any[], categoryMappings: any[] = []): ProductFilterGroup[] {
  const byGroup = new Map<string, ProductFilterOption[]>()
  const categoriesByGroup = new Map<string, string[]>()
  const categorySortOrdersByGroup = new Map<string, Record<string, number>>()
  for (const option of options) {
    const rows = byGroup.get(option.group_id) ?? []
    rows.push({ ...option, aliases: Array.isArray(option.aliases) ? option.aliases : [] })
    byGroup.set(option.group_id, rows)
  }
  for (const mapping of categoryMappings) {
    const rows = categoriesByGroup.get(mapping.group_id) ?? []
    rows.push(mapping.category_id)
    categoriesByGroup.set(mapping.group_id, rows)
    const sortOrders = categorySortOrdersByGroup.get(mapping.group_id) ?? {}
    sortOrders[mapping.category_id] = Math.min(sortOrders[mapping.category_id] ?? Number.MAX_SAFE_INTEGER, mapping.sort_order ?? Number.MAX_SAFE_INTEGER)
    categorySortOrdersByGroup.set(mapping.group_id, sortOrders)
  }
  return groups
    .filter(group => group.is_active !== false)
    .map(group => ({
      ...group,
      selection_mode: group.selection_mode === 'single' ? 'single' : 'multiple',
      options: (byGroup.get(group.id) ?? [])
        .filter(option => option.is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-Hant')),
      category_ids: categoriesByGroup.get(group.id) ?? [],
      category_sort_orders: categorySortOrdersByGroup.get(group.id) ?? {},
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-Hant'))
}

export function filterGroupsForCategory(groups: ProductFilterGroup[], categoryId: string | null | undefined) {
  if (!categoryId) return []
  return groups
    .filter(group => group.category_ids.includes(categoryId))
    .sort((a, b) => (a.category_sort_orders?.[categoryId] ?? Number.MAX_SAFE_INTEGER) - (b.category_sort_orders?.[categoryId] ?? Number.MAX_SAFE_INTEGER)
      || a.sort_order - b.sort_order)
}

export function catalogPublicPrice(product: CatalogPriceSource): number | null {
  const value = Number(product.web_sale_price)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function catalogQuotationMethod(product: CatalogPriceSource): CatalogQuotationMethod {
  return catalogPublicPrice(product) == null ? 'project' : 'online'
}

export function matchesCatalogPriceRange(
  product: CatalogPriceSource,
  minimum: string,
  maximum: string,
): boolean {
  if (!minimum && !maximum) return true
  const price = catalogPublicPrice(product)
  if (price == null) return false
  if (minimum && price < Number(minimum)) return false
  if (maximum && price > Number(maximum)) return false
  return true
}

export function buildCategoryGroupMappings(
  templateGroups: ProductFilterTemplateGroup[],
  categoryTemplates: ProductCategoryFilterTemplate[],
  exclusions: ProductCategoryFilterExclusion[] = [],
) {
  const excludedPairs = new Set(exclusions.map(row => `${row.category_id}:${row.group_id}`))
  const groupIdsByTemplate = new Map<string, Array<{ group_id: string; sort_order?: number }>>()
  for (const row of templateGroups) {
    const groupIds = groupIdsByTemplate.get(row.template_id) ?? []
    groupIds.push({ group_id: row.group_id, sort_order: row.sort_order })
    groupIdsByTemplate.set(row.template_id, groupIds)
  }
  return categoryTemplates.flatMap(row =>
    (groupIdsByTemplate.get(row.template_id) ?? []).map(groupId => ({
      category_id: row.category_id,
      group_id: groupId.group_id,
      sort_order: groupId.sort_order,
    })).filter(groupId => !excludedPairs.has(`${groupId.category_id}:${groupId.group_id}`)),
  )
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

function rangePresets(bounds: number[], unit: string | null): NumericRangePreset[] {
  const suffix = unit ? ` ${unit}` : ''
  const presets: NumericRangePreset[] = bounds.map((bound, index) => index === 0
    ? { id: `to_${bound}`, label: `${bound}${suffix} 以下`, max: bound }
    : { id: `${bounds[index - 1]}_${bound}`, label: `${bounds[index - 1]}–${bound}${suffix}`, min: bounds[index - 1], max: bound })
  presets.push({ id: `over_${bounds[bounds.length - 1]}`, label: `${bounds[bounds.length - 1]}${suffix} 以上`, min: bounds[bounds.length - 1] })
  return presets
}

function exactPresets(values: number[], unit: string | null): NumericRangePreset[] {
  const suffix = unit ? ` ${unit}` : ''
  return values.map(value => ({ id: `exact_${value}`, label: `${value}${suffix}`, min: value, max: value }))
}

export function numericRangePresets(group: Pick<ProductFilterGroup, 'slug' | 'unit'>): NumericRangePreset[] {
  const { slug, unit } = group
  if (slug.includes('impedance') || slug === 'rated_load_ohm') return exactPresets([2, 4, 8, 16], unit)
  if (slug.includes('brightness_ansi')) return rangePresets([3000, 5000, 8000, 12000], unit)
  if (slug.includes('brightness_nit')) return rangePresets([350, 500, 700, 1000], unit)
  if (slug.includes('capacity_va')) return rangePresets([750, 1500, 3000, 6000], unit)
  if (slug.includes('power_w') || unit === 'W' || unit === 'W/聲道') return rangePresets([100, 300, 600, 1000], unit)
  if (slug.includes('size_in') || slug === 'diagonal_in' || unit === '吋') return rangePresets([10, 32, 55, 75, 100], unit)
  if (slug.includes('storage') && unit === 'TB') return rangePresets([1, 4, 8, 16], unit)
  if (slug.includes('storage') && unit === 'GB') return rangePresets([64, 256, 1000, 4000], unit)
  if (unit === 'Gbps') return rangePresets([1, 2.5, 10, 40], unit)
  if (unit === 'Mbps') return rangePresets([10, 100, 500, 1000], unit)
  if (unit === 'dB') return rangePresets([100, 110, 120, 130], unit)
  if (unit === 'fps') return rangePresets([30, 60, 120], unit)
  if (unit === '倍') return rangePresets([3, 10, 20, 30], unit)
  if (unit === 'm') return rangePresets([5, 10, 30, 100], unit)
  if (unit === '小時') return rangePresets([4, 8, 12, 20], unit)
  if (unit === '分鐘') return rangePresets([10, 30, 60, 120], unit)
  if (unit === 'mm') return rangePresets([10, 100, 500, 1000], unit)
  if (unit === 'kg') return rangePresets([5, 15, 30, 60], unit)
  if (unit === '°') return rangePresets([30, 60, 90, 120], unit)
  if (unit === '%') return rangePresets([25, 50, 75, 100], unit)
  if (unit === 'kHz') return rangePresets([48, 96, 192], unit)
  if (unit === 'MHz') return rangePresets([500, 700, 900, 2400], unit)
  if (unit === 'K') return rangePresets([3000, 4500, 5600, 6500], unit)
  if (unit === 'CRI') return rangePresets([80, 90, 95], unit)
  if (unit === 'VA') return rangePresets([750, 1500, 3000, 6000], unit)
  if (unit === 'A') return rangePresets([5, 10, 15, 30], unit)
  if (unit === 'J') return rangePresets([500, 1000, 2000, 4000], unit)
  if (unit === ':1') return rangePresets([0.5, 1, 2, 4], unit)
  if (unit === '首') return rangePresets([10000, 30000, 60000, 100000], unit)
  if (['聲道', '區', '孔', '支', '組', '路', 'Bay', '點', '埠', 'U', '鍵', 'ch'].includes(unit ?? '') || /(count|channel|port|zone|bus|matrix|preamp)/.test(slug)) {
    return [
      { id: 'exact_1', label: `1 ${unit ?? ''}`.trim(), min: 1, max: 1 },
      { id: 'exact_2', label: `2 ${unit ?? ''}`.trim(), min: 2, max: 2 },
      { id: '3_4', label: `3–4 ${unit ?? ''}`.trim(), min: 3, max: 4 },
      { id: '5_8', label: `5–8 ${unit ?? ''}`.trim(), min: 5, max: 8 },
      { id: 'over_9', label: `9 ${unit ?? ''}以上`.trim(), min: 9 },
    ]
  }
  return rangePresets([10, 50, 100, 500], unit)
}

export function matchesNumericPresetFilters(
  productValues: Record<string, number> | undefined,
  selections: NumericPresetSelections,
  groups: ProductFilterGroup[],
): boolean {
  const groupMap = new Map(groups.map(group => [group.id, group]))
  return Object.entries(selections).every(([groupId, selectedIds]) => {
    if (selectedIds.length === 0) return true
    const value = productValues?.[groupId]
    const group = groupMap.get(groupId)
    if (value == null || Number.isNaN(value) || !group) return false
    const selected = new Set(selectedIds)
    return numericRangePresets(group).some(preset => selected.has(preset.id)
      && (preset.min == null || value >= preset.min)
      && (preset.max == null || value <= preset.max))
  })
}
