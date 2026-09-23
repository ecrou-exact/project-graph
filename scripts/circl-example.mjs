// Writes examples/circl.json: the GitHub organisations managed or co-managed
// by CIRCL, as listed on https://new.circl.lu/projects/github-organisations/,
// with CIRCL in the centre. For each organisation: its logo (GitHub avatar,
// saved in public/logos/circl/), description, website, GitHub facts, its most
// starred repository as `github` / `githubInfo`, and its most used topics as tags.
//   node scripts/circl-example.mjs
// Uses the GitHub API through the `gh` CLI (authenticated, read-only).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const SOURCE = 'https://new.circl.lu/projects/github-organisations/'

// The page's list, in its order: [GitHub login, name on the page].
const ORGANISATIONS = [
  ['CIRCL', 'CIRCL'], ['MISP', 'MISP'], ['vulnerability-lookup', 'Vulnerability-Lookup'],
  ['pandora-analysis', 'Pandora Analysis'], ['lookyloo', 'Lookyloo'], ['ail-project', 'AIL Project'],
  ['hashlookup', 'Hashlookup'], ['rulezet', 'Rulezet'], ['pivotick', 'Pivotick'], ['gcve-eu', 'GCVE'],
  ['cve-search', 'CVE Search'], ['typosquatter', 'Typosquatter'], ['kunai-project', 'Kunai Project'],
  ['d4-project', 'D4 Project'], ['ngsoti', 'NGSOTI'], ['neolea', 'Neolea'], ['draugnet', 'Draugnet'],
  ['fanything-project', 'FAnything Project'], ['flowintel', 'FlowIntel'], ['cerebrate-project', 'Cerebrate Project'],
  ['SkillAegis', 'SkillAegis'], ['BinTriage', 'BinTriage'],
]
const CENTRE = 'CIRCL'

/** A GitHub API call; with `paginate`, every page of a list, one JSON line per item. */
const gh = (path, paginate = false) => {
  const args = paginate ? ['api', '--paginate', path, '--jq', '.[] | @json'] : ['api', path]
  const out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return paginate ? out.split('\n').filter(Boolean).map((line) => JSON.parse(line)) : JSON.parse(out)
}

const now = new Date().toISOString()
const day = now.slice(0, 10)
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)))

const logos = join(root, 'public/logos/circl')
mkdirSync(logos, { recursive: true })

const nodes = []
const edges = []
for (const [login, name] of ORGANISATIONS) {
  const org = gh(`orgs/${login}`)
  const repos = gh(`orgs/${login}/repos?per_page=100&type=public`, true).filter((r) => !r.fork && !r.private)
  const byStars = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name))
  // The main repository: the most starred one still maintained, not archived nor
  // moved elsewhere ("Project moved to …"); the others only as a last resort.
  const retired = (r) => r.archived || /\b(moved to|has moved|deprecated|no longer maintained|obsolete)\b/i.test(r.description ?? '')
  const top = byStars.find((r) => !retired(r)) ?? byStars[0]

  // The organisation's most used topics, across its own repositories.
  const topics = new Map()
  for (const r of repos) for (const t of r.topics ?? []) topics.set(t, (topics.get(t) ?? 0) + 1)
  const tags = [...topics].filter(([, n]) => n > 1 || repos.length < 4).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([t]) => t)

  // The logo: the organisation's GitHub avatar, kept with the app.
  const avatar = await fetch(`${org.avatar_url}${org.avatar_url.includes('?') ? '&' : '?'}s=240`)
  if (!avatar.ok) throw new Error(`${login}: avatar ${avatar.status}`)
  const file = `${login.toLowerCase()}.png`
  writeFileSync(join(logos, file), Buffer.from(await avatar.arrayBuffer()))

  // The organisation's website, else its main repository's (when not GitHub itself).
  const site = org.blog || (top?.homepage && !/github\.com/.test(top.homepage) ? top.homepage : '')
  const website = site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : undefined
  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0)
  const id = login.toLowerCase()
  nodes.push(compact({
    id,
    label: name,
    type: login === CENTRE ? 'cert' : 'organisation',
    description: org.description || undefined,
    url: website,
    image: `logos/circl/${file}`,
    github: top ? top.full_name : undefined,
    githubInfo: top ? compact({
      fullName: top.full_name,
      url: top.html_url,
      description: top.description ?? '',
      homepage: top.homepage || '',
      stars: top.stargazers_count,
      forks: top.forks_count,
      issues: top.open_issues_count,
      language: top.language ?? '',
      license: top.license?.spdx_id && top.license.spdx_id !== 'NOASSERTION' ? top.license.spdx_id : '',
      topics: top.topics ?? [],
      archived: Boolean(top.archived),
      pushedAt: top.pushed_at,
      fetchedAt: now,
    }) : undefined,
    links: [
      { label: 'GitHub organisation', url: org.html_url },
      ...(org.twitter_username ? [{ label: 'X / Twitter', url: `https://x.com/${org.twitter_username}` }] : []),
    ],
    tags,
    details: compact({
      github_organisation: org.html_url,
      public_repositories: org.public_repos,
      own_repositories: repos.length,
      stars_across_repositories: totalStars,
      followers: org.followers,
      location: org.location || undefined,
      email: org.email || undefined,
      on_github_since: org.created_at?.slice(0, 10),
      most_starred_repositories: byStars.filter((r) => !retired(r)).slice(0, 5).map((r) => `${r.name} (${r.stargazers_count} stars)`),
      archived_repositories: repos.filter((r) => r.archived).length || undefined,
    }),
  }))
  if (login !== CENTRE) edges.push({ from: CENTRE.toLowerCase(), to: id, type: 'manages' })
  console.log(`${name}: ${repos.length} repositories, top ${top?.full_name ?? '—'}`)
}

const doc = {
  version: 1,
  meta: {
    title: 'CIRCL GitHub organisations',
    description: `The GitHub organisations managed or co-managed by CIRCL, the CERT for the private sector, communes and non-governmental entities in Luxembourg, as listed on ${SOURCE}. For each organisation: its logo, its description and website from GitHub, its most starred repository and its most used topics. GitHub data of ${day}.`,
    linkDistance: 300,
  },
  nodeTypes: {
    cert: {
      label: 'CERT', color: '#ffffff', shape: 'circle', size: 70, imageFit: 'contain',
      borderColor: '#1c2b4a', borderWidth: 3, labelSize: 22, labelFont: 'sans', labelBackground: 'none',
    },
    organisation: {
      label: 'GitHub organisation', color: '#ffffff', shape: 'circle', size: 36, imageFit: 'contain',
      borderColor: '#c9d1e0', borderWidth: 2, labelSize: 15, labelFont: 'sans', labelBackground: 'none',
    },
  },
  edgeTypes: {
    // One spoke per organisation: the label would only repeat itself on the graph,
    // it is kept for the text ("CIRCL manages or co-manages MISP, …").
    manages: { label: 'manages or co-manages', color: '#8aa0c8', width: 2, direction: 'forward', hideLabel: true },
  },
  nodes,
  edges,
}
writeFileSync(join(root, 'examples/circl.json'), `${JSON.stringify(doc, null, 2)}\n`)
console.log(`Wrote examples/circl.json: ${nodes.length} nodes, ${edges.length} edges; logos in public/logos/circl/`)
