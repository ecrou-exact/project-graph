// Repository details from the GitHub REST API.
// Only the node form calls it (when a repository is entered, or on Refresh);
// the summary is then saved in the node, so displaying a graph never does.
// Unauthenticated calls are limited to 60 per hour per IP, so results are also
// cached in memory and in localStorage, and concurrent requests are shared.

const API = 'https://api.github.com/repos/'
const CACHE_KEY = 'pivograph:github'
const TTL = 6 * 60 * 60 * 1000 // 6 hours

const inFlight = new Map() // "owner/repo" -> Promise

/**
 * @param {string} slug "owner/repo"
 * @returns {Promise<object>} repo summary; rejects with an Error whose message is user-facing
 */
export function fetchRepo(slug, { force = false } = {}) {
  const key = slug.toLowerCase()
  const cached = readCache()[key]
  if (!force && cached && Date.now() - cached.at < TTL) return Promise.resolve(cached.repo)
  if (!inFlight.has(key)) {
    const request = load(slug)
      .then((repo) => {
        writeCache(key, repo)
        return repo
      })
      .finally(() => inFlight.delete(key))
    inFlight.set(key, request)
  }
  return inFlight.get(key)
}

async function load(slug) {
  let response
  try {
    response = await fetch(API + slug, { headers: { Accept: 'application/vnd.github+json' } })
  } catch {
    throw new Error('GitHub is unreachable (offline?).')
  }
  if (response.status === 404) throw new Error(`Repository ${slug} not found (or private).`)
  if (response.status === 403 || response.status === 429) {
    const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
    const when = reset ? ` Try again after ${new Date(reset).toLocaleTimeString()}.` : ''
    throw new Error(`GitHub rate limit reached (60 requests/hour without a token).${when}`)
  }
  if (!response.ok) throw new Error(`GitHub answered ${response.status}.`)
  const r = await response.json()
  return {
    fullName: r.full_name,
    url: r.html_url,
    description: r.description ?? '',
    homepage: r.homepage || '',
    stars: r.stargazers_count,
    forks: r.forks_count,
    issues: r.open_issues_count,
    language: r.language ?? '',
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : '',
    topics: r.topics ?? [],
    archived: Boolean(r.archived),
    pushedAt: r.pushed_at,
    fetchedAt: new Date().toISOString(),
  }
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeCache(key, repo) {
  try {
    const cache = readCache()
    cache[key] = { at: Date.now(), repo }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // storage unavailable: the in-memory request sharing still limits calls
  }
}

/** 1234 -> "1.2k" */
export function compactNumber(n) {
  if (!Number.isFinite(n)) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

/** ISO date -> "3 days ago" */
export function timeAgo(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(seconds)) return ''
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of units) {
    const value = Math.floor(seconds / size)
    if (value >= 1) return `${value} ${unit}${value > 1 ? 's' : ''} ago`
  }
  return 'just now'
}
