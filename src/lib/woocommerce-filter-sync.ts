type SupabaseLike = any

export type FilterGroupRow = {
  id: string
  name: string
  slug: string
  input_type: 'multi_select' | 'number'
  selection_mode?: 'single' | 'multiple'
  unit: string | null
  woo_attribute_id?: number | null
  woo_attribute_slug?: string | null
  web_sync_enabled?: boolean
}

type ProductFilterValue = {
  productId: string
  group: FilterGroupRow
  option?: string
  number?: number
}

type WooAttribute = { id: number; name: string; slug: string }
type WooTerm = { id: number; name: string; slug: string }

export type WooFilterDefinition = {
  crm_group_id: string
  name: string
  slug: string
  input_type: 'multi_select' | 'number'
  selection_mode: 'single' | 'multiple'
  woo_attribute_id: number
  woo_attribute_slug: string
}

// av-shop.com 既有全域屬性的語意對照。以 slug 尋找，不綁死資料庫 ID。
// 多個 CRM 規格可以匯入同一個官網篩選維度，例如輸入／輸出端子都歸到「接孔類型」。
const EXISTING_ATTRIBUTE_SLUG_BY_GROUP: Record<string, string> = {
  use_case: 'pa_application', amplifier_application: 'pa_application', camera_application: 'pa_application',
  input_interface: 'pa_connectivity', output_interface: 'pa_connectivity',
  video_input_interface: 'pa_connectivity', video_output_interface: 'pa_connectivity',
  connector_a: 'pa_connectivity', connector_b: 'pa_connectivity', host_interface: 'pa_connectivity',
  resolution: 'pa_resolution', capture_resolution: 'pa_resolution', max_video_mode: 'pa_resolution',
  brightness_ansi_lm: 'pa_lumens',
  channel_count: 'pa_of-channels', amp_output_channel_count: 'pa_of-channels',
  mixing_input_channel_count: 'pa_of-channels', dsp_channel_count: 'pa_of-channels',
  rated_power_w: 'pa_watts', continuous_power_w: 'pa_watts', peak_power_w: 'pa_watts', output_power: 'pa_watts',
  source_power_w: 'pa_watts', poe_budget_w: 'pa_watts',
  mic_input_count: 'pa_number-of-microphone-inputs', mic_preamp_count: 'pa_number-of-microphone-inputs',
  input_count: 'pa_number-of-microphone-inputs',
  transducer_type: 'pa_mic-type', mic_form: 'pa_mic-type',
  polar_pattern: 'pa_麥克風極性圖',
  speaker_type: 'pa_speaker-type', driver_size_in: 'pa_speaker-size',
  transmission_type: 'pa_signal-type', signal_type: 'pa_signal-type',
  mounting: 'pa_installation-type', installation: 'pa_installation-type', form_factor: 'pa_installation-type',
  feature: 'pa_features', function: 'pa_features', media_feature: 'pa_features',
  power_method: 'pa_power-type', topology: 'pa_power-type',
  display_size_in: 'pa_display-size', diagonal_in: 'pa_display-size', panel_size_in: 'pa_display-size',
  display_size_min_in: 'pa_display-size', display_size_max_in: 'pa_display-size',
  optical_zoom_x: 'pa_optical-zoom', pixel_pitch_mm: 'pa_pixel-pitch',
  control_protocol: 'pa_control-protocol', automation_protocol: 'pa_control-protocol', lighting_protocol: 'pa_control-protocol',
  sensor_protocol: 'pa_comm-protocol', network_audio_protocol: 'pa_comm-protocol', streaming_protocol: 'pa_comm-protocol',
  operating_range_m: 'pa_detection-range', microphone_pickup_range_m: 'pa_detection-range',
  ip_rating: 'pa_ip-level', zone_count: 'pa_分區數', wireless_channel_count: 'pa_無線科技',
  length_m: 'pa_length', rack_unit: 'pa_rack-mountable',
}

export type WooProductAttribute = {
  id: number
  name: string
  visible: boolean
  variation: boolean
  options: string[]
}

export type WooFilterPayload = {
  attributes: WooProductAttribute[]
  metaData: { key: string; value: string }[]
}

function normalize(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function shortAttributeSlug(source: string) {
  const base = source.normalize('NFKD').toLocaleLowerCase('en-US')
    .replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '') || 'spec'
  if (base.length <= 26) return base
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `gh-${base.slice(0, 16)}-${(hash >>> 0).toString(36).slice(0, 6)}`
}

function numericLabel(value: number, unit: string | null) {
  return unit?.trim() ? `${value} ${unit.trim()}` : String(value)
}

export class WooFilterSync {
  private attributes: WooAttribute[] | null = null
  private attributeByGroup = new Map<string, WooAttribute>()
  private termsByAttribute = new Map<number, WooTerm[]>()

  constructor(
    private supabase: SupabaseLike,
    private store: string,
    private authHeader: string,
  ) {}

  private async request(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown) {
    const response = await fetch(`${this.store}/wp-json/wc/v3${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Guanghui-CRM/1.0 (+https://crmapp-topaz.vercel.app)',
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.message ?? `WooCommerce HTTP ${response.status}`)
    return data
  }

  private async listAttributes() {
    if (this.attributes) return this.attributes
    const rows: WooAttribute[] = []
    for (let page = 1; page <= 10; page++) {
      const batch = await this.request(`/products/attributes?per_page=100&page=${page}`)
      if (!Array.isArray(batch)) break
      rows.push(...batch.map((row: any) => ({ id: Number(row.id), name: String(row.name ?? ''), slug: String(row.slug ?? '') })))
      if (batch.length < 100) break
    }
    this.attributes = rows
    return rows
  }

  private async ensureAttribute(group: FilterGroupRow): Promise<WooAttribute> {
    const cached = this.attributeByGroup.get(group.id)
    if (cached) return cached
    const attributes = await this.listAttributes()
    let found = group.woo_attribute_id
      ? attributes.find(attribute => attribute.id === Number(group.woo_attribute_id))
      : undefined
    if (!found && group.woo_attribute_slug) {
      found = attributes.find(attribute => attribute.slug === group.woo_attribute_slug)
    }
    const sharedAttributeSlug = EXISTING_ATTRIBUTE_SLUG_BY_GROUP[group.slug]
    if (!found && sharedAttributeSlug) {
      found = attributes.find(attribute => attribute.slug === sharedAttributeSlug)
    }
    if (!found) {
      const sameName = attributes.filter(attribute => normalize(attribute.name) === normalize(group.name))
      if (sameName.length === 1) found = sameName[0]
    }
    if (!found) {
      const created = await this.request('/products/attributes', 'POST', {
        name: group.name,
        slug: shortAttributeSlug(group.slug),
        type: 'select',
        order_by: group.input_type === 'number' ? 'name_num' : 'menu_order',
        has_archives: false,
      })
      found = { id: Number(created.id), name: String(created.name), slug: String(created.slug) }
      attributes.push(found)
    }
    // 既有語意對照可能由多個 CRM 群組共用，不能因單一群組改名而改掉全站屬性名稱。
    // Filter Everything 顯示名稱仍會使用 CRM 群組名稱；只有專屬屬性才同步改名。
    if (!sharedAttributeSlug && normalize(found.name) !== normalize(group.name)) {
      const updated = await this.request(`/products/attributes/${found.id}`, 'PUT', { name: group.name })
      found = { id: Number(updated.id), name: String(updated.name), slug: String(updated.slug) }
      const index = attributes.findIndex(attribute => attribute.id === found!.id)
      if (index >= 0) attributes[index] = found
    }
    this.attributeByGroup.set(group.id, found)
    await this.supabase.from('product_filter_groups').update({
      woo_attribute_id: found.id,
      woo_attribute_slug: found.slug,
      woo_synced_at: new Date().toISOString(),
    }).eq('id', group.id)
    return found
  }

  async ensureNamedAttribute(name: string): Promise<WooAttribute> {
    const attributes = await this.listAttributes()
    const sameName = attributes.filter(attribute => normalize(attribute.name) === normalize(name))
    if (sameName.length === 1) return sameName[0]
    if (sameName.length > 1) throw new Error(`官網有多個同名屬性「${name}」，請先整理後再同步變體`)
    const created = await this.request('/products/attributes', 'POST', {
      name,
      slug: shortAttributeSlug(name === '顏色' ? 'color' : name),
      type: 'select', order_by: 'menu_order', has_archives: false,
    })
    const attribute = { id: Number(created.id), name: String(created.name), slug: String(created.slug) }
    attributes.push(attribute)
    return attribute
  }

  private async ensureTerms(attribute: WooAttribute, names: string[]) {
    let terms = this.termsByAttribute.get(attribute.id)
    if (!terms) {
      const rows = await this.request(`/products/attributes/${attribute.id}/terms?per_page=100`)
      terms = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: Number(row.id), name: String(row.name ?? ''), slug: String(row.slug ?? ''),
      }))
      this.termsByAttribute.set(attribute.id, terms)
    }
    for (const name of Array.from(new Set(names.map(value => value.trim()).filter(Boolean)))) {
      if (terms.some(term => normalize(term.name) === normalize(name))) continue
      try {
        const created = await this.request(`/products/attributes/${attribute.id}/terms`, 'POST', { name })
        terms.push({ id: Number(created.id), name: String(created.name), slug: String(created.slug) })
      } catch (error: any) {
        // 同時同步相同選項時，WooCommerce 可能回 term_exists；重新讀取確認即可。
        const refreshed = await this.request(`/products/attributes/${attribute.id}/terms?per_page=100`)
        terms = (Array.isArray(refreshed) ? refreshed : []).map((row: any) => ({
          id: Number(row.id), name: String(row.name ?? ''), slug: String(row.slug ?? ''),
        }))
        this.termsByAttribute.set(attribute.id, terms)
        if (!terms.some(term => normalize(term.name) === normalize(name))) throw error
      }
    }
  }

  private async ensureOptionTerms(
    attribute: WooAttribute,
    options: Array<{ name: string; aliases?: string[] }>,
    allowRename: boolean,
  ) {
    let terms = this.termsByAttribute.get(attribute.id)
    if (!terms) {
      const rows = await this.request(`/products/attributes/${attribute.id}/terms?per_page=100`)
      terms = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: Number(row.id), name: String(row.name ?? ''), slug: String(row.slug ?? ''),
      }))
      this.termsByAttribute.set(attribute.id, terms)
    }

    for (const option of options) {
      const name = option.name.trim()
      if (!name || terms.some(term => normalize(term.name) === normalize(name))) continue
      const aliases = (option.aliases ?? []).map(normalize).filter(Boolean)
      const renamed = allowRename ? terms.find(term => aliases.includes(normalize(term.name))) : undefined
      if (renamed) {
        const updated = await this.request(`/products/attributes/${attribute.id}/terms/${renamed.id}`, 'PUT', { name })
        const replacement = { id: Number(updated.id), name: String(updated.name), slug: String(updated.slug) }
        terms.splice(terms.indexOf(renamed), 1, replacement)
        continue
      }
      await this.ensureTerms(attribute, [name])
      terms = this.termsByAttribute.get(attribute.id) ?? terms
    }
  }

  /** 建立分類篩選器本身需要的 Woo 全域屬性與選項，並回傳 WordPress Filter Set 對應資料。 */
  async prepareFilterDefinitions(
    groups: Array<FilterGroupRow & { options?: Array<{ name: string; aliases?: string[] }> }>,
  ): Promise<WooFilterDefinition[]> {
    const definitions: WooFilterDefinition[] = []
    for (const group of groups.filter(row => row.web_sync_enabled !== false)) {
      const attribute = await this.ensureAttribute(group)
      if (group.input_type === 'multi_select') {
        await this.ensureOptionTerms(attribute, group.options ?? [], !EXISTING_ATTRIBUTE_SLUG_BY_GROUP[group.slug])
      }
      definitions.push({
        crm_group_id: group.id,
        name: group.name,
        slug: group.slug,
        input_type: group.input_type,
        selection_mode: group.selection_mode === 'single' ? 'single' : 'multiple',
        woo_attribute_id: attribute.id,
        woo_attribute_slug: attribute.slug,
      })
    }
    return definitions
  }

  async prepareVariantAttribute(name: string, options: string[]): Promise<WooProductAttribute> {
    const attribute = await this.ensureNamedAttribute(name)
    await this.ensureTerms(attribute, options)
    return { id: attribute.id, name: attribute.name, visible: true, variation: true, options }
  }

  private async loadValues(productIds: string[]): Promise<ProductFilterValue[]> {
    if (!productIds.length) return []
    const [{ data: assignments }, { data: numbers }] = await Promise.all([
      this.supabase.from('product_filter_assignments').select('product_id,option_id').in('product_id', productIds),
      this.supabase.from('product_filter_numbers').select('product_id,group_id,numeric_value').in('product_id', productIds),
    ])
    const optionIds = Array.from(new Set((assignments ?? []).map((row: any) => row.option_id))) as string[]
    const { data: options } = optionIds.length
      ? await this.supabase.from('product_filter_options').select('id,group_id,name').in('id', optionIds)
      : { data: [] }
    const groupIds = Array.from(new Set([
      ...(options ?? []).map((row: any) => row.group_id),
      ...(numbers ?? []).map((row: any) => row.group_id),
    ])) as string[]
    const { data: groups } = groupIds.length
      ? await this.supabase.from('product_filter_groups')
        .select('id,name,slug,input_type,unit,woo_attribute_id,woo_attribute_slug,web_sync_enabled').in('id', groupIds)
      : { data: [] }
    const groupMap = new Map<string, FilterGroupRow>(
      (groups ?? []).filter((group: any) => group.web_sync_enabled !== false)
        .map((group: any): [string, FilterGroupRow] => [String(group.id), group as FilterGroupRow])
    )
    const optionMap = new Map<string, { id: string; group_id: string; name: string }>(
      (options ?? []).map((option: any): [string, { id: string; group_id: string; name: string }] => [String(option.id), option])
    )
    const values: ProductFilterValue[] = []
    for (const assignment of assignments ?? []) {
      const option: any = optionMap.get(assignment.option_id)
      const group = option ? groupMap.get(option.group_id) : null
      if (group) values.push({ productId: assignment.product_id, group, option: option.name })
    }
    for (const numberRow of numbers ?? []) {
      const group = groupMap.get(numberRow.group_id)
      const value = Number(numberRow.numeric_value)
      if (group && Number.isFinite(value)) values.push({ productId: numberRow.product_id, group, number: value })
    }
    return values
  }

  /** 多個 productIds 用於 variable 父商品：屬性選項取聯集，數值 meta 以第一筆（系列主商品）為準。 */
  async prepareProductFilters(productIds: string[]): Promise<WooFilterPayload> {
    const values = await this.loadValues(productIds)
    const grouped = new Map<string, { group: FilterGroupRow; labels: string[]; primaryNumber?: number }>()
    for (const value of values) {
      const current = grouped.get(value.group.id) ?? { group: value.group, labels: [] }
      if (value.option) current.labels.push(value.option)
      if (value.number !== undefined) {
        current.labels.push(numericLabel(value.number, value.group.unit))
        if (current.primaryNumber === undefined && value.productId === productIds[0]) current.primaryNumber = value.number
      }
      grouped.set(value.group.id, current)
    }
    const attributes: WooProductAttribute[] = []
    const attributesById = new Map<number, WooProductAttribute>()
    const metaData: { key: string; value: string }[] = []
    for (const { group, labels, primaryNumber } of Array.from(grouped.values())) {
      const uniqueLabels: string[] = Array.from(new Set(labels.map((label: string) => label.trim()).filter(Boolean)))
      if (!uniqueLabels.length) continue
      const attribute = await this.ensureAttribute(group)
      await this.ensureTerms(attribute, uniqueLabels)
      const currentAttribute = attributesById.get(attribute.id)
      if (currentAttribute) {
        currentAttribute.options = Array.from(new Set([...currentAttribute.options, ...uniqueLabels]))
      } else {
        const nextAttribute = { id: attribute.id, name: attribute.name, visible: true, variation: false, options: uniqueLabels }
        attributes.push(nextAttribute)
        attributesById.set(attribute.id, nextAttribute)
      }
      metaData.push({ key: `gh_filter_${group.slug}`, value: primaryNumber === undefined ? uniqueLabels.join('|') : String(primaryNumber) })
    }
    return { attributes, metaData }
  }
}
