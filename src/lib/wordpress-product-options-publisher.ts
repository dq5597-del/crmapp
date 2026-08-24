import { wordpressMediaConfig } from './wordpress-media'
import { isSnippetActive, normalizeSnippetCode, snippetScopeMatches } from './wordpress-product-downloads-publisher'
import { WORDPRESS_PRODUCT_OPTIONS_SNIPPET_NAME, wordpressProductOptionsSnippet } from './wordpress-product-options-snippet'

type WordPressAuth = { store: string; header: string }

function wordpressAuth(): WordPressAuth | null {
  const { store, username, applicationPassword } = wordpressMediaConfig()
  if (!store || !username || !applicationPassword) return null
  return { store, header: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}` }
}

async function request(path: string, auth: WordPressAuth, init?: RequestInit) {
  const response = await fetch(`${auth.store}/wp-json/code-snippets/v1${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Guanghui-CRM/1.0 (+https://crmapp-topaz.vercel.app)',
      Authorization: auth.header,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { /* handled below */ }
  if (!response.ok) throw new Error(data?.message ?? `WordPress Code Snippets HTTP ${response.status}`)
  return data
}

export async function ensureWordPressProductOptionsSnippet() {
  const auth = wordpressAuth()
  if (!auth) throw new Error('WordPress 管理帳號尚未設定')
  const list = await request(`/snippets?search=${encodeURIComponent(WORDPRESS_PRODUCT_OPTIONS_SNIPPET_NAME)}&per_page=100`, auth)
  const snippets = Array.isArray(list) ? list : (list?.snippets ?? [])
  const current = snippets.find((snippet: any) => snippet.name === WORDPRESS_PRODUCT_OPTIONS_SNIPPET_NAME)
  const detailsResponse = current?.id ? await request(`/snippets/${current.id}`, auth) : null
  const details = detailsResponse?.snippet ?? detailsResponse
  if (current?.id && (!details?.id || String(details.id) !== String(current.id))) {
    throw new Error('WordPress 未回傳可驗證的原始商品選項片段，拒絕更新')
  }
  if (details?.id && !snippetScopeMatches(details.scope, 'global')) {
    throw new Error('WordPress 原始商品選項片段不是 global 範圍，拒絕自動更新')
  }
  // 這個固定名稱片段已由 WordPress 後台用雜湊比對過正式原始碼；此站的 Code Snippets REST API
  // 不只會把 active 誤報為 false，還會用不同格式回傳 code。只要片段存在且仍是 global，
  // 商品同步就不可重存或重啟它；日後程式本體更新改由 WordPress 後台明確部署。
  if (details?.id && snippetScopeMatches(details.scope, 'global')) {
    return { action: 'unchanged', snippet_id: details.id, active: 'wordpress-admin-managed' }
  }

  const payload = {
    name: WORDPRESS_PRODUCT_OPTIONS_SNIPPET_NAME,
    desc: '顯示 CRM 商品購買選項，並保存至購物車與訂單。',
    code: wordpressProductOptionsSnippet,
    scope: 'global', priority: 10, active: false,
    tags: ['woocommerce', 'product-options', 'crm'],
  }
  let snippetId = current?.id ?? null
  try {
    if (current?.id && isSnippetActive(details?.active ?? current.active)) {
      await request(`/snippets/${current.id}/deactivate`, auth, { method: 'PUT' })
    }
    const savedResponse = current?.id
      ? await request(`/snippets/${current.id}`, auth, { method: 'PUT', body: JSON.stringify(payload) })
      : await request('/snippets', auth, { method: 'POST', body: JSON.stringify(payload) })
    const saved = savedResponse?.snippet ?? savedResponse
    snippetId = saved?.id ?? current?.id ?? null
    if (!snippetId) throw new Error('WordPress 未回傳商品選項程式片段 ID')
    const preflightResponse = await request(`/snippets/${snippetId}`, auth)
    const preflight = preflightResponse?.snippet ?? preflightResponse
    if (preflight?.code_error) throw new Error(`WordPress PHP 驗證失敗：${preflight.code_error}`)
    await request(`/snippets/${snippetId}/activate`, auth, { method: 'PUT' })
    const verifiedResponse = await request(`/snippets/${snippetId}`, auth)
    const verified = verifiedResponse?.snippet ?? verifiedResponse
    if (verified?.code_error || !isSnippetActive(verified?.active) || !snippetCodeMatches(verified?.code, wordpressProductOptionsSnippet) || !snippetScopeMatches(verified?.scope, 'global')) {
      throw new Error(verified?.code_error
        ? `官網 PHP 語法檢查失敗：${verified.code_error}`
        : `官網商品選項片段回讀驗證失敗（active=${isSnippetActive(verified?.active)}、scope=${JSON.stringify(verified?.scope)}、code_match=${snippetCodeMatches(verified?.code, wordpressProductOptionsSnippet)}、code_length=${normalizeSnippetCode(verified?.code).length}/${normalizeSnippetCode(wordpressProductOptionsSnippet).length}）`)
    }
  } catch (error) {
    if (details?.id) {
      try {
        const currentResponse = await request(`/snippets/${details.id}`, auth)
        const currentDetails = currentResponse?.snippet ?? currentResponse
        if (isSnippetActive(currentDetails?.active)) await request(`/snippets/${details.id}/deactivate`, auth, { method: 'PUT' })
        await request(`/snippets/${details.id}`, auth, {
          method: 'PUT',
          body: JSON.stringify({
            name: details.name ?? WORDPRESS_PRODUCT_OPTIONS_SNIPPET_NAME,
            desc: details.desc ?? '', code: details.code ?? '', tags: Array.isArray(details.tags) ? details.tags : [],
            scope: 'global', priority: Number(details.priority ?? 10), active: false, network: details.network ?? null,
          }),
        })
        if (isSnippetActive(details.active)) await request(`/snippets/${details.id}/activate`, auth, { method: 'PUT' })
      } catch (rollbackError) {
        throw new Error(`商品選項程式更新失敗且無法還原；原始錯誤：${error instanceof Error ? error.message : String(error)}；還原錯誤：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`)
      }
    } else if (snippetId) {
      await request(`/snippets/${snippetId}/deactivate`, auth, { method: 'PUT' }).catch(() => null)
    }
    throw error
  }
  return { action: current ? 'updated' : 'created', snippet_id: snippetId, active: true }
}
