import { wordpressMediaConfig } from './wordpress-media'
import { WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME, wordpressProductDownloadsSnippet } from './wordpress-product-downloads-snippet'

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

export async function ensureWordPressProductDownloadsSnippet() {
  const auth = wordpressAuth()
  if (!auth) throw new Error('WordPress 管理帳號尚未設定')
  const list = await snippetRequest(`/snippets?search=${encodeURIComponent(WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME)}&per_page=100`, auth)
  const snippets = Array.isArray(list) ? list : (list?.snippets ?? [])
  const current = snippets.find((snippet: any) => snippet.name === WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME)
  if (current?.active && current?.code === wordpressProductDownloadsSnippet) {
    return { action: 'unchanged', snippet_id: current.id, active: true }
  }

  const backupResponse = current?.id ? await snippetRequest(`/snippets/${current.id}`, auth) : null
  const backup = backupResponse?.snippet ?? backupResponse
  // Code Snippets 會在儲存時驗證 PHP。若舊片段仍啟用，同名函式會被誤判為重複宣告；
  // 因此更新前先用獨立請求停用，儲存驗證完成後再重新啟用。
  if (current?.id && current?.active) {
    await snippetRequest(`/snippets/${current.id}/deactivate`, auth, { method: 'PUT' })
  }
  const payload = {
    name: WORDPRESS_PRODUCT_DOWNLOADS_SNIPPET_NAME,
    desc: '顯示 CRM 同步的產品型錄、使用手冊與規格 PDF。',
    code: wordpressProductDownloadsSnippet,
    scope: 'global', priority: 10, active: false,
    tags: ['woocommerce', 'product-downloads', 'crm'],
  }
  const savedResponse = current
    ? await snippetRequest(`/snippets/${current.id}`, auth, { method: 'PUT', body: JSON.stringify(payload) })
    : await snippetRequest('/snippets', auth, { method: 'POST', body: JSON.stringify(payload) })
  const saved = savedResponse?.snippet ?? savedResponse
  const snippetId = saved?.id ?? current?.id
  if (!snippetId) throw new Error('WordPress 未回傳程式片段 ID')

  try {
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
      await snippetRequest(`/snippets/${backup.id}`, auth, { method: 'PUT', body: JSON.stringify(writableSnippet(backup)) })
      await snippetRequest(`/snippets/${backup.id}/${backup.active ? 'activate' : 'deactivate'}`, auth, { method: 'PUT' })
    } else {
      await snippetRequest(`/snippets/${snippetId}/deactivate`, auth, { method: 'PUT' }).catch(() => null)
    }
    throw error
  }
  return { action: current ? 'updated' : 'created', snippet_id: snippetId, active: true }
}
