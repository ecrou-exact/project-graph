import './style.css'
import pivotickPackage from 'pivotick/package.json'
import rulezetExample from '../examples/rulezet.json'
import circlExample from '../examples/circl.json'
import ngsotiExample from '../examples/ngsoti-soc-stack.json'
import { GraphView, faIconSvg } from './graph.js'
import { faFont, faImage, faLink, faList, faNoteSticky, faObjectUngroup, faPenNib, faPencil, faArrowRight, faStar } from '@fortawesome/free-solid-svg-icons'
import { outlinePath } from './shapes.js'
import { ARROW_TARGETS, DIRECTIONS, TAG_FIELDS, arrowEndTarget, arrowTargets, compact, parseArrow, parseLegend, parseSection, parseShape, parseStroke, uniqueId, emptyDocument, parseDocument, resolveEdge, resolveNode, starterDocument } from './model.js'
import { h } from './ui/dom.js'
import { SHAPE_LABELS_DRAWN, arrowEndKey, arrowFields, edgeFields, legendFields, nodeFields, sectionFields, shapeFields, strokeFields, tagFields, typeFields } from './ui/forms.js'
import { isMermaid, mermaidToDocument } from './mermaid.js'
import { circleLayout, gridLayout, layeredLayout, snapToGrid } from './layout.js'
import { tagPill } from './ui/pills.js'
import { isOcd, ocdToDocument, wellKnownUrl } from './ocd.js'
import { confirmModal, openFormModal, toast } from './ui/modal.js'
import { menuButton } from './ui/menu.js'
import '../docs/search.js'
import { registerFonts } from './fonts.js'

const STORAGE_KEY = 'pivograph:document'

/**
 * A link to a bundled example: ?example=rulezet, ?example=circl or
 * ?example=ngsoti opens the app on that graph. The address follows the graph
 * shown, so it can be copied and shared from the browser.
 *
 * Embedding in another site (an <iframe>):
 *   ?embed=1     hide the app's top bar (logo, menus)
 *   ?src=<url>   load this JSON at start: a Pivograph graph or an OCD file
 *   ?sidebar=0   hide the side panel
 *   ?toolbar=1   keep the top bar (menus) when embedded, to edit the map
 *   ?mode=viewer only the graph: pan, zoom, drag, no panels
 *   ?theme=light|dark, ?bg=<colour>  follow the host page's theme (also the
 *                pivograph:theme { scheme, background } message, live)
 *   ?tags=1      start with the tag pills shown (hidden by default)
 * The host page can also send the data, e.g. a file its visitor opened:
 *   iframe.contentWindow.postMessage({ type: 'pivograph:load', data, name }, '*')
 * The app announces itself with { type: 'pivograph:ready' } and answers each
 * load with { type: 'pivograph:loaded', nodes, edges } or { type: 'pivograph:error', message }.
 * "Open its graph" on a node with a `graph` field sends { type: 'pivograph:open', url, label }:
 * the host page decides where to go.
 * Editing from the host page: a map loaded with meta.readOnly false can be
 * edited in the frame; every change is sent as { type: 'pivograph:changed', data }
 * (the document, positions included), and { type: 'pivograph:get' } asks for it
 * at any time — answered with { type: 'pivograph:document', data }.
 * { type: 'pivograph:snapshot' } asks for a PNG of the graph as drawn —
 * answered with { type: 'pivograph:snapshot', image } (a data: URL, or null);
 * { type: 'pivograph:export', format } runs one of the app's exports:
 * json, pivotick, png, svg, md or pdf (the report).
 */
const PARAMS = new URLSearchParams(location.search)
const EMBED = {
  enabled: PARAMS.has('embed') && PARAMS.get('embed') !== '0',
  src: PARAMS.get('src'),
  example: PARAMS.get('example'),
  sidebar: PARAMS.get('sidebar') !== '0',
  // ?toolbar=1 keeps the top bar (Graph and Add menus) when embedded — for a
  // host page that lets its users edit the map.
  toolbar: PARAMS.get('toolbar') === '1',
  // ?mode=viewer: only the graph (pan, zoom, drag) — no Pivotick panels.
  viewer: PARAMS.get('mode') === 'viewer',
  // ?theme=light|dark and ?bg=<colour>: follow the host page's theme instead of the OS.
  theme: ['light', 'dark'].includes(PARAMS.get('theme')) ? PARAMS.get('theme') : null,
  bg: PARAMS.get('bg'),
  // Tag pills on the graph: hidden unless asked for (?tags=1, or the button).
  tags: PARAMS.get('tags') === '1',
}

// Document-level state. Nodes and edges live in Pivotick (see GraphView).
// Nodes, edges and notes live in Pivotick (see GraphView); the rest of the document here.
const state = { meta: {}, nodeTypes: {}, edgeTypes: {}, tags: {}, sections: [], arrows: [], shapes: [], strokes: [], legend: undefined }
// pen: the look of the next lines drawn by hand.
const ui = { tab: 'nodes', filter: '', jsonDirty: false, withPositions: true, pen: { color: '#343a40', width: 3 } }

const view = new GraphView(document.getElementById('graph'), {
  getTypes: () => state,
  nodeForm: openNodeForm,
  edgeForm: openEdgeForm,
  edgeFields: (container, init) => edgeFields(container, init, edgeContext()),
  confirm: (message) => confirmModal(message),
  onChange: () => {
    pruneArrows()
    view.drawing.renderLegend()           // the types in use may have changed
    renderSidebar()
    persist()
  },
  onFilterChange: () => scheduleSidebar(),
  openGraph: (node) => openNodeGraph(node),
  onDrawingChange: () => {
    renderSidebar()
    persist()
  },
  editSection: (id) => editSection(id),
  editArrow: (id) => editArrow(id),
  editLegend: () => editLegend(),
  editShape: (id) => editShape(id),
  editStroke: (id) => editStroke(id),
  deleteDrawing: (kind, id) => removeDrawing(kind, id),
  connect: (from, to) => connect(from, to),
  addStroke: (points) => addStroke(points),
  onModeChange: (mode) => drawModeChanged(mode),
  railModes: () => [drawRailMode()],
  onRailState: (rail) => {
    const armed = rail.mode === 'draw' ? rail.armedTool.draw : null
    const wanted = armed === 'connect' || armed === 'pen' ? armed : null
    if (wanted !== view.drawing.mode) view.drawing.setMode(wanted)
  },
})

// Development only: the view and the state, for tests driving the app.
if (import.meta.env.DEV) window.pivograph = { view, state }

let sidebarFrame = null
function scheduleSidebar() {
  if (sidebarFrame) return
  sidebarFrame = requestAnimationFrame(() => {
    sidebarFrame = null
    renderSidebar()
  })
}

// --- document lifecycle ------------------------------------------------------

function loadDocument(doc) {
  // Opening any other graph forgets the way back from a node's graph.
  if (!openingNodeGraph) graphHistory.length = 0
  state.meta = { ...doc.meta }
  state.nodeTypes = structuredClone(doc.nodeTypes)
  state.edgeTypes = structuredClone(doc.edgeTypes)
  state.tags = structuredClone(doc.tags ?? {})
  state.sections = structuredClone(doc.sections ?? [])
  state.arrows = structuredClone(doc.arrows ?? [])
  state.shapes = structuredClone(doc.shapes ?? [])
  state.strokes = structuredClone(doc.strokes ?? [])
  state.legend = doc.legend ? { ...doc.legend } : undefined
  ui.jsonDirty = false
  syncAddress(doc)
  view.load(doc)
  syncCanvasTheme()                     // Pivotick rebuilt its .pivotick element
  if (!editable()) view.drawing.setMode(null)
  renderHeader()
  renderSidebar()
  persist()
}

function loadRaw(raw, source) {
  // An Open Contributions Descriptor (.well-known/open-contributions.json) is
  // converted into a graph first.
  const ocd = isOcd(raw)
  if (ocd) raw = ocdToDocument(raw)
  const { doc, errors, warnings } = parseDocument(raw)
  // The bundled example stays locked however it is opened (a file, ?src=, the host page).
  if (doc && isExample(doc)) doc.meta = { ...doc.meta, readOnly: true, source: { format: 'example' } }
  if (!doc) {
    toast(`Invalid ${source}: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1})` : ''}`, 'error')
    return { errors, warnings }
  }
  loadDocument(doc)
  if (warnings.length) toast(`${warnings.length} warning(s): ${warnings[0]}`, 'warning')
  else if (ocd) toast(`Open Contributions Descriptor imported: ${describeCounts(doc)}.`)
  return { errors, warnings }
}

function describeCounts(doc) {
  const count = (type, word) => {
    const n = doc.nodes.filter((node) => node.type === type).length
    return n ? `${n} ${word}${n === 1 ? '' : 's'}` : null
  }
  return [count('project', 'project'), count('dataset', 'dataset'), count('standard', 'standard'),
    count('external-organization', 'related organization'), count('external-project', 'related project')]
    .filter(Boolean).join(', ') || 'no items'
}

const OCD_SAMPLES = {
  'MISP Project': 'https://raw.githubusercontent.com/ossbase-org/Open-Contributions-Descriptor/main/samples/misp.json',
  'AIL Project': 'https://raw.githubusercontent.com/ossbase-org/Open-Contributions-Descriptor/main/samples/ail-project.json',
  flowintel: 'https://raw.githubusercontent.com/ossbase-org/Open-Contributions-Descriptor/main/samples/flowintel.json',
}

/** Loads an OCD file from a domain ("misp-project.org") or a URL. */
async function importWellKnown() {
  const values = await openFormModal({
    title: 'Import an Open Contributions Descriptor',
    submitLabel: 'Import',
    build: (body) => {
      const input = h('input', { type: 'text', placeholder: 'example.org or https://example.org/.well-known/open-contributions.json' })
      const resolved = h('small', { class: 'pg-muted' })
      const update = () => (resolved.textContent = input.value.trim() ? `Will fetch ${wellKnownUrl(input.value)}` : '')
      input.addEventListener('input', update)
      const error = h('div', { class: 'pg-form-error', hidden: true })
      // A local file: read it, then submit the modal right away.
      let picked = null
      const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true })
      file.addEventListener('change', async () => {
        const chosen = file.files?.[0]
        if (!chosen) return
        try {
          picked = { raw: JSON.parse(await chosen.text()), source: chosen.name }
        } catch (e) {
          error.textContent = `Could not read ${chosen.name}: ${e.message}`
          error.hidden = false
          return
        }
        body.closest('form').requestSubmit()
      })
      body.append(error,
        h('div', { class: 'pg-field pg-field-wide' },
          h('label', {}, 'From a file'),
          h('div', { class: 'pg-row' },
            h('button', { type: 'button', class: 'pg-btn', onclick: () => file.click() }, 'Choose a file…'),
            h('small', { class: 'pg-muted pg-center' }, 'an open-contributions.json saved on your computer')),
          file),
        h('div', { class: 'pg-field pg-field-wide' },
          h('label', {}, 'Or from a domain or URL'), input, resolved,
          h('small', { class: 'pg-muted' },
            'The site must allow cross-origin requests (CORS). If it doesn’t, download the file and choose it above.')),
        h('div', { class: 'pg-field pg-field-wide' },
          h('label', {}, 'Official samples'),
          h('div', { class: 'pg-row pg-wrap' }, Object.entries(OCD_SAMPLES).map(([name, url]) => h('button', {
            type: 'button', class: 'pg-btn', onclick: () => { input.value = url; update() },
          }, name)))))
      return {
        values: () => (picked ?? { url: wellKnownUrl(input.value) }),
        validate: () => (picked || input.value.trim() ? null : 'Choose a file, or enter a domain or a URL.'),
        showError: (message) => {
          error.textContent = message ?? ''
          error.hidden = !message
        },
      }
    },
  })
  if (!values) return
  let raw = values.raw
  try {
    if (!raw) {
      const response = await fetch(values.url, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`the server answered ${response.status}`)
      raw = await response.json()
    }
  } catch (error) {
    const reason = error instanceof TypeError ? 'network error or cross-origin request blocked (CORS)' : error.message
    return toast(`Could not load ${values.url}: ${reason}.`, 'error')
  }
  if (!isOcd(raw) && !Array.isArray(raw?.nodes)) return toast('This file is neither an Open Contributions Descriptor nor a Pivograph graph.', 'error')
  if (view.nodes().length && !(await confirmModal('Replace the current graph with the imported one?', { confirmLabel: 'Replace', danger: false }))) return
  loadRaw(raw, values.source ?? values.url)
}

function currentDocument() {
  return view.toDocument(state, ui.withPositions)
}

function persist() {
  // Embedded in another site: never overwrite what the visitor keeps in the app
  // itself. An editable map tells the host page instead, so it can save it.
  if (EMBED.enabled) {
    if (editable() && EMBED.host !== undefined) {
      tellHost({ type: 'pivograph:changed', data: view.toDocument(state, true) }, EMBED.host)
    }
    return
  }
  // The bundled example is never saved: the browser keeps only the visitor's
  // own graph, and loading the example doesn't overwrite it.
  if (isExample(state)) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view.toDocument(state, true)))
  } catch {
    // storage unavailable (private mode, quota): autosave is only a convenience
  }
}

function restore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const doc = parseDocument(JSON.parse(saved)).doc
    // A copy of the example saved before it was locked: show the locked example instead.
    return doc && !isExample(doc) ? doc : null
  } catch {
    // corrupted or unavailable storage: start from the example
  }
  return null
}

// --- forms ---------------------------------------------------------------------

function nodeIds() {
  return new Set(view.nodes().map((n) => String(n.id)))
}

function edgeContext() {
  // Relationship wordings already used in this graph, suggested first.
  const labels = [
    ...view.edges().map((e) => e.getData().label),
    ...Object.values(state.edgeTypes).map((t) => t.label),
  ].filter(Boolean)
  return {
    edgeTypes: state.edgeTypes,
    labels: [...new Set(labels)].sort(),
    nodes: view.nodes()
      .map((n) => ({ id: String(n.id), label: n.getData().label ?? String(n.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  }
}

/** Every tag in the document: declared in the registry or used on a node. */
function knownTags() {
  const tags = new Set(Object.keys(state.tags))
  for (const node of view.nodes()) for (const tag of node.getData().tags ?? []) tags.add(tag)
  return [...tags].sort()
}

function tagUsage(name) {
  return view.nodes().filter((n) => (n.getData().tags ?? []).includes(name))
}

async function openNodeForm(init) {
  const values = await openFormModal({
    title: init.mode === 'edit' ? 'Edit node' : 'New node',
    submitLabel: init.mode === 'edit' ? 'Save' : 'Add',
    build: (body) => nodeFields(body, init, {
      nodeTypes: state.nodeTypes, tags: state.tags, knownTags: knownTags(), takenIds: nodeIds(),
    }),
  })
  if (!values) return null
  // Badge colours/icons edited in the form belong to the tags, not to this node.
  const { _tagDefs, ...nodeValues } = values
  if (applyTagDefs(_tagDefs)) typesChanged()
  return nodeValues
}

/** Merges edited tag settings into the registry. Returns whether anything changed. */
function applyTagDefs(defs = {}) {
  let changed = false
  for (const [name, def] of Object.entries(defs)) {
    const next = compact(def, TAG_FIELDS)
    if (!Object.keys(next).length || JSON.stringify(next) === JSON.stringify(state.tags[name])) continue
    state.tags[name] = next
    changed = true
  }
  return changed
}

async function editTag(name) {
  if (!editable()) return
  const values = await openFormModal({
    title: name ? `Tag #${name}` : 'New tag',
    build: (body) => tagFields(body, { name, def: state.tags[name] }, { takenNames: new Set(knownTags()) }),
  })
  if (!values) return
  state.tags[values.name] = compact(values.def, TAG_FIELDS)
  typesChanged()
}

async function removeTag(name) {
  if (!editable()) return
  const nodes = tagUsage(name)
  const extra = nodes.length ? ` It will be removed from ${nodes.length} node(s).` : ''
  if (!(await confirmModal(`Delete the tag #${name}?${extra}`))) return
  delete state.tags[name]
  for (const node of nodes) {
    const data = node.getData()
    view.updateNode(String(node.id), { ...data, tags: data.tags.filter((t) => t !== name) })
  }
  typesChanged()
}

function openEdgeForm(init) {
  return openFormModal({
    title: init.mode === 'edit' ? 'Edit edge' : 'New edge',
    submitLabel: init.mode === 'edit' ? 'Save' : 'Add',
    build: (body) => edgeFields(body, init, edgeContext()),
  })
}

/** False for read-only documents (an imported well-known, until unlocked). */
function editable() {
  return !state.meta.readOnly
}

async function addNode() {
  if (!editable()) return
  const values = await openNodeForm({ mode: 'create' })
  if (values) view.addNode(values)
}

async function addEdge(from) {
  if (!editable()) return
  if (view.nodes().length === 0) return toast('Add some nodes first.', 'warning')
  const values = await openEdgeForm({ mode: 'create', values: from ? { from } : {} })
  if (!values) return
  view.addEdge({ ...values, id: view.freeEdgeId(values.from, values.to) })
}

async function removeNode(id, label) {
  if (!editable()) return
  const count = view.edges().filter((e) => String(e.from.id) === id || String(e.to.id) === id).length
  const extra = count ? ` and its ${count} edge(s)` : ''
  if (await confirmModal(`Delete "${label}"${extra}?`)) view.removeNode(id)
}

async function removeEdge(id) {
  if (!editable()) return
  if (await confirmModal('Delete this edge?')) view.removeEdge(id)
}

async function editType(kind, name) {
  if (!editable()) return
  const types = kind === 'node' ? state.nodeTypes : state.edgeTypes
  const values = await openFormModal({
    title: name ? `Type "${name}"` : kind === 'node' ? 'New node type' : 'New edge type',
    build: (body) => typeFields(body, { kind, name, def: types[name] }, { takenNames: new Set(Object.keys(types)) }),
  })
  if (!values) return
  types[values.name] = Object.fromEntries(Object.entries(values.def).filter(([, v]) => v !== undefined))
  typesChanged()
}

async function removeType(kind, name) {
  if (!editable()) return
  const types = kind === 'node' ? state.nodeTypes : state.edgeTypes
  const elements = kind === 'node' ? view.nodes() : view.edges()
  const used = elements.filter((el) => el.getData().type === name).length
  const warning = used ? ` ${used} item(s) use it and will lose its style.` : ''
  if (!(await confirmModal(`Delete the type "${name}"?${warning}`))) return
  delete types[name]
  typesChanged()
}

// --- sections (titled frames behind the graph) -----------------------------------

async function editSection(id) {
  if (!editable()) return
  const current = state.sections.find((s) => s.id === id)
  const values = await openFormModal({
    title: current ? 'Edit section' : 'New section',
    submitLabel: current ? 'Save' : 'Add',
    build: (body) => sectionFields(body, current ?? {}),
  })
  if (!values) return
  if (current) {
    const next = parseSection({ ...values, id, x: current.x, y: current.y })
    state.sections[state.sections.indexOf(current)] = next
  } else {
    // A new section lands in the middle of the view.
    const center = view.drawing.viewCenter()
    const width = values.width ?? 400
    const height = values.height ?? 240
    const next = parseSection({ ...values, x: center.x - width / 2, y: center.y - height / 2 })
    next.id = uniqueId(values.title || 'section', new Set(state.sections.map((s) => s.id)))
    state.sections.push(next)
  }
  sectionsChanged()
}

async function removeSection(id) {
  if (!editable()) return
  const section = state.sections.find((s) => s.id === id)
  if (!section || !(await confirmModal(`Delete the section "${section.title || id}"? Nodes are not affected.`))) return
  state.sections = state.sections.filter((s) => s !== section)
  pruneArrows()
  sectionsChanged()
}

// --- arrows (drawn over the graph, between nodes, sections or free points) ----------

function drawingTargets() {
  return {
    nodes: view.nodes()
      .map((n) => ({ id: String(n.id), label: n.getData().label ?? String(n.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    sections: state.sections,
    notes: view.notes().map((n) => ({ id: String(n.id), content: n.content })),
    shapes: state.shapes,
    strokes: state.strokes,
  }
}

/** Everything an arrow can be attached to, by kind. */
function currentTargets() {
  return arrowTargets({ ...state, notes: view.noteBoxes() }, new Set(view.nodes().map((n) => String(n.id))))
}

/** The end chosen in the form; unchanged ends keep their exact place. */
function arrowEnd(key, previous, fallback) {
  if (previous && arrowEndKey(previous) === key) return previous
  const [kind, ...rest] = key.split(':')
  if (ARROW_TARGETS.includes(kind) && rest.length) return { [kind]: rest.join(':') }
  return fallback
}

async function editArrow(id) {
  if (!editable()) return
  const current = state.arrows.find((a) => a.id === id)
  const values = await openFormModal({
    title: current ? 'Edit arrow' : 'New arrow',
    submitLabel: current ? 'Save' : 'Add',
    build: (body) => arrowFields(body, current ?? {}, drawingTargets()),
  })
  if (!values) return
  const c = view.drawing.viewCenter()
  const from = arrowEnd(values.from, current?.from, { x: Math.round(c.x - 120), y: Math.round(c.y) })
  const to = arrowEnd(values.to, current?.to, { x: Math.round(c.x + 120), y: Math.round(c.y) })
  const next = parseArrow({ ...values, from, to, labelOffset: current?.labelOffset }, currentTargets())
  if (typeof next === 'string') return toast(`This arrow can't be drawn: ${next}.`, 'error')
  if (current) {
    next.id = id
    state.arrows[state.arrows.indexOf(current)] = next
  } else {
    next.id = uniqueId(values.label?.split('\n')[0] || 'arrow', new Set(state.arrows.map((a) => a.id)))
    state.arrows.push(next)
  }
  sectionsChanged()
  view.drawing.select(next.id)
}

async function removeArrow(id) {
  if (!editable()) return
  const arrow = state.arrows.find((a) => a.id === id)
  if (!arrow || !(await confirmModal(`Delete the arrow${arrow.label ? ` "${arrow.label.replace(/\n/g, ' ')}"` : ''}?`))) return
  state.arrows = state.arrows.filter((a) => a !== arrow)
  sectionsChanged()
}

/** Arrows whose node, section, note, shape or drawing was deleted go with it. */
function pruneArrows() {
  const targets = currentTargets()
  const alive = (end) => {
    const target = arrowEndTarget(end)
    return !target || targets[target.kind].has(target.id)
  }
  const kept = state.arrows.filter((a) => alive(a.from) && alive(a.to))
  if (kept.length === state.arrows.length) return
  state.arrows = kept
  view.drawing.render()
}

// --- shapes, drawings, and connecting everything ------------------------------------------

/** A new shape of this kind in the middle of the view (a picture asks for its file first). */
async function addShape(kind) {
  if (!editable()) return
  if (kind === 'image') return editShape(undefined, { kind })
  const c = view.drawing.viewCenter()
  const next = parseShape({ kind, x: c.x - 80, y: c.y - 45, ...(kind === 'icon' ? { icon: 'star', x: c.x - 40, y: c.y - 40 } : {}) })
  next.id = uniqueId(kind, new Set(state.shapes.map((sh) => sh.id)))
  state.shapes.push(next)
  sectionsChanged()
  view.drawing.pick({ kind: 'shape', id: next.id })
}

async function editShape(id, preset = {}) {
  if (!editable()) return
  const current = state.shapes.find((sh) => sh.id === id)
  const values = await openFormModal({
    title: current ? 'Edit shape' : 'New shape',
    submitLabel: current ? 'Save' : 'Add',
    build: (body) => shapeFields(body, current ?? preset),
  })
  if (!values) return
  if (current) {
    state.shapes[state.shapes.indexOf(current)] = parseShape({ ...values, id, x: current.x, y: current.y })
  } else {
    const c = view.drawing.viewCenter()
    const next = parseShape({ ...values, x: c.x - (values.width ?? 120) / 2, y: c.y - (values.height ?? 90) / 2 })
    next.id = uniqueId(values.kind, new Set(state.shapes.map((sh) => sh.id)))
    state.shapes.push(next)
  }
  sectionsChanged()
}

async function editStroke(id) {
  if (!editable()) return
  const current = state.strokes.find((st) => st.id === id)
  if (!current) return
  const values = await openFormModal({ title: 'Edit drawing', submitLabel: 'Save', build: (body) => strokeFields(body, current) })
  if (!values) return
  state.strokes[state.strokes.indexOf(current)] = parseStroke({ ...values, id, points: current.points })
  sectionsChanged()
}

/** Pen mode: a line drawn by hand, in the pen's colour and width. */
function addStroke(points) {
  const next = parseStroke({ points, ...ui.pen })
  if (!next) return
  next.id = uniqueId('drawing', new Set(state.strokes.map((st) => st.id)))
  state.strokes.push(next)
  sectionsChanged()
}

/**
 * Connect mode: two nodes get an edge (a relationship of the graph: filters,
 * report, types); anything else — notes, shapes, drawings, sections, points,
 * or a node with one of those — gets an arrow.
 */
function connect(from, to) {
  if (!editable()) return
  if (from.node !== undefined && to.node !== undefined) {
    view.addEdge({ from: from.node, to: to.node, id: view.freeEdgeId(from.node, to.node) })
    return toast('Edge added between the two nodes — double-click it to name the relationship.')
  }
  const next = parseArrow({ from, to }, currentTargets())
  if (typeof next === 'string') return toast(`This arrow can't be drawn: ${next}.`, 'error')
  next.id = uniqueId('arrow', new Set(state.arrows.map((a) => a.id)))
  state.arrows.push(next)
  sectionsChanged()
  view.drawing.select(next.id)
}

async function removeShape(id) {
  const shape = state.shapes.find((sh) => sh.id === id)
  if (!shape || !(await confirmModal(`Delete this ${(SHAPE_LABELS_DRAWN[shape.kind] ?? 'shape').toLowerCase()}?`))) return
  state.shapes = state.shapes.filter((sh) => sh !== shape)
  pruneArrows()
  sectionsChanged()
}

/** A drawing goes at once (Delete on the canvas): it is quickly drawn again. */
function removeStroke(id) {
  state.strokes = state.strokes.filter((st) => st.id !== id)
  pruneArrows()
  sectionsChanged()
}

/** Delete pressed on the selected thing. */
function removeDrawing(kind, id) {
  if (!editable()) return
  if (kind === 'arrow') removeArrow(id)
  else if (kind === 'shape') removeShape(id)
  else if (kind === 'stroke') removeStroke(id)
}

const SHAPE_MENU = ['rounded', 'rect', 'ellipse', 'diamond', 'triangle', 'hexagon', 'star', 'cloud', 'cylinder', 'callout', 'icon', 'image']

let drawHint = null // the Draw panel's line saying what to do next

/**
 * Pivograph's mode on Pivotick's rail, under Select, Create, View and Physics:
 * Connect and Pen are tools the mode arms; shapes, text, sections, arrows and
 * the legend are added from its panel. Notes are Pivotick's (Create → Add note).
 */
function drawRailMode() {
  const icon = (fa) => faIconSvg(fa)
  const toggle = (mode) => (armed) => {
    if (armed) view.drawing.setMode(mode)
    else if (view.drawing.mode === mode) view.drawing.setMode(null)
  }
  return {
    id: 'draw',
    label: 'Draw',
    icon: icon(faPencil),
    shortcut: 'D',
    defaultTool: null,
    panelWidth: 252,
    keepPanelOpen: true,
    tools: () => [
      { id: 'connect', label: 'Connect', icon: icon(faLink), kind: 'toggle', run: toggle('connect') },
      { id: 'pen', label: 'Pen', icon: icon(faPenNib), kind: 'toggle', run: toggle('pen') },
      { id: 'text', label: 'Text', icon: icon(faFont), kind: 'action', run: () => addText() },
      { id: 'section', label: 'Section', icon: icon(faObjectUngroup), kind: 'action', run: () => editSection() },
      { id: 'arrow', label: 'Arrow…', icon: icon(faArrowRight), kind: 'action', run: () => editArrow() },
      {
        id: 'legend', label: state.legend && !state.legend.hidden ? 'Hide the legend' : 'Legend', icon: icon(faList), kind: 'action', run: () => toggleLegend(),
      },
    ],
    render: drawPanel,
    onExit: () => view.drawing.setMode(null),
  }
}

/** Under the Draw tools: the shapes to add, the pen's colour and width, and a hint. */
function drawPanel() {
  const shapeIcon = (kind) => {
    if (kind === 'image' || kind === 'icon') {
      const span = h('span', { class: 'pg-shape-pick-fa' })
      span.innerHTML = faIconSvg(kind === 'image' ? faImage : faStar) // bundled icon: trusted markup
      return span
    }
    const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    box.setAttribute('viewBox', '-2 -2 32 24')
    box.innerHTML = `<path d="${outlinePath(kind, 28, 20)}" fill="none" stroke="currentColor" stroke-width="1.6"/>`
    return box
  }
  drawHint = h('p', { class: 'pg-draw-hint' })
  updateDrawHint()
  return h('div', { class: 'pg-draw-panel' },
    h('div', { class: 'pg-draw-panel-title' }, 'Shapes'),
    h('div', { class: 'pg-shape-picks' }, SHAPE_MENU.map((kind) => h('button', {
      type: 'button', class: 'pg-shape-pick', title: SHAPE_LABELS_DRAWN[kind], onclick: () => addShape(kind),
    }, shapeIcon(kind)))),
    h('div', { class: 'pg-draw-panel-title' }, 'Pen'),
    h('div', { class: 'pg-pen-style' },
      h('input', { type: 'color', value: ui.pen.color, title: 'Pen colour', oninput: (e) => { ui.pen.color = e.target.value } }),
      h('select', { title: 'Pen width', onchange: (e) => { ui.pen.width = Number(e.target.value) } },
        [2, 3, 5, 8, 14].map((w) => h('option', { value: w, selected: w === ui.pen.width }, `${w} px`)))),
    h('div', { class: 'pg-draw-panel-title' }, 'Notes'),
    h('p', { class: 'pg-draw-hint' }, 'Notes are Pivotick’s: Create → Add note. Arrows connect to them too.'),
    drawHint)
}

function updateDrawHint() {
  if (!drawHint) return
  const mode = view.drawing.mode
  drawHint.textContent = mode === 'connect'
    ? (view.drawing.pending ? 'Now click where the arrow ends.' : 'Click a node, note, shape, drawing, section or empty space, then another — or drag from one to the other. Two nodes get an edge. Esc to stop.')
    : mode === 'pen' ? 'Drag on the canvas to draw. Esc to stop.'
    : 'Connect links anything to anything; Pen draws by hand. Click a shape or a drawing and press Delete to remove it.'
}

/** The drawing layer left or entered a mode (Escape, the other tool…): the rail follows. */
function drawModeChanged(mode) {
  if (!mode) view.disarm('draw')
  updateDrawHint()
}

/** A Pivotick note in the middle of the view (as Create → Add note makes one). */
function addNote() {
  if (!editable()) return
  const c = view.drawing.viewCenter()
  const note = view.addNote({ x: Math.round(c.x - 110), y: Math.round(c.y - 80), content: '' })
  view.graph.focusElement(note)
}

async function removeNote(id) {
  if (!editable() || !(await confirmModal('Delete this note?'))) return
  view.removeNote(id)
}

/** Text on the canvas: a Text shape (no box), its form open to type it. */
function addText() {
  return editShape(undefined, { kind: 'text' })
}

/** Shows the legend (placed at the top-left of the view) or hides it. */
function toggleLegend() {
  if (!editable()) return
  if (state.legend && !state.legend.hidden) {
    state.legend = { ...state.legend, hidden: true }
  } else if (state.legend) {
    const { hidden, ...shown } = state.legend
    state.legend = shown
  } else {
    const rect = document.getElementById('graph').getBoundingClientRect()
    const corner = view.drawing.toGraph(rect.left + 24, rect.top + 24)
    state.legend = parseLegend({ x: corner.x, y: corner.y })
  }
  sectionsChanged()
  const items = view.legendItems()
  if (!state.legend.hidden && !items.nodes.length && !items.edges.length) {
    toast('The legend lists node and edge types: give your nodes and edges a type for it to show.', 'warning')
  }
}

async function editLegend() {
  if (!editable() || !state.legend) return
  const values = await openFormModal({ title: 'Legend', build: (body) => legendFields(body, state.legend) })
  if (!values) return
  state.legend = parseLegend({ ...state.legend, title: values.title === undefined ? undefined : values.title })
  if (values.title === '') state.legend.title = ''
  sectionsChanged()
}

// --- arrange: automatic placements, then a fixed layout ---------------------------------

let beforeArrange = null // the document before the last arrangement, for "Undo"

const ARRANGEMENTS = {
  'tree-down': { label: 'Tree, top to bottom', direction: 'TB' },
  'tree-right': { label: 'Tree, left to right', direction: 'LR' },
  grid: { label: 'Grid' },
  circle: { label: 'Circle' },
  snap: { label: 'Snap to grid' },
}

function arrange(kind) {
  if (!editable()) return
  const doc = view.toDocument(state, true)
  if (!doc.nodes.length) return toast('Add some nodes first.', 'warning')
  const ids = doc.nodes.map((n) => n.id)
  const sizes = new Map(ids.map((id) => [id, view.nodeExtent(id)]))
  const placed = new Map(doc.nodes.filter((n) => Number.isFinite(n.x)).map((n) => [n.id, { x: n.x, y: n.y }]))
  let positions
  const { direction } = ARRANGEMENTS[kind]
  if (direction) positions = layeredLayout(ids, doc.edges, { direction, sizes, rankGap: 100, nodeGap: 50 })
  else if (kind === 'grid') {
    // Grouped by type, then by label: same-type nodes end up together.
    const label = (n) => String(n.label ?? n.id)
    const order = [...doc.nodes].sort((a, b) => String(a.type ?? '').localeCompare(String(b.type ?? '')) || label(a).localeCompare(label(b)))
    positions = gridLayout(order.map((n) => n.id), { sizes })
  } else if (kind === 'circle') positions = circleLayout(ids, doc.edges, { sizes })
  else positions = snapToGrid(placed, 20)

  // Centred where the graph was, so sections, notes and the legend stay around it.
  if (kind !== 'snap' && placed.size) {
    const mean = (map, axis) => [...map.values()].reduce((sum, p) => sum + p[axis], 0) / map.size
    const dx = mean(placed, 'x') - mean(positions, 'x')
    const dy = mean(placed, 'y') - mean(positions, 'y')
    positions = new Map([...positions].map(([id, p]) => [id, { x: Math.round(p.x + dx), y: Math.round(p.y + dy) }]))
  }
  beforeArrange = doc
  const next = structuredClone(doc)
  for (const node of next.nodes) Object.assign(node, positions.get(node.id) ?? {})
  next.meta = { ...next.meta, fixedLayout: true }
  loadDocument(next)
  view.fit()
  toast(`${ARRANGEMENTS[kind].label}: done. The layout is now fixed — Add → Undo the last arrangement brings the previous one back.`)
}

function undoArrange() {
  if (!beforeArrange || !editable()) return
  const previous = beforeArrange
  beforeArrange = null
  loadDocument(previous)
  view.fit()
}

function sectionsChanged() {
  view.drawing.render()
  renderSidebar()
  persist()
}

/** Fixed layout: nodes stay where they are put (diagrams); otherwise the force layout moves them. */
function toggleFixedLayout() {
  if (!editable()) return
  const doc = view.toDocument(state, true)
  doc.meta = { ...doc.meta, fixedLayout: !state.meta.fixedLayout || undefined }
  loadDocument(doc)
  toast(doc.meta.fixedLayout ? 'Layout fixed: nodes stay where you drop them.' : 'Automatic layout: nodes move with the physics again.')
}

function typesChanged() {
  view.restyleAll()
  view.drawing.render()
  renderSidebar()
  persist()
}

// --- import / export ---------------------------------------------------------

function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = h('a', { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function fileBase(doc) {
  return (doc.meta.title ?? '').trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'graph'
}

function exportJson() {
  const doc = currentDocument()
  download(`${fileBase(doc)}.json`, JSON.stringify(doc, null, 2))
}

/**
 * The graph for Pivotick alone: `new Pivotick(el, file, file.options)`, styles
 * included and images embedded, so the file works anywhere.
 */
async function exportPivotick() {
  const doc = currentDocument()
  const file = view.toPivotickFile(doc)
  const { toDataUrl } = await import('./snapshot.js')
  const missing = new Set()
  await Promise.all(file.nodes.map(async (node) => {
    const src = node.style?.imagePath
    if (!src || src.startsWith('data:')) return
    try {
      node.style.imagePath = await toDataUrl(new URL(src, document.baseURI).href)
    } catch {
      missing.add(src) // kept as a URL: a site without CORS can't be read from here
    }
  }))
  download(`${fileBase(doc)}.pivotick.json`, JSON.stringify(file, null, 2))
  if (missing.size) toast(`${missing.size} image(s) could not be embedded and stay as links.`, 'error')
}

/** A PNG of the whole graph as drawn, or null (with a message) when it can't be made. */
async function snapshot() {
  const { graphSnapshot } = await import('./snapshot.js')
  try {
    return await graphSnapshot(document.getElementById('graph'))
  } catch (error) {
    toast(`The picture of the graph could not be made (${error.message}).`, 'error')
    return null
  }
}

async function exportPicture() {
  const image = await snapshot()
  if (!image) return
  const a = h('a', { href: image, download: `${fileBase(currentDocument())}.png` })
  document.body.append(a)
  a.click()
  a.remove()
}

/** The report (docs: "Reports"): the picture of the graph, then the text written from every field. */
async function exportReport(format) {
  const doc = currentDocument()
  const [{ buildReport }, image] = await Promise.all([import('./report.js'), snapshot()])
  if (format === 'md') return download(`${fileBase(doc)}.md`, buildReport(doc, { image }), 'text/markdown')
  const { printHtml, reportHtml } = await import('./reportPrint.js')
  // Each node's picture as drawn (logos, icons tinted on the node's colour).
  const images = new Map(view.toPivotickData(doc).nodes.map((n) => [n.id, n.style?.imagePath]).filter(([, src]) => src))
  toast('Choose "Save as PDF" in the print dialog.')
  await printHtml(reportHtml(doc, { image, images, baseUrl: document.baseURI }))
}

async function importFile(file) {
  try {
    const text = await file.text()
    // A Mermaid flowchart (.mmd, or a Markdown file holding one) becomes a diagram.
    const mermaid = mermaidSource(text)
    if (mermaid) return loadMermaid(mermaid, file.name.replace(/\.[^.]+$/, ''))
    loadRaw(JSON.parse(text), file.name)
  } catch (error) {
    toast(`Could not read ${file.name}: ${error.message}`, 'error')
  }
}

/** The Mermaid flowchart in a text: the text itself, or the first ```mermaid block of a Markdown file. */
function mermaidSource(text) {
  if (isMermaid(text)) return text
  const block = /```mermaid\s*\n([\s\S]*?)```/.exec(text)?.[1]
  return block && isMermaid(block) ? block : null
}

/** Loads a Mermaid flowchart as an editable diagram. Returns its errors. */
function loadMermaid(text, title) {
  const { doc, errors, warnings } = mermaidToDocument(text, { title })
  if (!doc) {
    toast(`Not a flowchart Pivograph can read: ${errors[0]}`, 'error')
    return errors
  }
  const result = loadRaw(doc, 'Mermaid flowchart')
  if (!result.errors.length) {
    const skipped = warnings.length ? ` ${warnings.length} line(s) skipped: ${warnings[0]}` : ''
    toast(`Mermaid flowchart imported: ${doc.nodes.length} nodes, ${doc.edges.length} edges, ${doc.sections.length} sections.${skipped}`, warnings.length ? 'warning' : undefined)
  }
  return result.errors
}

const MERMAID_SAMPLE = `flowchart LR
  sensors([Sensors]) -->|alerts| triage{Relevant?}
  triage -- yes --> misp[(MISP)]
  triage -. no .-> archive[Archive]
  subgraph ir [Incident response]
    misp --> case[/Case in flowintel/]
    case --> report>Report]
  end
  classDef hot fill:#ffe3e3,stroke:#c92a2a
  class triage hot`

/** Text → diagram: a Mermaid flowchart pasted or opened from a file. */
async function importMermaid() {
  const values = await openFormModal({
    title: 'Import a Mermaid flowchart',
    submitLabel: 'Import',
    wide: true,
    build: (body) => {
      const textarea = h('textarea', {
        class: 'pg-json pg-paste', spellcheck: false, rows: 16,
        placeholder: 'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[(Database)]',
      })
      const error = h('div', { class: 'pg-form-error', role: 'alert', hidden: true })
      const file = h('input', { type: 'file', accept: '.mmd,.mermaid,.md,.txt,text/plain,text/markdown', hidden: true })
      file.addEventListener('change', async () => {
        const chosen = file.files?.[0]
        if (chosen) textarea.value = mermaidSource(await chosen.text()) ?? await chosen.text()
      })
      body.append(error,
        h('p', { class: 'pg-muted pg-field-wide' },
          'Write the diagram as text — the Mermaid flowchart syntax used by GitHub, GitLab, Notion or Obsidian — and get an editable diagram: shapes, labelled links, subgraphs as sections, colours from style / classDef. It is laid out as a flowchart, in a fixed layout.'),
        h('div', { class: 'pg-row pg-wrap' },
          h('button', { type: 'button', class: 'pg-btn', onclick: () => { textarea.value = MERMAID_SAMPLE } }, 'Example'),
          h('button', { type: 'button', class: 'pg-btn', onclick: () => file.click() }, 'Open a .mmd / .md file…'),
          file),
        textarea)
      return {
        values: () => ({ text: textarea.value }),
        validate() {
          if (!textarea.value.trim()) return 'Write or paste a flowchart first.'
          const { errors } = mermaidToDocument(textarea.value)
          return errors[0] ?? null
        },
        showError(message) {
          error.textContent = message ?? ''
          error.hidden = !message
        },
      }
    },
  })
  if (!values) return
  if (view.nodes().length && !(await confirmModal('Replace the current graph with the flowchart?', { confirmLabel: 'Replace', danger: false }))) return
  loadMermaid(values.text)
}

async function exportSvg() {
  const { graphSvg } = await import('./snapshot.js')
  let markup
  try {
    markup = await graphSvg(document.getElementById('graph'))
  } catch (error) {
    return toast(`The picture of the graph could not be made (${error.message}).`, 'error')
  }
  if (!markup) return toast('Nothing to draw yet.', 'warning')
  download(`${fileBase(currentDocument())}.svg`, markup, 'image/svg+xml')
}

/** Opens a graph pasted as text: a Pivograph graph or an OCD file. */
async function pasteJson() {
  const values = await openFormModal({
    title: 'Paste JSON',
    submitLabel: 'Open',
    wide: true,
    build: (body) => {
      const textarea = h('textarea', {
        class: 'pg-json pg-paste', spellcheck: false, rows: 16,
        placeholder: '{ "nodes": [ … ], "edges": [ … ] }  — a Pivograph graph or an open-contributions.json',
      })
      const error = h('div', { class: 'pg-form-error', role: 'alert', hidden: true })
      body.append(error, textarea)
      let parsed
      return {
        values: () => ({ raw: parsed }),
        validate() {
          const text = textarea.value.trim()
          if (!text) return 'Paste some JSON first.'
          try {
            parsed = JSON.parse(text)
          } catch (e) {
            return `Invalid JSON: ${e.message}`
          }
          if (!isOcd(parsed) && !Array.isArray(parsed?.nodes)) return 'This is neither a Pivograph graph (no "nodes") nor an Open Contributions Descriptor. (A Mermaid flowchart? Use Graph → Import a Mermaid flowchart.)'
          return parseDocument(isOcd(parsed) ? ocdToDocument(parsed) : parsed).errors[0] ?? null
        },
        showError(message) {
          error.textContent = message ?? ''
          error.hidden = !message
        },
      }
    },
  })
  if (!values) return
  if (view.nodes().length && !(await confirmModal('Replace the current graph with the pasted one?', { confirmLabel: 'Replace', danger: false }))) return
  loadRaw(values.raw, 'pasted JSON')
}

function pickFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json,.mmd,.mermaid,.md' })
  input.addEventListener('change', () => input.files?.[0] && importFile(input.files[0]))
  input.click()
}

async function newDocument() {
  if (view.nodes().length && !(await confirmModal('Clear the current graph?', { confirmLabel: 'New graph' }))) return
  loadDocument(starterDocument())
  toast('New graph. It is saved in this browser only: export it to keep a copy.')
}

// The bundled example is shown locked: on the public site, it is a demo to
// look at. To make a graph, start a new one (kept in the visitor's browser only).
const locked = (doc) => ({ ...doc, meta: { ...doc.meta, readOnly: true, source: { format: 'example' } } })
const EXAMPLES = {
  rulezet: { name: 'the Rulezet example', doc: locked(rulezetExample) },
  circl: { name: 'the CIRCL example', doc: locked(circlExample) },
  ngsoti: { name: 'the NGSOTI SOC stack example', doc: locked(ngsotiExample) },
}
const EXAMPLE = EXAMPLES.rulezet.doc

/** The key of the bundled example a document is (same title), or null. */
function exampleKey(doc) {
  if (!isExample(doc)) return null
  return Object.entries(EXAMPLES).find(([, e]) => e.doc.meta.title === doc.meta?.title)?.[0] ?? null
}

/** ?example=<key> in the address while a bundled example is shown, so the link opens it again. */
function syncAddress(doc) {
  if (EMBED.enabled) return
  const url = new URL(location.href)
  const key = exampleKey(doc)
  if (key) url.searchParams.set('example', key)
  else url.searchParams.delete('example')
  if (url.href !== location.href) history.replaceState(history.state, '', url)
}

/** A bundled example, or a copy of one (same title) saved by an older version. */
function isExample(doc) {
  return doc?.meta?.source?.format === 'example'
    || Object.values(EXAMPLES).some((e) => doc?.meta?.title === e.doc.meta.title)
}

// One graph per organisation of the CIRCL example, from its Open Contributions
// Descriptor (examples/circl/<id>.json, written by scripts/circl-orgs.mjs).
// Loaded when opened, so they don't weigh on the app.
const CIRCL_ORGS = import.meta.glob('../examples/circl/*.json', { import: 'default' })

/** Lets the visitor pick an organisation of the CIRCL example and opens its graph. */
async function pickCirclOrganisation() {
  const orgs = circlExample.nodes.filter((n) => CIRCL_ORGS[`../examples/circl/${n.id}.json`])
  const values = await openFormModal({
    title: 'CIRCL organisations',
    submitLabel: 'Open',
    build: (body) => {
      let chosen = null
      const error = h('div', { class: 'pg-form-error', hidden: true })
      const tiles = orgs.map((org) => {
        const repos = org.details?.own_repositories
        return h('button', {
          type: 'button',
          class: 'pg-org-tile',
          onclick: () => {
            chosen = org
            body.closest('form').requestSubmit()
          },
        },
        h('img', { src: org.image, alt: '', loading: 'lazy' }),
        h('span', { class: 'pg-org-name' }, org.label),
        h('small', { class: 'pg-muted' }, repos === undefined ? '' : `${repos} repositor${repos === 1 ? 'y' : 'ies'}`))
      })
      body.append(error,
        h('p', { class: 'pg-muted pg-field-wide' }, 'The GitHub organisations managed or co-managed by CIRCL. Each one opens as its own graph: the organisation and its public repositories.'),
        h('div', { class: 'pg-org-grid pg-field-wide' }, tiles))
      return {
        values: () => chosen,
        validate: () => (chosen ? null : 'Choose an organisation.'),
        showError: (message) => {
          error.textContent = message ?? ''
          error.hidden = !message
        },
      }
    },
  })
  if (!values) return
  if (view.nodes().length && !(await confirmModal(`Replace the current graph with the graph of ${values.label}?`, { confirmLabel: 'Load', danger: false }))) return
  const doc = await CIRCL_ORGS[`../examples/circl/${values.id}.json`]()
  loadRaw(locked(doc), 'example')
}

// A node's `graph` field points to another graph (the graph of an organisation
// from the CIRCL example, …): opening it keeps the way back.
const graphHistory = []
let openingNodeGraph = false

/** Loads a graph: a bundled one (examples/…) or a URL relative to the app. */
async function fetchGraph(path) {
  const bundled = CIRCL_ORGS[`../${path.replace(/^\.?\//, '')}`]
  if (bundled) return bundled()
  const response = await fetch(new URL(path, location.href), { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`the server answered ${response.status}`)
  return response.json()
}

async function openNodeGraph(node) {
  // Embedded (the Hugo component…): the host page shows that graph, on its own page.
  if (EMBED.enabled && inFrame) return tellHost({ type: 'pivograph:open', url: node.graph, label: node.label }, EMBED.host)
  let raw
  try {
    raw = await fetchGraph(node.graph)
  } catch (error) {
    return toast(`Could not open the graph of ${node.label}: ${error.message}.`, 'error')
  }
  const back = { raw: currentDocument(), source: state.meta.source?.format === 'example' ? 'example' : 'graph' }
  const wasExample = isExample(state)
  openingNodeGraph = true
  try {
    const { errors } = loadRaw(wasExample && !isOcd(raw) ? locked(raw) : raw, node.graph)
    if (!errors.length) graphHistory.push(back)
  } finally {
    openingNodeGraph = false
  }
  renderHeader()
}

function goBack() {
  const previous = graphHistory.pop()
  if (!previous) return
  openingNodeGraph = true
  try {
    loadRaw(previous.raw, previous.source)
  } finally {
    openingNodeGraph = false
  }
  renderHeader()
}

async function loadExample(key = 'rulezet') {
  const example = EXAMPLES[key]
  if (view.nodes().length && !(await confirmModal(`Replace the current graph with ${example.name}?`, { confirmLabel: 'Load', danger: false }))) return
  loadRaw(example.doc, 'example')
}

// --- rendering ------------------------------------------------------------------

function renderHeader() {
  const title = document.getElementById('doc-title')
  title.value = state.meta.title ?? ''
  title.readOnly = !editable()
  document.title = `${state.meta.title || 'Graph'} · Pivograph`
  // Locked graphs show no way to add anything: the Add menu is hidden, not just disabled.
  const arrangeMenu = document.getElementById('btn-arrange')
  arrangeMenu.disabled = !editable()
  arrangeMenu.closest('.pg-menu-wrap').hidden = !editable()
  document.getElementById('footer-hint').textContent = editable() ? 'Saved in this browser only · double-click to edit' : 'Click a tag or a type to filter'
  // Read-only graphs (the example, imported descriptors, files marked
  // readOnly) can't be unlocked: to make a graph, start a new one.
  const badge = document.getElementById('readonly-badge')
  badge.hidden = editable()
  const format = state.meta.source?.format
  const what = format === 'example' ? 'Example'
    : format === 'ocd' ? `Well-known of ${state.meta.source.domain ?? 'an organization'}`
    : 'This graph'
  const previous = graphHistory.at(-1)
  // replaceChildren() would write a null as the text "null": leave it out instead.
  badge.replaceChildren(...[
    previous && h('button', { class: 'pg-btn pg-btn-ghost', title: 'Back to the previous graph', onclick: goBack }, `← ${previous.raw.meta?.title || 'Back'}`),
    h('span', { title: 'This graph can be explored and exported, not edited' }, `🔒 ${what} · read-only`),
    h('button', { class: 'pg-btn pg-btn-ghost', title: 'Start your own graph, saved in this browser only', onclick: newDocument }, 'New graph'),
  ].filter(Boolean))
}

function swatch(attrs) {
  if (attrs.image) return h('img', { class: 'pg-swatch pg-swatch-image', src: attrs.image, alt: '', style: `--swatch:${attrs.color}` })
  return h('span', { class: `pg-swatch pg-shape-${attrs.shape}`, style: `--swatch:${attrs.color}` })
}

function actionButtons(onEdit, onDelete) {
  if (!editable()) return null
  return h('span', { class: 'pg-item-actions' },
    h('button', { class: 'pg-icon-btn', title: 'Edit', onclick: (e) => { e.stopPropagation(); onEdit() } }, '✎'),
    h('button', { class: 'pg-icon-btn pg-icon-danger', title: 'Delete', onclick: (e) => { e.stopPropagation(); onDelete() } }, '🗑'))
}

function matches(...texts) {
  const q = ui.filter.trim().toLowerCase()
  return !q || texts.some((t) => String(t ?? '').toLowerCase().includes(q))
}

function renderNodes() {
  const nodes = view.nodes()
    .map((n) => ({ id: String(n.id), data: n.getData() }))
    .filter(({ id, data }) => matches(id, data.label, data.type, data.description, ...(data.tags ?? []).map((t) => `#${t}`)))
    .sort((a, b) => (a.data.label ?? a.id).localeCompare(b.data.label ?? b.id))
  return h('div', {},
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: addNode }, '+ Node') : null),
    nodes.length === 0
      ? h('p', { class: 'pg-empty' }, ui.filter ? 'No matching node.' : 'No nodes yet. Add one with the button above or with Pivotick’s Create tool.')
      : h('ul', { class: 'pg-list' }, nodes.map(({ id, data }) => {
          const attrs = resolveNode(data, state.nodeTypes)
          const degree = view.edges().filter((e) => String(e.from.id) === id || String(e.to.id) === id).length
          return h('li', { class: 'pg-item', onclick: () => view.select(id), ondblclick: () => view.editNode(id) },
            swatch(attrs),
            h('span', { class: 'pg-item-main' },
              h('span', { class: 'pg-item-title' }, data.label ?? id),
              h('span', { class: 'pg-item-sub' },
                data.type ? h('span', { class: 'pg-tag' }, state.nodeTypes[data.type]?.label || data.type) : null,
                `${degree} edge${degree === 1 ? '' : 's'}`),
              // The description, like OCD Viewer's cards (tags are in the Tags tab and filter).
              data.description ? h('span', { class: 'pg-item-desc', title: data.description }, data.description) : null),
            editable() ? h('button', { class: 'pg-icon-btn', title: 'New edge from this node', onclick: (e) => { e.stopPropagation(); addEdge(id) } }, '↗') : null,
            actionButtons(() => view.editNode(id), () => removeNode(id, data.label ?? id)))
        })))
}

function renderEdges() {
  const labelOf = (node) => node.getData().label ?? String(node.id)
  const edges = view.edges()
    .map((e) => ({ id: String(e.id), from: labelOf(e.from), to: labelOf(e.to), data: e.getData() }))
    .filter(({ from, to, data }) => matches(from, to, data.label, data.type))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  return h('div', {},
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: () => addEdge() }, '+ Edge') : null),
    edges.length === 0
      ? h('p', { class: 'pg-empty' }, ui.filter ? 'No matching edge.' : 'No edges yet. Add one, or connect two nodes with Pivotick’s Add edge tool.')
      : h('ul', { class: 'pg-list' }, edges.map(({ id, from, to, data }) => {
          const attrs = resolveEdge(data, state.edgeTypes)
          const dir = DIRECTIONS[attrs.direction] ?? DIRECTIONS.forward
          return h('li', { class: 'pg-item', onclick: () => view.select(id), ondblclick: () => view.editEdge(id) },
            h('span', { class: `pg-edge-swatch${attrs.dashed ? ' pg-dashed' : ''}`, style: `--swatch:${attrs.color}` }),
            h('span', { class: 'pg-item-main' },
              h('span', { class: 'pg-item-title' }, from, h('span', { class: 'pg-dir', title: dir.label }, ` ${dir.symbol} `), to),
              h('span', { class: 'pg-item-sub' },
                data.type ? h('span', { class: 'pg-tag' }, state.edgeTypes[data.type]?.label || data.type) : null,
                attrs.label ?? '')),
            actionButtons(() => view.editEdge(id), () => removeEdge(id)))
        })))
}

/** Active filters (from the sidebar or Pivotick's panel), with a way out. */
function filterBanner() {
  if (!view.graph) return ''
  const tags = view.filterValues('tags').map((t) => `#${t}`)
  const types = view.filterValues('type').map((t) => state.nodeTypes[t]?.label || t)
  const layers = view.edgeFilterValues()
  // Other facets of the filter panel (not Pivotick's internal keys, e.g. manual hides).
  const filters = view.graph.queryEngine.getFilters()
  const others = ['label', 'description', 'status', 'license'].filter((k) => filters[k]?.value !== undefined && filters[k].value !== '')
  const parts = [...tags, ...types, ...layers.map((l) => `→ ${l}`), ...others.map((k) => `${k}: ${[].concat(filters[k].value).join(', ')}`)]
  if (!parts.length) return ''
  return h('div', { class: 'pg-filter-banner' },
    h('span', {}, h('strong', {}, 'Filtered: '), parts.join(', ')),
    h('button', { class: 'pg-btn pg-btn-ghost', onclick: () => view.resetFilters() }, 'Clear'))
}

function renderTags() {
  const tags = knownTags().filter((t) => matches(`#${t}`))
  return h('div', {},
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: () => editTag() }, '+ Tag') : null),
    tags.length === 0
      ? h('p', { class: 'pg-empty' }, ui.filter ? 'No matching tag.' : 'No tags yet. Add #tags to a node (Badges tab of the node form): each one becomes a badge.')
      : h('ul', { class: 'pg-list' }, tags.map((name) => {
          const used = tagUsage(name).length
          const def = state.tags[name]
          const active = view.filterValues('tags').includes(name)
          return h('li', {
            class: `pg-item${active ? ' is-filtered' : ''}`,
            title: active ? 'Click to stop filtering by this tag' : 'Click to show only nodes with this tag',
            onclick: () => view.toggleFilter('tags', name),
            ondblclick: () => editTag(name),
          },
            h('span', { class: 'pg-item-main' },
              h('span', { class: 'pg-item-title' }, tagPill(name, state.tags)),
              h('span', { class: 'pg-item-sub' },
                `used on ${used} node${used === 1 ? '' : 's'}`,
                def?.icon ? ` · ${def.icon}` : '')),
            actionButtons(() => editTag(name), () => removeTag(name)))
        })))
}

function renderSections() {
  const endName = (end) => (end.node !== undefined
    ? view.nodes().find((n) => String(n.id) === end.node)?.getData().label ?? end.node
    : end.section !== undefined ? state.sections.find((s) => s.id === end.section)?.title || end.section
    : end.note !== undefined ? `note “${(view.notes().find((n) => String(n.id) === end.note)?.content ?? end.note).split('\n')[0].slice(0, 24)}”`
    : end.shape !== undefined ? (() => {
      const shape = state.shapes.find((sh) => sh.id === end.shape)
      return shape?.text ? `“${shape.text.split('\n')[0].slice(0, 24)}”` : (SHAPE_LABELS_DRAWN[shape?.kind] ?? 'a shape').toLowerCase()
    })()
    : end.stroke !== undefined ? 'a drawing'
    : 'a point')
  return h('div', {},
    h('h3', { class: 'pg-drawing-heading' }, 'Sections'),
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: () => editSection() }, '+ Section') : null),
    state.sections.length === 0
      ? h('p', { class: 'pg-empty' }, 'No sections. A section is a titled frame drawn behind the graph (“Incident response”, “Sensors”…), for the picture only: drag its title to move it, its corner to resize it. Pair it with Add → Fixed layout so the nodes stay inside.')
      : h('ul', { class: 'pg-list' }, state.sections.map((section) => h('li', { class: 'pg-item', ondblclick: () => editSection(section.id) },
          h('span', { class: 'pg-swatch pg-shape-square', style: `--swatch:${section.color ?? 'var(--muted)'}` }),
          h('span', { class: 'pg-item-main' },
            h('span', { class: 'pg-item-title' }, section.title || h('em', { class: 'pg-muted' }, 'untitled')),
            h('span', { class: 'pg-item-sub' }, `${section.width ?? 400} × ${section.height ?? 240} at ${section.x}, ${section.y}`)),
          actionButtons(() => editSection(section.id), () => removeSection(section.id))))),
    h('h3', { class: 'pg-drawing-heading' }, 'Notes'),
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: addNote }, '+ Note') : null,
      editable() ? h('button', { class: 'pg-btn', onclick: toggleLegend }, state.legend && !state.legend.hidden ? 'Hide the legend' : 'Show a legend') : null),
    view.notes().length === 0
      ? h('p', { class: 'pg-empty' }, 'No notes. Pivotick’s notes (Create → Add note, or + Note here) are cards on the canvas; one can be attached to a node or an edge, and arrows connect to them.')
      : h('ul', { class: 'pg-list' }, view.notes().map((note) => h('li', {
          class: 'pg-item', onclick: () => view.graph.focusElement(note),
        },
          h('span', { class: 'pg-swatch pg-shape-square', style: `--swatch:${note.color}` }),
          h('span', { class: 'pg-item-main' },
            h('span', { class: 'pg-item-title' }, (note.content || '(empty)').split('\n')[0].replace(/^#+\s*/, '').slice(0, 60)),
            note.getAttachedElement?.() ? h('span', { class: 'pg-item-sub' }, `attached to a ${note.getAttachedElement().type}`) : null),
          editable() ? h('span', { class: 'pg-item-actions' },
            h('button', { class: 'pg-icon-btn pg-icon-danger', title: 'Delete', onclick: (e) => { e.stopPropagation(); removeNote(String(note.id)) } }, '🗑')) : null))),
    h('h3', { class: 'pg-drawing-heading' }, 'Shapes'),
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: () => editShape() }, '+ Shape') : null),
    state.shapes.length === 0
      ? h('p', { class: 'pg-empty' }, 'No shapes. A shape — rectangle, ellipse, cloud, star, speech bubble, picture, icon… — is drawn behind the graph, with text inside. Drag it to move it, its corner to resize it; arrows connect to it.')
      : h('ul', { class: 'pg-list' }, state.shapes.map((shape) => h('li', {
          class: 'pg-item', onclick: () => view.drawing.pick({ kind: 'shape', id: shape.id }), ondblclick: () => editShape(shape.id),
        },
          h('span', { class: 'pg-swatch pg-shape-square', style: `--swatch:${shape.fill && shape.fill !== 'none' ? shape.fill : 'transparent'}` }),
          h('span', { class: 'pg-item-main' },
            h('span', { class: 'pg-item-title' }, shape.text ? shape.text.split('\n')[0].replace(/^#+\s*/, '') : SHAPE_LABELS_DRAWN[shape.kind]),
            h('span', { class: 'pg-item-sub' }, `${SHAPE_LABELS_DRAWN[shape.kind]} · ${shape.width ?? ''}${shape.width ? ' × ' : ''}${shape.height ?? ''}`)),
          actionButtons(() => editShape(shape.id), () => removeShape(shape.id))))),
    h('h3', { class: 'pg-drawing-heading' }, 'Drawings'),
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: () => view.drawing.setMode('pen') }, '✎ Pen') : null),
    state.strokes.length === 0
      ? h('p', { class: 'pg-empty' }, 'No drawings. Take the pen (P, or ✎ on the canvas) and drag to draw by hand: a circle around a group, an underline, a quick sketch.')
      : h('ul', { class: 'pg-list' }, state.strokes.map((stroke, i) => h('li', {
          class: 'pg-item', onclick: () => view.drawing.pick({ kind: 'stroke', id: stroke.id }), ondblclick: () => editStroke(stroke.id),
        },
          h('span', { class: `pg-edge-swatch${stroke.dashed ? ' pg-dashed' : ''}`, style: `--swatch:${stroke.color ?? '#343a40'}` }),
          h('span', { class: 'pg-item-main' }, h('span', { class: 'pg-item-title' }, `Drawing ${i + 1}`),
            h('span', { class: 'pg-item-sub' }, `${stroke.points.length} points`)),
          actionButtons(() => editStroke(stroke.id), () => removeStroke(stroke.id))))),
    h('h3', { class: 'pg-drawing-heading' }, 'Arrows'),
    h('p', { class: 'pg-muted pg-drawing-tip' }, 'Tip: Draw (D, on the rail on the left) → Connect, then click any two things — nodes, notes, shapes, drawings, sections — to link them.'),
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: () => editArrow() }, '+ Arrow') : null),
    state.arrows.length === 0
      ? h('p', { class: 'pg-empty' }, 'No arrows. Unlike an edge, an arrow can start or end on a section or anywhere on the canvas, at the exact spot you choose: click it on the graph, then drag its ends and its label.')
      : h('ul', { class: 'pg-list' }, state.arrows.map((arrow) => h('li', {
          class: 'pg-item', onclick: () => view.drawing.select(arrow.id), ondblclick: () => editArrow(arrow.id),
        },
          h('span', { class: `pg-edge-swatch${arrow.dashed ? ' pg-dashed' : ''}`, style: `--swatch:${arrow.color ?? '#343a40'}` }),
          h('span', { class: 'pg-item-main' },
            h('span', { class: 'pg-item-title' }, endName(arrow.from), h('span', { class: 'pg-dir' }, ` ${DIRECTIONS[arrow.direction ?? 'forward']?.symbol ?? '→'} `), endName(arrow.to)),
            arrow.label ? h('span', { class: 'pg-item-sub' }, arrow.label.replace(/\n/g, ' ')) : null),
          actionButtons(() => editArrow(arrow.id), () => removeArrow(arrow.id))))))
}

function renderTypes() {
  const section = (kind, title, types) => h('section', { class: 'pg-types' },
    h('div', { class: 'pg-toolbar' },
      h('h3', {}, title),
      editable() ? h('button', { class: 'pg-btn', onclick: () => editType(kind) }, '+ Type') : null),
    Object.keys(types).length === 0
      ? h('p', { class: 'pg-empty' }, 'No types yet. A type gives several items a shared style.')
      : h('ul', { class: 'pg-list' }, Object.entries(types).map(([name, def]) => {
          const elements = kind === 'node' ? view.nodes() : view.edges()
          const used = elements.filter((el) => el.getData().type === name).length
          const attrs = kind === 'node' ? resolveNode({ type: name }, types) : resolveEdge({ type: name }, types)
          const active = kind === 'node' ? view.filterValues('type').includes(name) : view.isEdgeFilterActive(name)
          return h('li', {
            class: `pg-item${active ? ' is-filtered' : ''}`,
            title: active ? 'Click to stop filtering by this type' : `Click to show only ${kind === 'node' ? 'nodes' : 'relationships'} of this type`,
            onclick: () => (kind === 'node' ? view.toggleFilter('type', name) : view.toggleEdgeFilter(name)),
            ondblclick: () => editType(kind, name),
          },
            kind === 'node'
              ? swatch(attrs)
              : h('span', { class: `pg-edge-swatch${attrs.dashed ? ' pg-dashed' : ''}`, style: `--swatch:${attrs.color}` }),
            h('span', { class: 'pg-item-main' },
              h('span', { class: 'pg-item-title' }, def.label || name),
              h('span', { class: 'pg-item-sub' }, h('code', {}, name), ` · used ${used} time${used === 1 ? '' : 's'}`)),
            actionButtons(() => editType(kind, name), () => removeType(kind, name)))
        })))
  return h('div', {},
    section('node', 'Node types', state.nodeTypes),
    section('edge', 'Edge types', state.edgeTypes))
}

function renderJson() {
  const textarea = h('textarea', { class: 'pg-json', spellcheck: false, readOnly: !editable() })
  textarea.value = ui.jsonDraft ?? JSON.stringify(currentDocument(), null, 2)
  const status = h('div', { class: 'pg-json-status' })
  textarea.addEventListener('input', () => {
    ui.jsonDirty = true
    ui.jsonDraft = textarea.value
    status.textContent = 'Changes not applied yet.'
  })
  const apply = () => {
    let raw
    try {
      raw = JSON.parse(textarea.value)
    } catch (error) {
      status.replaceChildren(h('span', { class: 'pg-error' }, `Invalid JSON: ${error.message}`))
      return
    }
    const { errors, warnings } = loadRaw(raw, 'JSON')
    if (errors.length) {
      status.replaceChildren(h('ul', { class: 'pg-error' }, errors.map((e) => h('li', {}, e))))
      return
    }
    ui.jsonDraft = undefined
    status.replaceChildren(warnings.length ? h('ul', { class: 'pg-warning' }, warnings.map((w) => h('li', {}, w))) : 'Applied.')
  }
  const reset = () => {
    ui.jsonDirty = false
    ui.jsonDraft = undefined
    renderSidebar()
  }
  return h('div', { class: 'pg-json-panel' },
    h('div', { class: 'pg-toolbar' },
      editable() ? h('button', { class: 'pg-btn pg-btn-primary', onclick: apply }, 'Apply') : null,
      h('button', { class: 'pg-btn', onclick: reset }, 'Discard changes'),
      h('label', { class: 'pg-check', title: 'Include x/y positions to keep the same layout' },
        h('input', {
          type: 'checkbox', checked: ui.withPositions,
          onchange: (e) => { ui.withPositions = e.target.checked; if (!ui.jsonDirty) renderSidebar() },
        }), 'positions')),
    textarea,
    status)
}

const TABS = {
  nodes: { label: 'Nodes', render: renderNodes, count: () => view.nodes().length },
  edges: { label: 'Edges', render: renderEdges, count: () => view.edges().length },
  tags: { label: 'Tags', render: renderTags, count: () => knownTags().length },
  sections: { label: 'Drawing', render: renderSections, count: () => state.sections.length + state.arrows.length + view.notes().length + state.shapes.length + state.strokes.length },
  types: { label: 'Types', render: renderTypes, count: () => Object.keys(state.nodeTypes).length + Object.keys(state.edgeTypes).length },
  json: { label: 'JSON', render: renderJson },
}

function renderSidebar() {
  // Don't clobber JSON the user is in the middle of editing.
  if (ui.tab === 'json' && ui.jsonDirty && document.querySelector('.pg-json')) return

  const tabs = document.getElementById('tabs')
  tabs.replaceChildren(...Object.entries(TABS).map(([key, tab]) => h('button', {
    class: `pg-tab${ui.tab === key ? ' is-active' : ''}`,
    role: 'tab',
    'aria-selected': String(ui.tab === key),
    onclick: () => { ui.tab = key; renderSidebar() },
  }, tab.label, tab.count ? h('span', { class: 'pg-count' }, tab.count()) : null)))

  document.getElementById('search-row').hidden = !['nodes', 'edges', 'tags'].includes(ui.tab)
  document.getElementById('panel').replaceChildren(filterBanner(), TABS[ui.tab].render())
}

// --- wiring ------------------------------------------------------------------------

const PILLS_KEY = 'pivograph:show-tags'

/** Tag pills on the graph, on or off; remembered per browser. */
function bindPillsToggle() {
  const button = document.getElementById('btn-pills')
  let show = EMBED.tags
  try {
    if (!EMBED.enabled) show = EMBED.tags || localStorage.getItem(PILLS_KEY) === 'on'
  } catch {
    // storage unavailable: pills stay hidden
  }
  const apply = () => {
    button.setAttribute('aria-pressed', String(show))
    button.textContent = show ? '# Tags on graph' : '# Tags hidden'
    view.setShowPills(show)
  }
  button.addEventListener('click', () => {
    show = !show
    try {
      localStorage.setItem(PILLS_KEY, show ? 'on' : 'off')
    } catch {
      // storage unavailable: the choice lasts until reload
    }
    apply()
  })
  apply()
}

const SIDEBAR_KEY = 'pivograph:sidebar-width'

/** Drag (or arrow keys on) the panel's edge to resize it; the width is remembered. */
function bindSidebarResizer() {
  const handle = document.getElementById('sidebar-resizer')
  const root = document.documentElement
  const clamp = (w) => Math.round(Math.min(Math.max(w, 280), window.innerWidth * 0.6))
  const apply = (w) => root.style.setProperty('--sidebar', `${clamp(w)}px`)
  const save = () => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(document.querySelector('.pg-sidebar').offsetWidth))
    } catch {
      // storage unavailable: the width just isn't remembered
    }
  }
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_KEY))
    if (saved) apply(saved)
  } catch {
    // storage unavailable: keep the default width
  }
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    handle.setPointerCapture(event.pointerId)
    handle.classList.add('is-dragging')
    document.body.classList.add('pg-resizing')
    const move = (e) => apply(e.clientX)
    const up = () => {
      handle.classList.remove('is-dragging')
      document.body.classList.remove('pg-resizing')
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      save()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  })
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 60 : 20
    const width = document.querySelector('.pg-sidebar').offsetWidth
    if (event.key === 'ArrowLeft') apply(width - step)
    else if (event.key === 'ArrowRight') apply(width + step)
    else return
    event.preventDefault()
    save()
  })
}

function bindHeader() {
  document.getElementById('doc-title').addEventListener('input', (e) => {
    state.meta.title = e.target.value
    document.title = `${state.meta.title || 'Graph'} · Pivograph`
    persist()
  })
  document.getElementById('header-actions').append(
    // Adding nodes, edges and notes is Pivotick's Create mode; drawing is the
    // Draw mode on its rail. The header keeps what Pivotick doesn't do.
    menuButton({
      id: 'btn-arrange',
      label: 'Arrange',
      items: [
        { heading: 'Place every node once, then fix the layout' },
        { label: 'Tree, top to bottom', hint: 'Along the edges, as a flowchart', onclick: () => arrange('tree-down'), disabled: () => view.nodes().length === 0 },
        { label: 'Tree, left to right', hint: 'The same, sideways', onclick: () => arrange('tree-right'), disabled: () => view.nodes().length === 0 },
        { label: 'Grid', hint: 'Rows and columns, grouped by type', onclick: () => arrange('grid'), disabled: () => view.nodes().length === 0 },
        { label: 'Circle', hint: 'A ring; a hub goes in the middle', onclick: () => arrange('circle'), disabled: () => view.nodes().length === 0 },
        { label: 'Snap to grid', hint: 'Round every position to 20 px, to line nodes up', onclick: () => arrange('snap'), disabled: () => view.nodes().length === 0 },
        { label: 'Undo the last arrangement', hint: 'Put the nodes back where they were', onclick: undoArrange, disabled: () => !beforeArrange },
        'separator',
        {
          label: () => (state.meta.fixedLayout ? 'Automatic layout' : 'Fixed layout'),
          hint: () => (state.meta.fixedLayout ? 'Let the physics place the nodes again' : 'Nodes stay where you drop them, as in a diagram'),
          onclick: toggleFixedLayout,
        },
      ],
    }),
    menuButton({
      id: 'btn-graph',
      label: 'Graph',
      items: [
        { label: 'New graph', hint: 'Start empty; saved in this browser only', onclick: newDocument },
        { label: 'Open a file…', hint: 'Pivograph JSON or open-contributions.json', onclick: pickFile },
        { label: 'Paste JSON…', hint: 'Paste a graph (or an OCD file) as text', onclick: pasteJson },
        { label: 'Import an organization…', hint: 'From its .well-known/open-contributions.json', onclick: importWellKnown },
        { label: 'Import a Mermaid flowchart…', hint: 'Text → diagram: flowchart LR / graph TD', onclick: importMermaid },
        'separator',
        { label: 'Rulezet example', hint: 'Projects linked to Rulezet', onclick: () => loadExample('rulezet') },
        { label: 'CIRCL example', hint: 'The GitHub organisations of CIRCL', onclick: () => loadExample('circl') },
        { label: 'NGSOTI SOC stack example', hint: 'A drawn diagram: cards, sections, arrows', onclick: () => loadExample('ngsoti') },
        { label: 'CIRCL organisations…', hint: 'One graph per organisation: its projects', onclick: pickCirclOrganisation },
      ],
    }),
    menuButton({
      id: 'btn-export',
      label: 'Export',
      align: 'end',
      items: [
        { label: 'Graph data (JSON)', hint: 'To open again or edit later', onclick: exportJson },
        { label: 'Pivotick data (JSON)', hint: 'Nodes and edges with styles, for new Pivotick()', onclick: exportPivotick },
        { label: 'Report (PDF)', hint: 'Picture of the graph + a written description', onclick: () => exportReport('pdf') },
        { label: 'Report (Markdown)', hint: 'The same report, as a .md file', onclick: () => exportReport('md') },
        { label: 'Picture (PNG)', hint: 'The whole graph as drawn', onclick: exportPicture },
        { label: 'Vector picture (SVG)', hint: 'Sharp at any size; opens in Inkscape, slides, a browser', onclick: exportSvg },
      ],
    }))
  document.getElementById('search').addEventListener('input', (e) => {
    ui.filter = e.target.value
    renderSidebar()
  })
  document.getElementById('pivotick-version').textContent = `Pivotick ${pivotickPackage.version}`
  bindSidebarResizer()
  bindPillsToggle()

  // Drop a JSON file anywhere to open it.
  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    e.preventDefault()
    importFile(file)
  })
}

// --- start --------------------------------------------------------------------------

const inFrame = window.parent !== window

function tellHost(message, origin = '*') {
  // A host opened from a file has the origin "null", which postMessage can't target.
  if (inFrame) window.parent.postMessage(message, origin && origin !== 'null' ? origin : '*')
}

/** Light / dark and background chosen by the host page (null: keep the OS
 *  colours). This app reads html[data-theme]; Pivotick reads data-theme on its
 *  own .pivotick element (and its OS-based dark mode only applies while <html>
 *  has no data-theme), so both get it — the canvas again after each redraw
 *  (syncCanvasTheme). Colours are checked so a host can't inject CSS. */
const hostTheme = { scheme: null, background: null }

function applyTheme(scheme, background) {
  const root = document.documentElement
  if (scheme === 'light' || scheme === 'dark') {
    hostTheme.scheme = scheme
    view.uiTheme = scheme                 // Pivotick's own option, for the next redraws
    root.setAttribute('data-theme', scheme)
  }
  if (typeof background === 'string' && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i.test(background.trim())) {
    hostTheme.background = background.trim()
    root.style.setProperty('--bg', hostTheme.background)
  }
  syncCanvasTheme()
}

function syncCanvasTheme() {
  document.querySelectorAll('.pivotick').forEach((el) => {
    if (hostTheme.scheme) el.setAttribute('data-theme', hostTheme.scheme)
    if (hostTheme.background) el.style.setProperty('--pvt-bg', hostTheme.background)
  })
}

/** Loads data given by the host page or the ?src URL, and reports back to the host. */
function loadForHost(raw, name, origin) {
  EMBED.host = origin
  const { errors } = loadRaw(raw, name)
  if (errors.length) tellHost({ type: 'pivograph:error', message: errors[0] }, origin)
  else tellHost({ type: 'pivograph:loaded', nodes: view.nodes().length, edges: view.edges().length }, origin)
}

async function loadSrc(url) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`the server answered ${response.status}`)
    loadForHost(await response.json(), url)
  } catch (error) {
    const reason = error instanceof TypeError ? 'network error or cross-origin request blocked (CORS)' : error.message
    toast(`Could not load ${url}: ${reason}.`, 'error')
    tellHost({ type: 'pivograph:error', message: reason })
  }
}

if (inFrame) {
  window.addEventListener('message', (event) => {
    // Only the page embedding the app can load data into it or read it.
    if (event.source !== window.parent) return
    if (event.data?.type === 'pivograph:load') loadForHost(event.data.data, event.data.name ?? 'data', event.origin)
    else if (event.data?.type === 'pivograph:theme') applyTheme(event.data.scheme, event.data.background)
    else if (event.data?.type === 'pivograph:snapshot') {
      snapshot().then((image) => tellHost({ type: 'pivograph:snapshot', image }, event.origin))
    } else if (event.data?.type === 'pivograph:export') {
      const exports = { json: exportJson, pivotick: exportPivotick, png: exportPicture, svg: exportSvg,
                        md: () => exportReport('md'), pdf: () => exportReport('pdf') }
      exports[event.data.format]?.()
    }
    else if (event.data?.type === 'pivograph:get') {
      tellHost({ type: 'pivograph:document', data: view.toDocument(state, true) }, event.origin)
    }
  })
}

// Text measured before a font arrived (cards, arrow labels) is measured again.
registerFonts()
document.fonts?.addEventListener('loadingdone', () => {
  view.drawing.render()
  view.scheduleRestyle()
})

document.body.classList.toggle('pg-embed', EMBED.enabled && !EMBED.toolbar)
if (EMBED.viewer) view.uiMode = 'viewer'
applyTheme(EMBED.theme, EMBED.bg)
document.body.classList.toggle('pg-no-sidebar', !EMBED.sidebar)
bindHeader()
if (EMBED.enabled) {
  // Start empty: the graph comes from ?src or from the host page.
  loadDocument({ ...emptyDocument(), meta: { title: '', readOnly: true } })
  if (EXAMPLES[EMBED.example]) loadRaw(EXAMPLES[EMBED.example].doc, 'example')
  if (EMBED.src) loadSrc(EMBED.src)
} else if (EXAMPLES[EMBED.example]) {
  // A link to an example: show it (the visitor's own graph stays saved, untouched).
  loadRaw(EXAMPLES[EMBED.example].doc, 'example')
  if (EMBED.src) loadSrc(EMBED.src)
} else {
  const saved = restore()
  if (saved) loadDocument(saved)
  else loadRaw(EXAMPLE, 'example')
  if (EMBED.example) toast(`Unknown example "${EMBED.example}": try ${Object.keys(EXAMPLES).join(', ')}.`, 'warning')
  if (EMBED.src) loadSrc(EMBED.src)
}
tellHost({ type: 'pivograph:ready' })
