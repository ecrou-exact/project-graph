// The Pivograph document format and its translation to Pivotick nodes/edges.
//
// Every visual attribute lives in the node/edge `data`, never only in the
// Pivotick style: the style is always recomputed from data + types, so an edit
// made through Pivotick's own tools restyles the element too.

export const FORMAT_VERSION = 1

// `card`: a rounded box with the image and the label inside (as in a drawn diagram).
export const SHAPES = ['circle', 'square', 'triangle', 'hexagon', 'card']
export const IMAGE_FITS = ['cover', 'contain', 'icon', 'frame']
export const DIRECTIONS = {
  forward: { symbol: '→', label: 'Source → target' },
  backward: { symbol: '←', label: 'Target → source' },
  both: { symbol: '↔', label: 'Both ways' },
  none: { symbol: '—', label: 'No arrow' },
}

// Named label fonts; any other labelFont value is used as a CSS font-family.
export const LABEL_FONTS = {
  sans: { label: 'Sans-serif', css: 'system-ui, "Segoe UI", Roboto, sans-serif' },
  serif: { label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  mono: { label: 'Monospace', css: 'ui-monospace, Menlo, Consolas, monospace' },
  rounded: { label: 'Rounded', css: 'ui-rounded, "Nunito", "Arial Rounded MT Bold", sans-serif' },
  condensed: { label: 'Condensed', css: '"Arial Narrow", "Roboto Condensed", sans-serif' },
  // Excalidraw's hand-drawn font, bundled (public/fonts, src/fonts.js).
  hand: { label: 'Hand-drawn', css: 'Virgil, "Segoe Print", "Comic Sans MS", cursive' },
}

export const DEFAULT_NODE = { color: '#4f7cff', shape: 'circle', size: 14 }
export const DEFAULT_EDGE = { color: '#8a94a6', width: 2, direction: 'forward' }

// Node appearance keys a type can provide too.
const NODE_LOOK = [
  'color', 'shape', 'size', 'image', 'imageFit',
  // card shape only: box size, inner space, image height, image beside or above the label
  'width', 'height', 'padding', 'imageSize', 'imagePosition',
  'borderColor', 'borderWidth',
  'hideLabel', 'labelColor', 'labelBackground', 'labelSize', 'labelFont',
  'hideBadges',
]
export const NODE_FIELDS = ['label', 'subtitle', 'type', 'description', 'url', 'graph', 'github', 'githubInfo', 'links', 'tags', 'details', ...NODE_LOOK]
export const TAG_FIELDS = ['color', 'icon']

// Colours given to tags that have no colour of their own (picked from the name).
export const TAG_PALETTE = ['#3b63f3', '#0f9d8a', '#e8833a', '#d6384b', '#7c5cd6', '#2f9e44', '#c2860b', '#56627a']
// Edge appearance keys a type can provide too.
const EDGE_LOOK = [
  'direction', 'color', 'width', 'dashed', 'curve', 'animated',
  'hideLabel', 'labelColor', 'labelBackground', 'labelSize', 'labelFont',
]
export const EDGE_FIELDS = ['label', 'type', 'description', 'details', ...EDGE_LOOK]
export const NODE_TYPE_FIELDS = ['label', ...NODE_LOOK]

// Sections: titled frames drawn behind the graph, for the picture only (they
// hold no nodes). Position and size are in graph coordinates.
export const SECTION_FIELDS = ['title', 'x', 'y', 'width', 'height', 'color', 'fill', 'borderColor', 'titleSize', 'titleFont', 'underline']
export const DEFAULT_SECTION = { width: 400, height: 240, titleSize: 22 }

// What a card node looks like when the node and its type don't say.
export const DEFAULT_CARD = { color: '#ffffff', borderColor: '#9aa3b5', borderWidth: 2, padding: 16, imageSize: 56, labelSize: 15 }
export const IMAGE_POSITIONS = ['top', 'left']

// Arrows: drawn by Pivograph like sections, from / to a node, a section or a
// free point. `at` places the end on the target's box: [0, 0] is its top-left
// corner, [1, 1] its bottom-right; without it, the end sits on the border facing the other end.
export const ARROW_FIELDS = [
  'from', 'to', 'label', 'description', 'direction', 'route',
  'color', 'width', 'dashed', 'labelColor', 'labelSize', 'labelFont', 'labelBackground', 'labelOffset',
]
export const ROUTES = ['straight', 'elbow']
export const DEFAULT_ARROW = { color: '#343a40', width: 2, direction: 'forward', route: 'straight', labelSize: 14 }
export const EDGE_TYPE_FIELDS = ['label', ...EDGE_LOOK]

// Edge shapes, and Pivotick's name for each ("auto" curves only parallel edges).
export const CURVES = {
  auto: { label: 'Auto', pivotick: 'bidirectional' },
  straight: { label: 'Straight', pivotick: 'straight' },
  curved: { label: 'Curved', pivotick: 'curved' },
}

// Marker ids registered in Pivotick's markerStyleMap. Any id missing from the
// map draws no marker, which is how an edge end loses its arrow.
export const MARKER_END = 'pg-arrow'
export const MARKER_START = 'pg-arrow-start'
export const NO_MARKER = 'pg-none'

export function emptyDocument() {
  return {
    version: FORMAT_VERSION,
    meta: { title: 'New graph', description: '' },
    nodeTypes: {},
    edgeTypes: {},
    tags: {},
    sections: [],
    arrows: [],
    nodes: [],
    edges: [],
  }
}

/**
 * What "New graph" starts from: no nodes yet, but a set of ready-to-use types
 * (one per bundled icon, plus common relations) so the Type menus aren't empty.
 */
export function starterDocument() {
  const icon = (name) => ({ image: `icons/${name}.svg`, imageFit: 'icon' })
  return {
    ...emptyDocument(),
    nodeTypes: {
      project: { label: 'Project', color: '#3b63f3', shape: 'hexagon', size: 24, ...icon('project') },
      platform: { label: 'Platform', color: '#0f9d8a', shape: 'circle', size: 18, ...icon('platform') },
      tool: { label: 'Tool', color: '#2f9e44', shape: 'circle', size: 16, ...icon('tool') },
      data: { label: 'Data source', color: '#c2860b', shape: 'circle', size: 16, ...icon('data') },
      format: { label: 'Format', color: '#e8833a', shape: 'square', size: 14, ...icon('format') },
      rule: { label: 'Rule set', color: '#d6384b', shape: 'square', size: 14, ...icon('rule') },
      code: { label: 'Repository', color: '#7c5cd6', shape: 'circle', size: 16, ...icon('code') },
      organization: { label: 'Organization', color: '#56627a', shape: 'square', size: 18, ...icon('organization') },
    },
    edgeTypes: {
      uses: { label: 'uses', color: '#8a94a6' },
      depends: { label: 'depends on', color: '#56627a', dashed: true },
      integrates: { label: 'integrates with', color: '#0f9d8a', direction: 'both', width: 3 },
      exports: { label: 'exports to', color: '#3b63f3' },
      imports: { label: 'imports from', color: '#7c5cd6', direction: 'backward' },
      develops: { label: 'develops', color: '#56627a', dashed: true },
    },
  }
}

/** Drops undefined / null / '' values so the JSON stays minimal and inheritance works. */
export function compact(obj, allowed) {
  const out = {}
  for (const key of allowed ?? Object.keys(obj)) {
    const value = obj[key]
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    if (isPlainObject(value) && Object.keys(value).length === 0) continue
    out[key] = value
  }
  return out
}

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueId(base, taken) {
  const root = slugify(base) || 'item'
  let id = root
  for (let i = 2; taken.has(id); i++) id = `${root}-${i}`
  return id
}

/**
 * Validates and normalizes a raw (parsed) document.
 * @returns {{ doc: object|null, errors: string[], warnings: string[] }}
 */
export function parseDocument(raw) {
  const errors = []
  const warnings = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { doc: null, errors: ['The JSON must be an object.'], warnings }
  }

  const doc = emptyDocument()
  doc.meta = { ...doc.meta, ...(isPlainObject(raw.meta) ? raw.meta : {}) }

  for (const key of ['nodeTypes', 'edgeTypes']) {
    if (raw[key] === undefined) continue
    if (!isPlainObject(raw[key])) {
      errors.push(`"${key}" must be an object { typeName: {...} }.`)
      continue
    }
    const fields = key === 'nodeTypes' ? NODE_TYPE_FIELDS : EDGE_TYPE_FIELDS
    for (const [name, def] of Object.entries(raw[key])) {
      doc[key][name] = compact(isPlainObject(def) ? def : {}, fields)
    }
  }

  if (raw.tags !== undefined) {
    if (!isPlainObject(raw.tags)) errors.push('"tags" must be an object { tagName: {...} }.')
    else {
      for (const [name, def] of Object.entries(raw.tags)) {
        const key = normalizeTag(name)
        if (key) doc.tags[key] = compact(isPlainObject(def) ? def : {}, TAG_FIELDS)
      }
    }
  }

  if (raw.sections !== undefined) {
    if (!Array.isArray(raw.sections)) errors.push('"sections" must be an array.')
    else {
      const sectionIds = new Set()
      raw.sections.forEach((sec, i) => {
        if (!isPlainObject(sec)) return warnings.push(`sections[${i}] is not an object, ignored.`)
        const section = parseSection(sec)
        if (!section) return warnings.push(`sections[${i}] needs numbers "x" and "y", ignored.`)
        section.id = uniqueId(sec.id ?? section.title ?? 'section', sectionIds)
        sectionIds.add(section.id)
        doc.sections.push(section)
      })
    }
  }

  if (raw.nodes !== undefined && !Array.isArray(raw.nodes)) errors.push('"nodes" must be an array.')
  if (raw.edges !== undefined && !Array.isArray(raw.edges)) errors.push('"edges" must be an array.')
  if (errors.length) return { doc: null, errors, warnings }

  const ids = new Set()
  ;(raw.nodes ?? []).forEach((n, i) => {
    if (!isPlainObject(n)) return errors.push(`nodes[${i}] must be an object.`)
    if (n.id === undefined || n.id === null || n.id === '') return errors.push(`nodes[${i}] has no "id".`)
    const id = String(n.id)
    if (ids.has(id)) return errors.push(`Duplicate node id: "${id}".`)
    ids.add(id)
    const github = n.github === undefined || n.github === '' ? undefined : parseGithub(n.github)
    if (n.github && !github) warnings.push(`Node "${id}": "${n.github}" is not a GitHub repository (owner/repo).`)
    // githubInfo: the repository summary saved when the node was edited (no API call on display).
    const githubInfo = github ? parseDetails(n.githubInfo) : {}
    const node = { id, ...compact({ ...n, tags: parseTags(n.tags), github, githubInfo, links: parseLinks(n.links), details: parseDetails(n.details) }, NODE_FIELDS) }
    if (node.label === undefined) node.label = id
    if (node.shape && !SHAPES.includes(node.shape)) {
      warnings.push(`Node "${id}": unknown shape "${node.shape}", ignored.`)
      delete node.shape
    }
    if (node.type && !doc.nodeTypes[node.type]) {
      warnings.push(`Node "${id}": type "${node.type}" is not declared in nodeTypes.`)
    }
    if (Number.isFinite(n.x) && Number.isFinite(n.y)) Object.assign(node, { x: n.x, y: n.y })
    doc.nodes.push(node)
  })

  const edgeIds = new Set()
  ;(raw.edges ?? []).forEach((e, i) => {
    if (!isPlainObject(e)) return errors.push(`edges[${i}] must be an object.`)
    const from = e.from === undefined ? undefined : String(e.from)
    const to = e.to === undefined ? undefined : String(e.to)
    if (!from || !to) return errors.push(`edges[${i}] must have "from" and "to".`)
    if (!ids.has(from)) return errors.push(`edges[${i}]: source node "${from}" does not exist.`)
    if (!ids.has(to)) return errors.push(`edges[${i}]: target node "${to}" does not exist.`)
    let id = e.id !== undefined && e.id !== '' ? String(e.id) : uniqueId(`${from}-${to}`, edgeIds)
    if (edgeIds.has(id)) {
      warnings.push(`Duplicate edge id "${id}", renamed.`)
      id = uniqueId(id, edgeIds)
    }
    edgeIds.add(id)
    const edge = { id, from, to, ...compact({ ...e, details: parseDetails(e.details) }, EDGE_FIELDS) }
    if (edge.direction && !DIRECTIONS[edge.direction]) {
      warnings.push(`Edge "${id}": unknown direction "${edge.direction}", ignored.`)
      delete edge.direction
    }
    if (edge.type && !doc.edgeTypes[edge.type]) {
      warnings.push(`Edge "${id}": type "${edge.type}" is not declared in edgeTypes.`)
    }
    doc.edges.push(edge)
  })

  if (raw.arrows !== undefined) {
    if (!Array.isArray(raw.arrows)) errors.push('"arrows" must be an array.')
    else {
      const sectionIds = new Set(doc.sections.map((sec) => sec.id))
      const arrowIds = new Set()
      raw.arrows.forEach((input, i) => {
        if (!isPlainObject(input)) return warnings.push(`arrows[${i}] is not an object, ignored.`)
        const arrow = parseArrow(input, ids, sectionIds)
        if (typeof arrow === 'string') return warnings.push(`arrows[${i}]: ${arrow}, ignored.`)
        arrow.id = uniqueId(input.id ?? 'arrow', arrowIds)
        arrowIds.add(arrow.id)
        doc.arrows.push(arrow)
      })
    }
  }

  return { doc: errors.length ? null : doc, errors, warnings }
}

/**
 * An arrow with its ends checked, or the reason it can't be drawn (a string).
 * An end is { node, at? }, { section, at? } or { x, y }.
 */
export function parseArrow(input, nodeIds, sectionIds) {
  const from = parseArrowEnd(input.from, nodeIds, sectionIds)
  const to = parseArrowEnd(input.to, nodeIds, sectionIds)
  if (typeof from === 'string') return `"from" ${from}`
  if (typeof to === 'string') return `"to" ${to}`
  const arrow = compact({ ...input, from, to }, ARROW_FIELDS)
  if (arrow.direction && !DIRECTIONS[arrow.direction]) delete arrow.direction
  if (arrow.route && !ROUTES.includes(arrow.route)) delete arrow.route
  if (arrow.dashed !== undefined) arrow.dashed = isTrue(arrow.dashed)
  const offset = pair(arrow.labelOffset)
  if (offset) arrow.labelOffset = offset.map(Math.round)
  else delete arrow.labelOffset
  return { id: undefined, ...arrow }
}

function parseArrowEnd(end, nodeIds, sectionIds) {
  if (!isPlainObject(end)) return 'must be { node }, { section } or { x, y }'
  const at = pair(end.at)
  const placed = (target) => (at ? { ...target, at: at.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000) } : target)
  if (end.node !== undefined) {
    const id = String(end.node)
    return nodeIds.has(id) ? placed({ node: id }) : `points to the missing node "${id}"`
  }
  if (end.section !== undefined) {
    const id = String(end.section)
    return sectionIds.has(id) ? placed({ section: id }) : `points to the missing section "${id}"`
  }
  const x = Number(end.x)
  const y = Number(end.y)
  return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : 'must be { node }, { section } or { x, y }'
}

/** [a, b] of finite numbers, or null. */
function pair(value) {
  return Array.isArray(value) && value.length === 2 && value.every((v) => Number.isFinite(Number(v))) ? value.map(Number) : null
}

/** Arrow attributes with the defaults filled in. */
export function resolveArrow(arrow) {
  return { ...DEFAULT_ARROW, ...compact(arrow) }
}

/** A section with its fields cleaned up, or null without a position. */
export function parseSection(input) {
  const x = Number(input.x)
  const y = Number(input.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const section = compact({ ...input, x: Math.round(x), y: Math.round(y) }, SECTION_FIELDS)
  for (const key of ['width', 'height', 'titleSize']) {
    const value = Number(section[key])
    if (Number.isFinite(value) && value > 0) section[key] = Math.round(value)
    else delete section[key]
  }
  if (section.underline !== undefined) section.underline = isTrue(section.underline)
  return { id: input.id === undefined ? undefined : String(input.id), ...section }
}

/** Section attributes with the defaults filled in. */
export function resolveSection(section) {
  return { ...DEFAULT_SECTION, ...compact(section) }
}

/** Node attributes after applying its type's defaults. */
export function resolveNode(data, nodeTypes = {}) {
  const type = (data.type && nodeTypes[data.type]) || {}
  return { ...DEFAULT_NODE, ...compact(type, NODE_TYPE_FIELDS), ...compact(data, NODE_FIELDS) }
}

/** Edge attributes after applying its type's defaults. */
export function resolveEdge(data, edgeTypes = {}) {
  const type = (data.type && edgeTypes[data.type]) || {}
  return { ...DEFAULT_EDGE, ...compact(type, EDGE_TYPE_FIELDS), ...compact(data, EDGE_FIELDS) }
}

/**
 * A GitHub repository as "owner/repo", from "owner/repo", a github.com URL
 * (any page of the repo) or a git remote. Null when it isn't one.
 */
export function parseGithub(input) {
  const text = String(input ?? '').trim()
  const m = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com[/:]|git@github\.com:)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#].*)?$/.exec(text)
  if (!m || m[2] === '.' || m[2] === '..') return null
  return `${m[1]}/${m[2]}`
}

/** Extra links: [{ label?, url }], dropping entries without a usable URL. */
export function parseLinks(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((link) => (typeof link === 'string' ? { url: link } : link))
    .filter((link) => link && typeof link.url === 'string' && link.url.trim())
    .map((link) => compact({ label: link.label?.trim?.(), url: link.url.trim() }))
}

/**
 * Free-form extra fields shown in the details panel. Values are strings,
 * numbers, booleans, lists, or nested objects of those (e.g. an OCD project's
 * "repository": { "url": …, "license": … }), kept in their original order.
 * Empty values are dropped.
 */
export function parseDetails(input, depth = 0) {
  if (!isPlainObject(input) || depth > 5) return {}
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    const name = String(key).trim()
    if (!name) continue
    const clean = detailValue(value, depth)
    if (clean !== undefined) out[name] = clean
  }
  return out
}

function detailValue(value, depth) {
  if (typeof value === 'string') return value.trim() ? value : undefined
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const items = value.map((v) => detailValue(v, depth + 1)).filter((v) => v !== undefined)
    return items.length ? items : undefined
  }
  if (isPlainObject(value)) {
    const nested = parseDetails(value, depth + 1)
    return Object.keys(nested).length ? nested : undefined
  }
  return undefined
}

/** "#security #cve, open source" (or an array) -> ['security', 'cve', 'open-source'] */
export function parseTags(input) {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(/[\s,]*#|,/)
  const tags = []
  for (const part of parts) {
    const tag = normalizeTag(part)
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

export function normalizeTag(text) {
  return String(text ?? '').trim().replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-')
}

/** How a tag is drawn: its own settings, or a colour picked from the palette. */
export function tagLook(name, tags = {}) {
  const def = tags[name] ?? {}
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return {
    color: def.color ?? TAG_PALETTE[hash % TAG_PALETTE.length],
    icon: def.icon,
  }
}

/**
 * The tag pills drawn under a node (none when badges are hidden): each one's
 * name, colour, readable text colour and optional icon.
 */
export function nodePills(data, nodeTypes, tags) {
  const a = resolveNode(data, nodeTypes)
  if (isTrue(a.hideBadges)) return []
  return parseTags(data.tags).map((name) => {
    const look = tagLook(name, tags)
    return { name, color: look.color, fg: readableOn(look.color), icon: look.icon }
  })
}

/** Black or white, whichever reads better on the given #rrggbb colour. */
export function readableOn(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim())
  if (!m) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.6 ? '#1c2230' : '#ffffff'
}

/** Resolved look of a card node: the node's and its type's values, then the card defaults. */
export function cardLook(data, nodeTypes) {
  const type = (data.type && nodeTypes?.[data.type]) || {}
  const a = { ...DEFAULT_CARD, ...compact(type, NODE_TYPE_FIELDS), ...compact(data, NODE_FIELDS) }
  // A type made for round nodes has a white border: on a white card, fall back to grey.
  if (!data.borderColor && !type.borderColor) a.borderColor = DEFAULT_CARD.borderColor
  return {
    ...a,
    hideLabel: isTrue(a.hideLabel),
    imagePosition: IMAGE_POSITIONS.includes(a.imagePosition) ? a.imagePosition : 'top',
    font: a.labelFont ? LABEL_FONTS[a.labelFont]?.css ?? a.labelFont : undefined,
    textColor: a.labelColor ?? readableOn(a.color),
  }
}

export function nodeStyle(data, nodeTypes) {
  const a = resolveNode(data, nodeTypes)
  // A card is HTML drawn by graph.js (Pivotick's `html` channel): no shape behind it.
  if (a.shape === 'card') return { shape: 'none', color: cardLook(data, nodeTypes).color, size: 4 }
  const style = {
    color: a.color,
    shape: SHAPES.includes(a.shape) ? a.shape : DEFAULT_NODE.shape,
    size: Number(a.size) || DEFAULT_NODE.size,
  }
  // The label is drawn under the node rather than inside it.
  // Pivotick's shift is in node radii: -1 puts the label just below the shape.
  if (!isTrue(a.hideLabel)) {
    style.text = a.label ?? ''
    style.textVerticalShift = -1
    style.textTruncate = false
  }
  if (a.borderColor) style.strokeColor = a.borderColor
  if (a.borderWidth !== undefined && Number.isFinite(Number(a.borderWidth))) style.strokeWidth = Number(a.borderWidth)
  // Tags are drawn as pills under the label (graph.js), not as Pivotick's corner
  // badges, which look like status indicators and only fit three characters.
  if (a.image) {
    style.imagePath = a.image
    style.imageFit = IMAGE_FITS.includes(a.imageFit) ? a.imageFit : 'cover'
  }
  return style
}

export function edgeStyle(data, edgeTypes) {
  const a = resolveEdge(data, edgeTypes)
  const direction = DIRECTIONS[a.direction] ? a.direction : DEFAULT_EDGE.direction
  return {
    edge: {
      strokeColor: a.color,
      strokeWidth: Number(a.width) || DEFAULT_EDGE.width,
      // An animated line is a dashed line whose dashes move along the edge.
      dashed: isTrue(a.dashed) || isTrue(a.animated),
      animateDash: isTrue(a.animated),
      curveStyle: (CURVES[a.curve] ?? CURVES.auto).pivotick,
      markerEnd: direction === 'forward' || direction === 'both' ? MARKER_END : NO_MARKER,
      markerStart: direction === 'backward' || direction === 'both' ? MARKER_START : NO_MARKER,
    },
    label: {},
  }
}

export function edgeLabel(data, edgeTypes) {
  return resolveEdge(data, edgeTypes).label ?? ''
}

/** How an edge's label is drawn: hidden, or its colours, size and font. */
export function edgeLabelLook(data, edgeTypes) {
  const a = resolveEdge(data, edgeTypes)
  return {
    hidden: isTrue(a.hideLabel),
    color: a.labelColor,
    background: a.labelBackground,
    size: Number(a.labelSize) || undefined,
    font: a.labelFont ? LABEL_FONTS[a.labelFont]?.css ?? a.labelFont : undefined,
  }
}

/** Document node -> Pivotick RawNode. */
export function toRawNode(node, doc) {
  const data = compact(node, NODE_FIELDS)
  const raw = { id: node.id, data, style: nodeStyle(data, doc.nodeTypes) }
  if (Number.isFinite(node.x) && Number.isFinite(node.y)) Object.assign(raw, { x: node.x, y: node.y })
  return raw
}

/** Document edge -> Pivotick RawEdge. */
export function toRawEdge(edge, doc) {
  const data = compact(edge, EDGE_FIELDS)
  return { id: edge.id, from: edge.from, to: edge.to, data, style: edgeStyle(data, doc.edgeTypes) }
}

/**
 * Reads nodes and edges back out of Pivotick into the document format.
 * @param {{ getNodes(): any[], getEdges(): any[] }} graph
 * @param {boolean} withPositions keep the current layout (x/y) in the export
 */
export function fromGraph(graph, base, withPositions = true) {
  const doc = {
    version: FORMAT_VERSION,
    meta: base.meta,
    nodeTypes: base.nodeTypes,
    edgeTypes: base.edgeTypes,
    tags: base.tags ?? {},
    // Sections are drawn by Pivograph, not Pivotick: they come from the base.
    sections: (base.sections ?? []).map((s) => ({ ...s })),
    arrows: (base.arrows ?? []).map((a) => structuredClone(a)),
    nodes: [],
    edges: [],
  }
  for (const n of graph.getNodes()) {
    const node = { id: String(n.id), ...compact(n.getData(), NODE_FIELDS) }
    if (withPositions && Number.isFinite(n.x) && Number.isFinite(n.y)) {
      node.x = Math.round(n.x)
      node.y = Math.round(n.y)
    }
    doc.nodes.push(node)
  }
  for (const e of graph.getEdges()) {
    doc.edges.push({ id: String(e.id), from: String(e.from.id), to: String(e.to.id), ...compact(e.getData(), EDGE_FIELDS) })
  }
  return doc
}

/**
 * Label look that Pivotick can't take per node (it draws outside labels with one
 * global style): text colour, background ('none' for no background), size and font.
 * Returns null when the node keeps the default look.
 */
export function nodeLabelLook(data, nodeTypes) {
  const a = resolveNode(data, nodeTypes)
  const font = a.labelFont ? LABEL_FONTS[a.labelFont]?.css ?? a.labelFont : undefined
  const look = compact({ color: a.labelColor, background: a.labelBackground, size: Number(a.labelSize) || undefined, font })
  return Object.keys(look).length ? look : null
}

function isTrue(v) {
  return v === true || v === 'true'
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
