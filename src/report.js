// The report protocol: any Pivograph document -> a report in English.
// `reportModel()` decides what is said (sections, sentences, colours); the
// renderers only lay it out: `buildReport()` here as Markdown, `reportHtml()`
// in reportPrint.js for the PDF. Pure and deterministic (same document, same
// text), so it also runs in Node (scripts/report.mjs). The rules are
// documented in docs/content/05-reports.md; keep both in step.
import { normalizeTag, parseLinks, parseTags, readableOn, resolveEdge, resolveNode, tagLook } from './model.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TAIL_WORDS = new Set(['of', 'to', 'with', 'in', 'on', 'for', 'from', 'by', 'into', 'at', 'as', 'about', 'onto', 'over', 'through'])
const VERB_STARTS = new Set(['is', 'are', 'was', 'has', 'have', 'can', 'will', 'may', 'must', 'does', 'depends', 'uses', 'use'])
const ACCENT = '#3b63f3'

// A sentence is a list of segments: a string, a node { node, name } or a tag { tag, color, fg }.
// The renderers turn nodes into bold names and tags into code or pills.

// --- the model -------------------------------------------------------------------

export function reportModel(doc) {
  const ctx = context(doc)
  const groups = nodeGroups(ctx)
  const relations = relationGroups(ctx)
  return {
    title: doc.meta?.title?.trim() || 'Untitled graph',
    description: doc.meta?.description?.trim() || '',
    counts: { nodes: ctx.nodes.length, edges: ctx.edges.length, tags: ctx.tagIndex.size },
    overview: overview(ctx, groups),
    groups: groups.map((g) => ({ ...g, nodes: g.nodes.map((n) => nodeEntry(ctx, n)) })),
    grouped: groups.length > 1 || Boolean(groups[0]?.key),
    relations,
    relationsGrouped: relations.length > 1 || Boolean(relations[0]?.key),
    tags: [...ctx.tagIndex].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, nodes]) => ({ ...pill(ctx, name), nodes: nodes.map((n) => ({ node: n.id, name: ctx.name(n.id) })) })),
  }
}

function context(doc) {
  const nodeTypes = doc.nodeTypes ?? {}
  const edgeTypes = doc.edgeTypes ?? {}
  const nodes = doc.nodes ?? []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const name = (id) => byId.get(id)?.label?.trim() || id
  const edges = (doc.edges ?? []).filter((e) => byId.has(e.from) && byId.has(e.to))
  const degree = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of edges) {
    degree.set(e.from, degree.get(e.from) + 1)
    if (e.to !== e.from) degree.set(e.to, degree.get(e.to) + 1)
  }
  const tagIndex = new Map()
  for (const n of nodes) for (const tag of parseTags(n.tags)) tagIndex.set(tag, [...(tagIndex.get(tag) ?? []), n])
  return { doc, nodeTypes, edgeTypes, tagDefs: doc.tags ?? {}, nodes, edges, name, degree, tagIndex }
}

/** A colour that shows on white: the given one, or the accent for transparent / none. */
function solid(color) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color ?? '') ? color : ACCENT
}

function pill(ctx, name) {
  const look = tagLook(name, ctx.tagDefs)
  return { tag: name, color: look.color, fg: readableOn(look.color), icon: look.icon }
}

function nodeTypeLabel(ctx, type) {
  if (!type) return ''
  return ctx.nodeTypes[type]?.label?.trim() || humanize(type)
}

function edgeTypeLabel(ctx, type) {
  if (!type) return ''
  return ctx.edgeTypes[type]?.label?.trim() || humanize(type)
}

/** Node types in the order they first appear, untyped nodes last. */
function nodeGroups(ctx) {
  const groups = new Map()
  for (const n of ctx.nodes) groups.set(n.type || '', [...(groups.get(n.type || '') ?? []), n])
  const keys = [...groups.keys()].filter(Boolean)
  if (groups.has('')) keys.push('')
  return keys.map((key) => {
    const label = key ? nodeTypeLabel(ctx, key) : 'Other'
    const nodes = groups.get(key)
    return { key, label, heading: plural(nodes.length, label), color: solid(ctx.nodeTypes[key]?.color), nodes }
  })
}

function nodeEntry(ctx, node) {
  const a = resolveNode(node, ctx.nodeTypes)
  const tags = parseTags(node.tags)
  const info = node.githubInfo
  const related = ctx.edges.filter((e) => e.from === node.id || e.to === node.id)
  return {
    id: node.id,
    name: ctx.name(node.id),
    typeLabel: nodeTypeLabel(ctx, node.type),
    color: solid(/^#/.test(a.color ?? '') ? a.color : a.borderColor),
    image: a.image,
    imageFit: a.imageFit,
    description: a.description?.trim() || '',
    url: node.url,
    github: node.github ? {
      slug: info?.fullName || node.github,
      url: info?.url || `https://github.com/${node.github}`,
      info,
      // Topics already copied into the tags are not repeated.
      topics: (info?.topics ?? []).every((t) => tags.includes(normalizeTag(t))) ? [] : info.topics,
    } : null,
    links: parseLinks(node.links),
    tags: tags.map((t) => pill(ctx, t)),
    details: node.details && Object.keys(node.details).length ? node.details : null,
    relations: mergedSentences(ctx, related),
  }
}

function relationGroups(ctx) {
  const typed = new Map()
  for (const e of ctx.edges) typed.set(e.type ?? '', [...(typed.get(e.type ?? '') ?? []), e])
  const keys = [...typed.keys()].filter(Boolean)
  if (typed.has('')) keys.push('')
  return keys.map((key) => {
    const edges = typed.get(key)
    const look = resolveEdge({ type: key || undefined }, ctx.edgeTypes)
    // Relationships with nothing more to say are merged; the others keep their own entry.
    const [plain, rich] = partition(edges, (e) => !e.description && !(e.details && Object.keys(e.details).length))
    return {
      key,
      label: key ? edgeTypeLabel(ctx, key) : 'Other relationships',
      color: solid(look.color),
      dashed: Boolean(look.dashed),
      count: edges.length,
      plain: mergedSentences(ctx, plain),
      rich: rich.map((e) => ({
        sentence: edgeSentenceSegments(ctx, e),
        description: e.description?.trim() || '',
        details: e.details && Object.keys(e.details).length ? e.details : null,
      })),
    }
  })
}

function overview(ctx, groups) {
  const { nodes, edges } = ctx
  if (!nodes.length) return ['This graph is empty.']
  const out = []
  const kinds = groups.map((g) => `${g.nodes.length} ${g.key ? lowerFirst(plural(g.nodes.length, g.label)) : plural(g.nodes.length, 'other node')}`)
  out.push(`This graph has ${nodes.length} ${plural(nodes.length, 'node')}${kinds.length > 1 || groups[0].key ? ` (${listText(kinds)})` : ''}`)
  out.push(edges.length ? ` connected by ${edges.length} ${plural(edges.length, 'relationship')}.` : ' and no relationships.')
  const edgeKinds = countBy(edges.filter((e) => e.type), (e) => edgeTypeLabel(ctx, e.type))
  if (edgeKinds.length > 1) out.push(` The relationships are ${listText(edgeKinds.map(([label, n]) => `${n} × “${label}”`))}.`)
  const hubs = [...ctx.degree].filter(([, d]) => d > 1).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (hubs.length) {
    out.push(` The most connected ${hubs.length > 1 ? 'nodes are' : 'node is'} `, ...joinSegments(hubs.map(([id, d]) => [{ node: id, name: ctx.name(id) }, ` (${d})`])), '.')
  }
  const isolated = nodes.filter((n) => !ctx.degree.get(n.id))
  if (isolated.length && edges.length) {
    out.push(' ', ...joinSegments(isolated.map((n) => [{ node: n.id, name: ctx.name(n.id) }])), ` ${isolated.length > 1 ? 'have' : 'has'} no relationship.`)
  }
  if (ctx.tagIndex.size) {
    const top = [...ctx.tagIndex].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 5)
    const count = `${ctx.tagIndex.size} ${plural(ctx.tagIndex.size, 'tag')}`
    if (top[0][1].length > 1) {
      out.push(` The nodes carry ${count}; the most used ${top.length > 1 ? 'are' : 'is'} `, ...joinSegments(top.map(([tag, list]) => [pill(ctx, tag), ` (${list.length})`])), '.')
    } else if (ctx.tagIndex.size <= 5) {
      out.push(` The nodes carry ${count}: `, ...joinSegments(top.map(([tag]) => [pill(ctx, tag)])), '.')
    } else {
      out.push(` The nodes carry ${count}, each on one node.`)
    }
  }
  return out
}

// --- sentences ------------------------------------------------------------------

const OBJECT = { object: true }

/**
 * One relationship as a sentence, reading the arrow: "forward" from source to
 * target, "backward" from target to source, "both" in both directions,
 * "none" from source to target without a direction. Returns segments.
 */
function edgeSentenceSegments(ctx, e) {
  const { template, object } = edgeTemplate(ctx, e)
  return template.flatMap((s) => (s === OBJECT ? [object] : [s]))
}

/** The same sentence as Markdown. */
export function edgeSentence(ctx, e) {
  return markdownSegments(edgeSentenceSegments(ctx, e))
}

/** The sentence with a placeholder for its object, so sentences that differ only by it can be merged. */
function edgeTemplate(ctx, e) {
  const direction = e.direction ?? ctx.edgeTypes[e.type]?.direction ?? 'forward'
  const [subjectId, objectId] = direction === 'backward' ? [e.to, e.from] : [e.from, e.to]
  const subject = { node: subjectId, name: ctx.name(subjectId) }
  const object = subjectId === objectId ? 'itself' : { node: objectId, name: ctx.name(objectId) }
  let label = (e.label ?? ctx.edgeTypes[e.type]?.label ?? '').trim() || (e.type ? humanize(e.type) : '')
  // "federates with (Connector sync)" -> "… with X (Connector sync)"
  let aside = ''
  const paren = /^(.*\S)\s*\(([^()]+)\)$/.exec(label)
  if (paren) [label, aside] = [paren[1], paren[2]]
  const both = direction === 'both' ? ', in both directions' : ''
  let t
  switch (phrase(label)) {
    case 'verb': t = [subject, ` ${label} `, OBJECT, both]; break
    case 'action': t = [subject, ` ${label} (${direction === 'both' ? '↔' : '→'} `, OBJECT, ')']; break
    case 'state': t = [subject, ` is ${label} `, OBJECT, both]; break
    case 'none': t = [subject, ' is linked to ', OBJECT, both]; break
    default: t = [subject, ' is linked to ', OBJECT, `${both} (${label})`]
  }
  if (aside) t.push(` (${aside})`)
  t.push('.')
  return { template: t.filter((s) => s !== ''), object }
}

/** Sentences for a list of edges; those that differ only by their object become one ("A maintains B, C and D."). */
function mergedSentences(ctx, edges) {
  const groups = new Map()
  for (const e of edges) {
    const { template, object } = edgeTemplate(ctx, e)
    const key = JSON.stringify(template.map((s) => (s === OBJECT ? '\u0000' : s)))
    if (!groups.has(key)) groups.set(key, { template, objects: [] })
    groups.get(key).objects.push(object)
  }
  return [...groups.values()].map(({ template, objects }) =>
    template.flatMap((s) => (s === OBJECT ? joinSegments(objects.map((o) => [o])) : [s])))
}

/**
 * How an edge label reads between two names:
 *   verb   "uses", "depends on", "draws graphs with"           -> A uses B
 *   action "pushes rules as MISP events" (carries its object)  -> A pushes rules as MISP events (→ B)
 *   state  "member of", "affiliated with", "used by"            -> A is member of B
 *   noun   "API", "upstream"                                    -> A is linked to B (API)
 */
export function phrase(label) {
  if (!label) return 'none'
  // Coordinated verbs read as one verb: "manages or co-manages", "reads and writes".
  const parts = label.split(/\s+(?:or|and)\s+/)
  if (parts.length > 1 && parts.every((p) => phrase(p) === 'verb')) return 'verb'
  const words = label.split(/\s+/)
  const first = words[0]
  if (first !== first.toLowerCase()) return 'noun'
  const last = words.at(-1)
  if (VERB_STARTS.has(first) || (/[^s]s$/.test(first) && !/(ous|ss|is|us)$/.test(first) && /^[a-z-]+$/.test(first))) {
    return words.length === 1 || TAIL_WORDS.has(last) ? 'verb' : 'action'
  }
  if (/ed$/.test(first) || TAIL_WORDS.has(last)) return 'state'
  return 'noun'
}

/** [[a], [b], [c]] -> [a, ', ', b, ' and ', c] */
function joinSegments(items) {
  return items.flatMap((item, i) => [...(i === 0 ? [] : [i === items.length - 1 ? ' and ' : ', ']), ...item])
}

// --- Markdown ---------------------------------------------------------------------

/**
 * The report as Markdown. Options:
 *   image   URL or data URL of a picture of the graph, shown under the title
 *   date    Date the report is generated (defaults to now)
 */
export function buildReport(doc, { image, date = new Date() } = {}) {
  const m = reportModel(doc)
  const out = [`# ${inline(m.title)}`]
  if (image) out.push(`![Graph of ${inline(m.title)}][graph-image]`)
  if (m.description) out.push(paragraph(m.description))
  out.push(`## Overview\n\n${markdownSegments(m.overview)}`)
  if (m.counts.nodes) {
    const nodes = ['## Nodes']
    for (const group of m.groups) {
      if (m.grouped) nodes.push(`### ${inline(group.heading)}`)
      for (const node of group.nodes) nodes.push(markdownNode(node, m.grouped ? '####' : '###'))
    }
    out.push(nodes.join('\n\n'))
  }
  if (m.counts.edges) {
    const rels = ['## Relationships']
    for (const group of m.relations) {
      if (m.relationsGrouped) rels.push(`### ${inline(capitalize(group.label))}`)
      if (group.plain.length) rels.push(group.plain.map((s) => `- ${markdownSegments(s)}`).join('\n'))
      for (const r of group.rich) {
        const parts = [`- ${markdownSegments(r.sentence)}`]
        if (r.description) parts.push(indent(paragraph(r.description), '  '))
        if (r.details) parts.push(indent(detailsList(r.details), '  '))
        rels.push(parts.join('\n\n'))
      }
    }
    out.push(rels.join('\n\n'))
  }
  if (m.tags.length) {
    out.push(`## Tags\n\n${m.tags.map((t) => `- ${tagCode(t.tag)}: ${listText(t.nodes.map((n) => inline(n.name)))}`).join('\n')}`)
  }
  out.push(`---\n\n*Report generated by Pivograph on ${formatDate(date)}: ${m.counts.nodes} ${plural(m.counts.nodes, 'node')}, ${m.counts.edges} ${plural(m.counts.edges, 'relationship')}.*`)
  if (image) out.push(`[graph-image]: ${image}`)
  return `${out.join('\n\n')}\n`
}

function markdownNode(node, heading) {
  const out = [`${heading} ${inline(node.name)}`]
  let intro = node.typeLabel ? `${inline(node.name)} is ${article(node.typeLabel)} ${inline(lowerFirst(node.typeLabel))}.` : ''
  if (node.description) intro = `${intro} ${sentence(node.description)}`.trim()
  if (intro) out.push(intro)
  const facts = []
  if (node.url) facts.push(`- **Website:** ${autolink(node.url)}`)
  if (node.github) facts.push(`- **Source code:** ${markdownGithub(node.github)}`)
  for (const link of node.links) facts.push(`- **${inline(link.label || 'Link')}:** ${autolink(link.url)}`)
  if (node.tags.length) facts.push(`- **Tags:** ${node.tags.map((t) => tagCode(t.tag)).join(', ')}`)
  if (facts.length) out.push(facts.join('\n'))
  if (node.details) out.push(`**Details**\n\n${detailsList(node.details)}`)
  if (node.relations.length) out.push(`**Relationships**\n\n${node.relations.map((s) => `- ${markdownSegments(s)}`).join('\n')}`)
  return out.join('\n\n')
}

function markdownGithub({ slug, url, info, topics }) {
  const first = `[${inline(slug)}](${url})`
  if (!info) return `${first}.`
  const parts = [info.description ? `${first} — ${sentence(info.description)}` : `${first}.`]
  const clauses = githubClauses(info)
  if (clauses.length) parts.push(`The repository ${listText(clauses)}.`)
  if (info.archived) parts.push('It is archived.')
  if (topics.length) parts.push(`Topics: ${topics.map(inline).join(', ')}.`)
  if (info.fetchedAt) parts.push(`*(GitHub data of ${formatDate(info.fetchedAt)}.)*`)
  return parts.join(' ')
}

/** "has 55 stars, 9 forks and 14 open issues", "is written mainly in Python", … */
function githubClauses(info) {
  const facts = []
  if (Number.isFinite(info.stars)) facts.push(`${info.stars} ${plural(info.stars, 'star')}`)
  if (Number.isFinite(info.forks)) facts.push(`${info.forks} ${plural(info.forks, 'fork')}`)
  if (Number.isFinite(info.issues)) facts.push(`${info.issues} open ${plural(info.issues, 'issue')}`)
  const clauses = []
  if (facts.length) clauses.push(`has ${listText(facts)}`)
  if (info.language) clauses.push(`is written mainly in ${inline(info.language)}`)
  if (info.license) clauses.push(`is licensed under ${inline(info.license)}`)
  if (info.pushedAt) clauses.push(`was last updated on ${formatDate(info.pushedAt)}`)
  return clauses
}

function markdownSegments(segments) {
  return segments.map((s) => {
    if (typeof s === 'string') return inline(s)
    if (s.node !== undefined) return `**${inline(s.name)}**`
    if (s.tag !== undefined) return tagCode(s.tag)
    return ''
  }).join('')
}

/** Free-form details as a nested list, keys with "_" turned into spaces. */
function detailsList(details, depth = 0) {
  const pad = '  '.repeat(depth)
  return Object.entries(details).map(([key, value]) => {
    const label = `${pad}- **${inline(detailKey(key))}:**`
    if (isObject(value)) return `${label}\n${detailsList(value, depth + 1)}`
    if (Array.isArray(value)) {
      if (value.every((v) => !isObject(v) && !Array.isArray(v))) return `${label} ${value.map(scalar).join(', ')}`
      return `${label}\n${value.map((v, i) => isObject(v) ? detailsList(v, depth + 1).replace(/^(\s*)- /, `$1- (${i + 1}) `) : `${pad}  - ${scalar(v)}`).join('\n')}`
    }
    return `${label} ${scalar(value)}`
  }).join('\n')
}

function scalar(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const text = String(value)
  if (/^(https?:\/\/|mailto:)\S+$/i.test(text)) return autolink(text)
  return inline(text)
}

// --- text helpers ---------------------------------------------------------------------

/** Escapes Markdown syntax in text that comes from the document. */
export function inline(text) {
  return String(text).replace(/\s*\n\s*/g, ' ').replace(/([\\`*_[\]<>|#])/g, '\\$1')
}

/** A text of the document as paragraphs, blank lines kept. */
function paragraph(text) {
  return String(text).trim().split(/\n\s*\n/).map((p) => inline(p.trim())).join('\n\n')
}

/** A text as a sentence: escaped, ending with a full stop. */
function sentence(text) {
  const t = paragraph(text)
  return /[.!?:)»”"]$/.test(t) ? t : `${t}.`
}

function indent(text, pad) {
  return text.split('\n').map((l) => (l ? pad + l : l)).join('\n')
}

function autolink(url) {
  return /^(https?:\/\/|mailto:)\S+$/i.test(url) ? `<${url}>` : inline(url)
}

function tagCode(tag) {
  return `\`#${tag.replace(/`/g, '')}\``
}

export function listText(items) {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function partition(items, test) {
  return [items.filter(test), items.filter((i) => !test(i))]
}

function countBy(items, key) {
  const counts = new Map()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return [...counts]
}

export function plural(n, word) {
  if (n === 1) return word
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
  return `${word}s`
}

export function article(word) {
  return /^[aeiou]/i.test(word) && !/^(uni|use|one|eu)/i.test(word) ? 'an' : 'a'
}

function humanize(id) {
  return String(id).replace(/[_-]+/g, ' ').trim()
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Open data" -> "open data", but "MISP instance", "API" and "GitHub organisation" stay. */
export function lowerFirst(text) {
  return /^[A-Z][a-z]*(\s|$)/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}

export function detailKey(key) {
  return capitalize(String(key).replace(/_/g, ' '))
}

export function formatDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
