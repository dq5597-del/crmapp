import { wordpressMediaConfig } from './wordpress-media'
import { isSnippetActive, snippetCodeMatches, snippetScopeMatches } from './wordpress-product-downloads-publisher'
import { WORDPRESS_FILTER_SET_SNIPPET_NAME, wordpressFilterSetSnippet } from './wordpress-filter-set-snippet'

type WordPressAuth = { store: string; header: string }

export type WordPressCategoryFilter = {
  crm_category_id: string
  woo_category_id: number
  title: string
  filters: Array<{
    crm_group_id: string
    name: string
    slug: string
    input_type: 'multi_select' | 'number'
    selection_mode: 'single' | 'multiple'
    woo_attribute_slug: string
  }>
}

function wordpressAuth(): WordPressAuth | null {
  const { store, username, applicationPassword } = wordpressMediaConfig()
  if (!store || !username || !applicationPassword) return null
  return { store, header: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}` }
}

async function requestJson(url: string, auth: WordPressAuth, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: auth.header, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { /* handled below */ }
  if (!response.ok) {
    throw new Error(data?.message ?? `WordPress HTTP ${response.status}`)
  }
  return data
}

async function snippetRequest(path: string, auth: WordPressAuth, init?: RequestInit) {
  return requestJson(`${auth.store}/wp-json/code-snippets/v1${path}`, auth, init)
}

function normalizeScope(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase()
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return normalizeScope(row.value) || normalizeScope(row.slug) || normalizeScope(row.name)
  }
  return ''
}

function writableSnippet(snippet: any) {
  const scope = normalizeScope(snippet?.scope)
  if (!scope) throw new Error('WordPress 原始篩選器片段的執行範圍無法辨識')
  return {
    name: snippet?.name ?? '', desc: snippet?.desc ?? '', code: snippet?.code ?? '',
    tags: Array.isArray(snippet?.tags) ? snippet.tags : [], scope,
    priority: Number(snippet?.priority ?? 10), active: false, network: snippet?.network ?? null,
  }
}

export async function ensureWordPressFilterSetSnippet() {
  const auth = wordpressAuth()
  if (!auth) throw new Error('WordPress 管理帳號尚未設定（WP_MEDIA_USERNAME / WP_MEDIA_APPLICATION_PASSWORD）')
  const list = await snippetRequest(`/snippets?search=${encodeURIComponent(WORDPRESS_FILTER_SET_SNIPPET_NAME)}&per_page=100`, auth)
  const snippets = Array.isArray(list) ? list : (list?.snippets ?? [])
  const current = snippets.find((snippet: any) => snippet.name === WORDPRESS_FILTER_SET_SNIPPET_NAME)
  const detailsResponse = current?.id ? await snippetRequest(`/snippets/${current.id}`, auth) : null
  const backup = detailsResponse?.snippet ?? detailsResponse
  if (current?.id && (!backup?.id || String(backup.id) !== String(current.id))) {
    throw new Error('WordPress 未回傳可驗證的原始篩選器片段，已停止更新')
  }
  if (
    backup?.id && isSnippetActive(backup.active) &&
    snippetCodeMatches(backup.code, wordpressFilterSetSnippet) &&
    snippetScopeMatches(backup.scope, 'global')
  ) {
    return { auth, action: 'unchanged', snippet_id: backup.id, active: true }
  }

  const payload = {
    name: WORDPRESS_FILTER_SET_SNIPPET_NAME,
    desc: '接收光輝系統的分類篩選條件，更新 Filter Everything Filter Sets。',
    code: wordpressFilterSetSnippet,
    scope: 'global', priority: 10, active: false,
    tags: ['woocommerce', 'filter-everything', 'crm'],
  }
  let snippetId = current?.id ?? null
  try {
    if (current?.id && isSnippetActive(backup?.active ?? current.active)) {
      await snippetRequest(`/snippets/${current.id}/deactivate`, auth, { method: 'PUT' })
    }
    const savedResponse = current
      ? await snippetRequest(`/snippets/${current.id}`, auth, { method: 'PUT', body: JSON.stringify(payload) })
      : await snippetRequest('/snippets', auth, { method: 'POST', body: JSON.stringify(payload) })
    const saved = savedResponse?.snippet ?? savedResponse
    snippetId = saved?.id ?? current?.id ?? null
    if (!snippetId) throw new Error('WordPress 未回傳篩選器程式片段 ID')
    const preflightResponse = await snippetRequest(`/snippets/${snippetId}`, auth)
    const preflight = preflightResponse?.snippet ?? preflightResponse
    if (preflight?.code_error) throw new Error(`WordPress PHP 驗證失敗：${preflight.code_error}`)
    await snippetRequest(`/snippets/${snippetId}/activate`, auth, { method: 'PUT' })
    const verifiedResponse = await snippetRequest(`/snippets/${snippetId}`, auth)
    const verified = verifiedResponse?.snippet ?? verifiedResponse
    if (
      verified?.code_error || !snippetCodeMatches(verified?.code, wordpressFilterSetSnippet) ||
      !snippetScopeMatches(verified?.scope, 'global') || !isSnippetActive(verified?.active)
    ) {
      throw new Error(verified?.code_error ?? 'WordPress 篩選器片段回讀驗證失敗')
    }
  } catch (error) {
    if (backup?.id) {
      try {
        const activeResponse = await snippetRequest(`/snippets/${backup.id}`, auth)
        const active = activeResponse?.snippet ?? activeResponse
        if (isSnippetActive(active?.active)) {
          await snippetRequest(`/snippets/${backup.id}/deactivate`, auth, { method: 'PUT' })
        }
        await snippetRequest(`/snippets/${backup.id}`, auth, {
          method: 'PUT', body: JSON.stringify(writableSnippet(backup)),
        })
        if (isSnippetActive(backup.active)) {
          await snippetRequest(`/snippets/${backup.id}/activate`, auth, { method: 'PUT' })
        }
      } catch (rollbackError) {
        throw new Error(`官網篩選器橋接器更新失敗且無法還原：${error instanceof Error ? error.message : String(error)}；${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`)
      }
    } else if (snippetId) {
      await snippetRequest(`/snippets/${snippetId}/deactivate`, auth, { method: 'PUT' }).catch(() => null)
    }
    throw error
  }
  return { auth, action: current ? 'updated' : 'created', snippet_id: snippetId, active: true }
}

export async function syncWordPressFilterSets(categories: WordPressCategoryFilter[]) {
  const snippet = await ensureWordPressFilterSetSnippet()
  const result = await requestJson(`${snippet.auth.store}/wp-json/gh-crm/v1/filter-sets/sync`, snippet.auth, {
    method: 'POST', body: JSON.stringify({ categories }),
  })
  return {
    snippet: { action: snippet.action, snippet_id: snippet.snippet_id, active: snippet.active },
    ...result,
  }
}
