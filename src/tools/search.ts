/**
 * جستجوی وب رایگان — بدون نیاز به هیچ API key
 * زنجیرهٔ مقاوم: Bing → Wikipedia → DuckDuckGo
 */

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fa,en;q=0.8' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ─────────────────────────── Brave ───────────────────────────
async function braveSearch(query: string, limit: number): Promise<SearchResult[]> {
  const html = await get(
    `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web&spellcheck=0`,
  )
  if (!html.includes('data-type="web"')) throw new Error('Brave: ساختار پاسخ نامعتبر')

  const out: SearchResult[] = []
  const blocks = html.split(/data-type="web"/).slice(1)
  for (const block of blocks) {
    const a = block.match(/<a[^>]+href="([^"]+)"[^>]*>/)
    const titleDiv = block.match(/<div class="title search-snippet-title[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    const desc =
      block.match(/<div class="content[^"]*"[^>]*>([\s\S]*?)<\/div>/) ??
      block.match(/<div class="snippet-description[^"]*"[^>]*>([\s\S]*?)<\/div>/)
    if (!a || !titleDiv) continue
    const url = a[1]!
    if (!url.startsWith('http') || url.includes('search.brave.com')) continue
    const title = clean(titleDiv[1]!)
    if (!title) continue
    out.push({ title, url, snippet: desc ? clean(desc[1]!) : '' })
    if (out.length >= limit) break
  }
  return out
}

// ─────────────────────────── Bing ───────────────────────────
function decodeBingUrl(href: string): string | null {
  const m = href.match(/[?&]u=a1([^&]+)/)
  if (!m) return null
  try {
    let s = m[1]!.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    const decoded = Buffer.from(s, 'base64').toString('utf8')
    return decoded.startsWith('http') ? decoded : null
  } catch {
    return null
  }
}

async function bingSearch(query: string, limit: number): Promise<SearchResult[]> {
  const html = await get(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fa&cc=IR`)
  if (!html.includes('b_algo')) throw new Error('Bing: ساختار پاسخ نامعتبر')

  const out: SearchResult[] = []
  const blocks = html.split(/<li class="b_algo"/).slice(1)
  for (const block of blocks) {
    const h = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!h) continue
    const p =
      block.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/) ??
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    const c = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/)
    const rawHref = h[1]!.replace(/&amp;/g, '&')
    const url = decodeBingUrl(rawHref) ?? (c ? clean(c[1]!) : rawHref)
    const title = clean(h[2]!)
    if (!title || !url.startsWith('http')) continue
    out.push({ title, url, snippet: p ? clean(p[1]!) : '' })
    if (out.length >= limit) break
  }
  return out
}

// ────────────────────────── Wikipedia ──────────────────────────
async function wikiSearch(query: string, limit: number, lang = 'fa'): Promise<SearchResult[]> {
  const api =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${limit}` +
    `&srsearch=${encodeURIComponent(query)}`
  const res = await fetch(api, {
    headers: { 'User-Agent': 'PersianAIBot/1.0 (educational)' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`)
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet: string }[] }
  }
  return (data.query?.search ?? []).map((r) => ({
    title: clean(r.title),
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: clean(r.snippet),
  }))
}

// ────────────────────────── DuckDuckGo ──────────────────────────
function unwrapDdg(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1]!)
    } catch {
      /* ignore */
    }
  }
  return href
}

async function ddgSearch(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Language': 'fa,en;q=0.8',
    },
    body: new URLSearchParams({ q: query, kl: 'wt-wt' }).toString(),
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`DDG HTTP ${res.status}`)
  const html = await res.text()

  const anchors: { url: string; title: string }[] = []
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    anchors.push({ url: unwrapDdg(clean(m[1]!)), title: clean(m[2]!) })
  }
  const snippets: string[] = []
  const sre = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  while ((m = sre.exec(html)) !== null) snippets.push(clean(m[1]!))

  return anchors
    .slice(0, limit)
    .map((a, i) => ({ title: a.title, url: a.url, snippet: snippets[i] ?? '' }))
    .filter((r) => r.url.startsWith('http'))
}

// ─────────────────────────── عمومی ───────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { outcome: SearchOutcome; expires: number }>()

export type SearchSource = 'brave' | 'bing' | 'wikipedia' | 'duckduckgo' | 'none'

export interface SearchOutcome {
  results: SearchResult[]
  source: SearchSource
}

const SOURCE_LABEL: Record<SearchSource, string> = {
  brave: 'Brave Search',
  bing: 'Bing',
  wikipedia: 'ویکی‌پدیا',
  duckduckgo: 'DuckDuckGo',
  none: '—',
}

export function sourceLabel(source: SearchSource): string {
  return SOURCE_LABEL[source]
}

export async function webSearch(query: string, limit = 5): Promise<SearchOutcome> {
  const cacheKey = `${limit}|${query.toLowerCase().trim()}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.outcome

  const chain: { source: SearchSource; fn: () => Promise<SearchResult[]> }[] = [
    { source: 'brave', fn: () => braveSearch(query, limit) },
    { source: 'bing', fn: () => bingSearch(query, limit) },
    { source: 'wikipedia', fn: () => wikiSearch(query, limit, 'fa') },
    { source: 'wikipedia', fn: () => wikiSearch(query, limit, 'en') },
    { source: 'duckduckgo', fn: () => ddgSearch(query, limit) },
  ]

  for (const step of chain) {
    try {
      const results = await step.fn()
      if (results.length > 0) {
        const outcome: SearchOutcome = { results, source: step.source }
        cache.set(cacheKey, { outcome, expires: Date.now() + CACHE_TTL_MS })
        if (cache.size > 200) {
          const oldest = cache.keys().next().value
          if (oldest) cache.delete(oldest)
        }
        return outcome
      }
    } catch (err) {
      console.warn(`🔍 جستجو (${step.source}) ناموفق:`, err instanceof Error ? err.message : err)
    }
  }
  return { results: [], source: 'none' }
}

/** بلوک زمینه برای تزریق به پرامپت مدل */
export function formatSearchContext(outcome: SearchOutcome): string {
  if (outcome.results.length === 0) return ''
  const lines = outcome.results.map(
    (r, i) => `[${i + 1}] ${r.title}\n    منبع: ${r.url}\n    خلاصه: ${r.snippet || '—'}`,
  )
  return [
    'نتایج جستجوی وب (به‌روز). بر اساس این منابع پاسخ بده و در پایان منبع‌ها را با شماره ارجاع بده:',
    ...lines,
  ].join('\n\n')
}

/** خروجی خوانا برای کاربر */
export function formatSearchForUser(outcome: SearchOutcome): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const lines = outcome.results.map(
    (r, i) =>
      `${i + 1}. <a href="${esc(r.url)}">${esc(r.title)}</a>` +
      (r.snippet ? `\n   ${esc(r.snippet.slice(0, 200))}${r.snippet.length > 200 ? '…' : ''}` : ''),
  )
  return [
    `🔍 <b>نتایج جستجو</b> <i>(منبع: ${SOURCE_LABEL[outcome.source]})</i>`,
    '',
    ...lines,
  ].join('\n')
}
