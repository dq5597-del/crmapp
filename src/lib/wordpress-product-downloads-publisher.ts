import { wordpressMediaConfig } from './wordpress-media'
import {
  WORDPRESS_PRODUCT_DOWNLOADS_DEDUP_SNIPPET_NAME,
  WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME,
  wordpressProductDownloadsSnippet,
} from './wordpress-product-downloads-snippet'

type WordPressAuth = { store: string; header: string }

function wordpressAuth(): WordPressAuth | null {
  const { store, username, applicationPassword } = wordpressMediaConfig()
  if (!store || !username || !applicationPassword) return null
  return { store, header: `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}` }
}

async function snippetRequest(path: string, auth: WordPressAuth, init?: RequestInit) {
  const response = await fetch(`${auth.store}/wp-json/code-snippets/v1${path}`, {
    ...init,
    headers: { Authorization: auth.header, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { /* handled below */ }
  if (!response.ok) {
    const detail = data?.data ? `｜${JSON.stringify(data.data)}` : (data?.code ? `｜${data.code}` : '')
    throw new Error(`${data?.message ?? `WordPress Code Snippets HTTP ${response.status}`}${detail}`)
  }
  return data
}

function writableSnippet(snippet: any) {
  return {
    name: snippet?.name ?? '', desc: snippet?.desc ?? '', code: snippet?.code ?? '',
    tags: Array.isArray(snippet?.tags) ? snippet.tags : [], scope: snippet?.scope ?? 'global',
    priority: Number(snippet?.priority ?? 10), active: !!snippet?.active, network: snippet?.network ?? null,
  }
}

async function deactivateLegacyDownloadsTabDedupSnippet(auth: WordPressAuth) {
  const list = await snippetRequest(`/snippets?search=${encodeURIComponent(WORDPRESS_PRODUCT_DOWNLOADS_DEDUP_SNIPPET_NAME)}&per_page=100`, auth)
  const snippets = Array.isArray(list) ? list : (list?.snippets ?? [])
  const current = snippets.find((snippet: any) => snippet.name === WORDPRESS_PRODUCT_DOWNLOADS_DEDUP_SNIPPET_NAME)
  if (!current?.id) return null
  if (current.active) {
    await snippetRequest(`/snippets/${current.id}/deactivate`, auth, { method: 'PUT' })
    const verifiedResponse = await snippetRequest(`/snippets/${current.id}`, auth)
    const verified = verifiedResponse?.snippet ?? verifiedResponse
    if (verified?.active) throw new Error('WordPress 舊下載分頁去重片段停用失敗')
  }
  return current.id
}

export async function ensureWordPressProductDownloadsSnippet() {
  const auth = wordpressAuth()
  if (!auth) throw new Error('WordPress 管理帳號尚未設定')
  const list = await snippetRequest(`/snippets?search=${encodeURIComponent(WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME)}&per_page=100`, auth)
  const snippets = Array.isArray(list) ? list : (list?.snippets ?? [])
  const current = snippets.find((snippet: any) => snippet.name === WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME)
  if (current?.active && current?.code === wordpressProductDownloadsSnippet) {
    const dedupSnippetId = await deactivateLegacyDownloadsTabDedupSnippet(auth)
    return { action: 'unchanged', snippet_id: current.id, dedup_snippet_id: dedupSnippetId, active: true }
  }

  const backupResponse = current?.id ? await snippetRequest(`/snippets/${current.id}`, auth) : null
  const backup = backupResponse?.snippet ?? backupResponse
  const payload = {
    name: WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME,
    desc: '顯示 CRM 同步的產品型錄、使用手冊與規格 PDF。',
    code: wordpressProductDownloadsSnippet,
    scope: 'global', priority: 10, active: false,
    tags: ['woocommerce', 'product-downloads', 'crm'],
  }
  let snippetId = current?.id ?? null
  try {
    // Code Snippets 會在儲存時驗證 PHP。若舊片段仍啟用，同名函式會被誤判為重複宣告；
    // 因此更新前先停用，但停用、儲存、啟用全都必須落在同一個 rollback 範圍內。
    if (current?.id && current?.active) {
      await snippetRequest(`/snippets/${current.id}/deactivate`, auth, { method: 'PUT' })
    }
    const savedResponse = current
      ? await snippetRequest(`/snippets/${current.id}`, auth, { method: 'PUT', body: JSON.stringify(payload) })
      : await snippetRequest('/snippets', auth, { method: 'POST', body: JSON.stringify(payload) })
    const saved = savedResponse?.snippet ?? savedResponse
    snippetId = saved?.id ?? current?.id ?? null
    if (!snippetId) throw new Error('WordPress 未回傳程式片段 ID')

    const preflightResponse = await snippetRequest(`/snippets/${snippetId}`, auth)
    const preflight = preflightResponse?.snippet ?? preflightResponse
    if (preflight?.code_error) throw new Error(`WordPress PHP 驗證失敗：${preflight.code_error}`)
    await snippetRequest(`/snippets/${snippetId}/activate`, auth, { method: 'PUT' })
    const verifiedResponse = await snippetRequest(`/snippets/${snippetId}`, auth)
    const verified = verifiedResponse?.snippet ?? verifiedResponse
    if (verified?.code_error) throw new Error(`官網 PHP 語法檢查失敗：${verified.code_error}`)
    if (verified?.code !== wordpressProductDownloadsSnippet || verified?.scope !== 'global' || verified?.active !== true) {
      throw new Error('官網下載片段回讀驗證失敗')
    }
  } catch (error) {
    if (backup?.id) {
      try {
        // 還原舊程式前必須確認目前版本真的已停用，否則相同函式名稱可能在 PUT 時衝突。
        await snippetRequest(`/snippets/${backup.id}/deactivate`, auth, { method: 'PUT' })
        const inactiveResponse = await snippetRequest(`/snippets/${backup.id}`, auth)
        const inactive = inactiveResponse?.snippet ?? inactiveResponse
        if (inactive?.active) throw new Error('無法停用待還原的產品下載程式')
        await snippetRequest(`/snippets/${backup.id}`, auth, {
          method: 'PUT',
          body: JSON.stringify({ ...writableSnippet(backup), active: false }),
        })
        await snippetRequest(`/snippets/${backup.id}/${backup.active ? 'activate' : 'deactivate'}`, auth, { method: 'PUT' })
        const rollbackResponse = await snippetRequest(`/snippets/${backup.id}`, auth)
        const rolledBack = rollbackResponse?.snippet ?? rollbackResponse
        if (rolledBack?.code !== backup.code || !!rolledBack?.active !== !!backup.active) {
          throw new Error('還原後內容或啟用狀態不一致')
        }
      } catch (rollbackError) {
        throw new Error(
          `產品下載程式更新失敗且無法安全還原；原始錯誤：${error instanceof Error ? error.message : String(error)}；還原錯誤：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        )
      }
    } else if (snippetId) {
      await snippetRequest(`/snippets/${snippetId}/deactivate`, auth, { method: 'PUT' }).catch(() => null)
    }
    throw error
  }

  // 新 #71 已確認可用後才停用舊 #72。即使停用 #72 的請求失敗，
  // #71 已不再註冊 Woo 分頁，#72 留在啟用狀態也不會重新製造第二個分頁。
  const dedupSnippetId = await deactivateLegacyDownloadsTabDedupSnippet(auth)
  return { action: current ? 'updated' : 'created', snippet_id: snippetId, dedup_snippet_id: dedupSnippetId, active: true }
}
