// Mermaid flowcharts as Pivograph diagrams: `flowchart LR` / `graph TD` text
// (the format of GitHub, GitLab, Notion, Obsidian…) becomes nodes, edges and
// sections, laid out once as a flowchart in a fixed layout — then everything
// is editable as usual.
//
// Understood: the direction; node shapes A[box] A(rounded) A([pill])
// A((circle)) A{diamond} A{{hexagon}} A[(database)] A[[subroutine]] A>flag]
// A[/parallelogram/] A[\parallelogram\]; quoted texts and <br>; links -->
// --- -.-> ==> <--> --o --x ~~~ with |label| or -- label -->; chains (A --> B
// --> C) and groups (A & B --> C); subgraph … end (sections, nested too);
// style, classDef, class and :::class (fill, stroke, stroke-width, color,
// stroke-dasharray); %% comments. Anything else is skipped and reported.
import { boundingBox, layeredLayout } from './layout.js'
import { DEFAULT_CARD, FORMAT_VERSION, slugify, uniqueId } from './model.js'

/** Does this text look like a Mermaid flowchart? */
export function isMermaid(text) {
  return /^\s*(?:%%[^\n]*\n\s*)*(?:---[\s\S]*?---\s*)?(?:flowchart|graph)\b/i.test(String(text ?? ''))
}

// Opening bracket → [closing bracket, card shape]. Longest first.
const SHAPES = [
  ['(((', ')))', 'ellipse'],
  ['((', '))', 'ellipse'],
  ['([', '])', 'pill'],
  ['[(', ')]', 'cylinder'],
  ['[[', ']]', 'card'],
  ['{{', '}}', 'card'],
  ['[/', '/]', 'parallelogram'],
  ['[\\', '\\]', 'parallelogram'],
  ['[/', '\\]', 'parallelogram'],
  ['[\\', '/]', 'parallelogram'],
  ['[', ']', 'card'],
  ['(', ')', 'card'],
  ['{', '}', 'diamond'],
  ['>', ']', 'document'],
]

const ID = /^[A-Za-z0-9_À-￿]+(?:[.-][A-Za-z0-9_À-￿]+)*/
// A link without text: arrow heads, line kind, optional |label|.
const LINK = /^(<|o(?=-|=)|x(?=-|=))?(-{2,}|={2,}|-\.+-|~{3,})(>|o(?![\w])|x(?![\w]))?\s*(?:\|([^|]*)\|)?/
// A link with its text in the middle: A -- text --> B, A -. text .-> B, A == text ==> B.
const TEXT_LINK = /^(<)?(--|==|-\.)\s*([^>|]+?)\s*(-{2,}|={2,}|\.-+)(>|o(?![\w])|x(?![\w]))?/

/**
 * @returns {{ doc: object|null, errors: string[], warnings: string[] }}
 *   doc is a raw Pivograph document (to go through parseDocument).
 */
export function mermaidToDocument(text, { title } = {}) {
  const errors = []
  const warnings = []
  const source = String(text ?? '').replace(/\r\n?/g, '\n')
  const lines = splitStatements(stripFrontMatter(source))
  const header = lines.shift()
  const m = header && /^(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?\s*$/i.exec(header.text)
  if (!m) return { doc: null, errors: ['The text must start with "flowchart" or "graph" (and a direction: TD, LR…).'], warnings }
  let direction = (m[1] ?? 'TB').toUpperCase().replace('TD', 'TB')

  const nodes = new Map() // id -> node
  const edges = []
  const classes = new Map() // name -> style
  const nodeClasses = new Map() // id -> [class names]
  const nodeStyles = new Map() // id -> style
  const subgraphs = [] // { id, title, members: Set, parent }
  const stack = []
  const owned = new Set()
  const frontmatterTitle = /^---[\s\S]*?\btitle:\s*(.+)\n[\s\S]*?---/.exec(source)?.[1]?.trim()

  const touch = (id, label, shape) => {
    let node = nodes.get(id)
    if (!node) {
      node = { id, label: id, shape: 'card' }
      nodes.set(id, node)
    }
    if (label !== undefined) node.label = label
    if (shape) node.shape = shape
    // A node belongs to the subgraph where it first appears (and that one's parents).
    if (!owned.has(id) && stack.length) {
      owned.add(id)
      for (const sub of stack) sub.members.add(id)
    }
    return node
  }

  for (const { text: line, number } of lines) {
    let rest
    if ((rest = /^subgraph\b\s*(.*)$/i.exec(line))) {
      const spec = rest[1].trim()
      const titled = /^([^\s[]+)\s*\[\s*(.*?)\s*\]$/.exec(spec)
      const name = titled ? cleanText(titled[2]) : cleanText(spec) || `Group ${subgraphs.length + 1}`
      const id = titled ? titled[1] : slugify(name) || `group-${subgraphs.length + 1}`
      const sub = { id, title: name, members: new Set(), parent: stack.at(-1) }
      subgraphs.push(sub)
      stack.push(sub)
      continue
    }
    if (/^end$/i.test(line)) {
      if (!stack.pop()) warnings.push(`Line ${number}: "end" without a subgraph.`)
      continue
    }
    if ((rest = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line))) {
      // Inside a subgraph Mermaid turns that group only; here the whole chart follows the first one.
      if (!stack.length) direction = rest[1].toUpperCase().replace('TD', 'TB')
      continue
    }
    if ((rest = /^classDef\s+(\S+)\s+(.+)$/i.exec(line))) {
      for (const name of rest[1].split(',')) classes.set(name.trim(), parseStyle(rest[2]))
      continue
    }
    if ((rest = /^class\s+(\S+)\s+(\S+)$/i.exec(line))) {
      for (const id of rest[1].split(',')) nodeClasses.set(id.trim(), [...(nodeClasses.get(id.trim()) ?? []), rest[2]])
      continue
    }
    if ((rest = /^style\s+(\S+)\s+(.+)$/i.exec(line))) {
      nodeStyles.set(rest[1], { ...nodeStyles.get(rest[1]), ...parseStyle(rest[2]) })
      continue
    }
    if (/^(linkStyle|click|accTitle|accDescr)\b/i.test(line)) {
      warnings.push(`Line ${number}: "${line.split(/\s/)[0]}" is not supported, skipped.`)
      continue
    }
    const parsed = parseChain(line)
    if (typeof parsed === 'string') {
      warnings.push(`Line ${number}: ${parsed}, skipped.`)
      continue
    }
    let previous = null
    for (const step of parsed) {
      if (step.group) {
        const ids = step.group.map((n) => {
          touch(n.id, n.label, n.shape)
          if (n.className) nodeClasses.set(n.id, [...(nodeClasses.get(n.id) ?? []), n.className])
          return n.id
        })
        if (previous) {
          for (const from of previous.ids) for (const to of ids) edges.push({ from, to, ...previous.link })
        }
        previous = { ids }
      } else {
        previous.link = step.link
      }
    }
  }
  if (stack.length) warnings.push(`${stack.length} subgraph(s) without "end".`)
  if (!nodes.size) errors.push('No nodes found.')
  if (errors.length) return { doc: null, errors, warnings }

  // Styles: classes first, then the node's own style.
  for (const node of nodes.values()) {
    const style = Object.assign({}, classes.get('default'), ...(nodeClasses.get(node.id) ?? []).map((c) => classes.get(c) ?? {}), nodeStyles.get(node.id))
    if (style.fill) node.color = style.fill
    if (style.stroke) node.borderColor = style.stroke
    if (style.strokeWidth !== undefined) node.borderWidth = style.strokeWidth
    if (style.color) node.labelColor = style.color
  }

  const docNodes = [...nodes.values()]
  const docEdges = edges.map((e, i) => ({ id: `e${i + 1}`, ...e }))

  // Layout: sizes guessed from the text, members of a subgraph kept together.
  const sizes = new Map(docNodes.map((n) => [n.id, guessSize(n)]))
  const innermost = new Map()
  for (const sub of subgraphs) for (const id of sub.members) innermost.set(id, sub.id) // later (deeper) wins
  const positions = layeredLayout(docNodes.map((n) => n.id), docEdges, {
    direction, sizes, rankGap: 110, nodeGap: 60, group: (id) => innermost.get(id),
  })
  for (const node of docNodes) Object.assign(node, positions.get(node.id))

  // Sections around each subgraph, the deepest first so a parent frames its children.
  const sections = []
  const frames = new Map()
  const depth = (sub) => (sub.parent ? 1 + depth(sub.parent) : 0)
  const takenSections = new Set()
  for (const sub of [...subgraphs].sort((a, b) => depth(b) - depth(a))) {
    const boxes = [...sub.members].map((id) => {
      const p = positions.get(id)
      const s = sizes.get(id)
      return { x: p.x - s.width / 2, y: p.y - s.height / 2, width: s.width, height: s.height }
    })
    for (const child of subgraphs) if (child.parent === sub && frames.has(child)) boxes.push(frames.get(child))
    const box = boundingBox(boxes)
    if (!box) continue
    const pad = 30
    const band = 46
    const frame = { x: box.x - pad, y: box.y - pad - band, width: box.width + 2 * pad, height: box.height + 2 * pad + band }
    frames.set(sub, frame)
    const id = uniqueId(sub.id, takenSections)
    takenSections.add(id)
    sections.push({ id, title: sub.title, ...roundBox(frame), titleSize: 18 })
  }
  sections.reverse() // parents first: drawn behind their children

  return {
    doc: {
      version: FORMAT_VERSION,
      meta: { title: title || frontmatterTitle || 'Mermaid diagram', fixedLayout: true, source: { format: 'mermaid' } },
      nodeTypes: {},
      edgeTypes: {},
      sections,
      nodes: docNodes,
      edges: docEdges,
    },
    errors,
    warnings,
  }
}

function roundBox(b) {
  return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
}

/** About how big a card with this text is drawn (cards.js), before it is. */
function guessSize(node) {
  const lines = String(node.label).split('\n')
  const longest = Math.max(...lines.map((l) => l.length))
  const pad = DEFAULT_CARD.padding
  let width = Math.max(60, longest * 8.5 + pad * 2)
  let height = lines.length * 19 + pad * 2
  if (node.shape === 'diamond') [width, height] = [width * 1.75, height * 1.75]
  if (node.shape === 'ellipse') [width, height] = [width * 1.35, height * 1.35]
  if (node.shape === 'parallelogram' || node.shape === 'pill') width += 36
  if (node.shape === 'cylinder') height += 20
  return { width: Math.round(width), height: Math.round(height) }
}

/** "fill:#f9f,stroke:#333,stroke-width:4px,color:#fff" -> { fill, stroke, strokeWidth, color } */
function parseStyle(text) {
  const style = {}
  for (const part of text.replace(/;$/, '').split(',')) {
    const [key, ...value] = part.split(':')
    const v = value.join(':').trim()
    if (!v) continue
    const k = key.trim().toLowerCase()
    if (k === 'fill') style.fill = v
    else if (k === 'stroke') style.stroke = v
    else if (k === 'stroke-width' && Number.isFinite(parseFloat(v))) style.strokeWidth = parseFloat(v)
    else if (k === 'color') style.color = v
  }
  return style
}

function stripFrontMatter(text) {
  // Blank lines in its place, so line numbers in warnings stay right.
  return text.replace(/^\s*---\n[\s\S]*?\n---[ \t]*\n/, (block) => '\n'.repeat(block.split('\n').length - 1))
}

/** Statements: one per line or per ";", without %% comments; keeps line numbers. */
function splitStatements(text) {
  const out = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/%%.*$/, '')
    for (const part of splitOutsideQuotes(line, ';')) {
      const t = part.trim()
      if (t) out.push({ text: t, number: i + 1 })
    }
  })
  return out
}

function splitOutsideQuotes(line, separator) {
  const parts = []
  let current = ''
  let quoted = false
  for (const c of line) {
    if (c === '"') quoted = !quoted
    if (c === separator && !quoted) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts
}

/**
 * A statement as steps: { group: [node…] }, { link }, { group }, …
 * or a string saying what is wrong.
 */
function parseChain(line) {
  const steps = []
  let pos = 0
  const skip = () => {
    while (pos < line.length && /\s/.test(line[pos])) pos++
  }
  const readGroup = () => {
    const group = []
    for (;;) {
      skip()
      const node = readNode()
      if (typeof node === 'string') return node
      group.push(node)
      skip()
      if (line[pos] === '&') {
        pos++
        continue
      }
      return group
    }
  }
  const readNode = () => {
    const id = ID.exec(line.slice(pos))
    if (!id) return `expected a node at "${line.slice(pos, pos + 20)}"`
    pos += id[0].length
    const node = { id: id[0] }
    for (const [open, close, shape] of SHAPES) {
      if (!line.startsWith(open, pos)) continue
      const end = findClose(line, pos + open.length, close)
      if (end < 0) continue
      node.label = cleanText(line.slice(pos + open.length, end))
      node.shape = shape
      pos = end + close.length
      break
    }
    const cls = /^:::([\w-]+)/.exec(line.slice(pos))
    if (cls) {
      node.className = cls[1]
      pos += cls[0].length
    }
    return node
  }

  const first = readGroup()
  if (typeof first === 'string') return first
  steps.push({ group: first })
  for (;;) {
    skip()
    if (pos >= line.length) break
    const link = readLink(line.slice(pos))
    if (!link) return `expected a link (-->, ---, -.->, ==>…) at "${line.slice(pos, pos + 20)}"`
    pos += link.length
    steps.push({ link: link.edge })
    const group = readGroup()
    if (typeof group === 'string') return group
    steps.push({ group })
  }
  return steps
}

/** The closing bracket, past any quoted text. */
function findClose(line, from, close) {
  let quoted = false
  for (let i = from; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (!quoted && line.startsWith(close, i)) return i
  }
  return -1
}

function readLink(text) {
  const plain = LINK.exec(text)
  const worded = TEXT_LINK.exec(text)
  // "-- text -->": the plain form only matched its opening "--".
  const useWorded = worded && (!plain || (plain[0].trim().length <= 2 && !plain[3] && !plain[4]))
  const [length, start, line, end, label] = useWorded
    ? [worded[0].length, worded[1], `${worded[2]}${worded[4]}`, worded[5], worded[3]]
    : plain ? [plain[0].length, plain[1], plain[2], plain[3], plain[4]] : []
  if (!length) return null
  const edge = {}
  const forward = Boolean(end)
  const backward = Boolean(start)
  edge.direction = forward && backward ? 'both' : forward ? 'forward' : backward ? 'backward' : 'none'
  if (/\./.test(line)) edge.dashed = true
  if (/=/.test(line)) edge.width = 3
  if (/~/.test(line)) {
    edge.color = 'transparent'
    edge.hideLabel = true
  }
  if (label && cleanText(label)) edge.label = cleanText(label)
  return { length, edge }
}

/** Node or link text: quotes, <br>, Markdown backticks and entities removed. */
function cleanText(text) {
  let t = String(text ?? '').trim()
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) t = t.slice(1, -1)
  if (t.startsWith('`') && t.endsWith('`') && t.length >= 2) t = t.slice(1, -1)
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/#amp;/g, '&')
    .replace(/#lt;/g, '<')
    .replace(/#gt;/g, '>')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim()
}
