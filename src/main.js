import './style.css'
import pivotickPackage from 'pivotick/package.json'
import rulezetExample from '../examples/rulezet.json'
import { GraphView } from './graph.js'
import { DIRECTIONS, TAG_FIELDS, compact, emptyDocument, parseDocument, resolveEdge, resolveNode, starterDocument } from './model.js'
import { h } from './ui/dom.js'
import { edgeFields, nodeFields, tagFields, typeFields } from './ui/forms.js'
import { tagPill } from './ui/pills.js'
import { isOcd, ocdToDocument, wellKnownUrl } from './ocd.js'
import { confirmModal, openFormModal, toast } from './ui/modal.js'

const STORAGE_KEY = 'pivograph:document'

/**
 * Embedding in another site (an <iframe>):
 *   ?embed=1     hide the app's top bar (logo, New, Open JSON…)
 *   ?src=<url>   load this JSON at start: a Pivograph graph or an OCD file
 *   ?sidebar=0   hide the side panel
 *   ?tags=0      start with the tag pills hidden
 * The host page can also send the data, e.g. a file its visitor opened:
 *   iframe.contentWindow.postMessage({ type: 'pivograph:load', data, name }, '*')
 * The app announces itself with { type: 'pivograph:ready' } and answers each
 * load with { type: 'pivograph:loaded', nodes, edges } or { type: 'pivograph:error', message }.
 */
const PARAMS = new URLSearchParams(location.search)
const EMBED = {
  enabled: PARAMS.has('embed') && PARAMS.get('embed') !== '0',
  src: PARAMS.get('src'),
  sidebar: PARAMS.get('sidebar') !== '0',
  tags: PARAMS.get('tags') !== '0',
}

// Document-level state. Nodes and edges live in Pivotick (see GraphView).
const state = { meta: {}, nodeTypes: {}, edgeTypes: {}, tags: {} }
const ui = { tab: 'nodes', filter: '', jsonDirty: false, withPositions: true }

const view = new GraphView(document.getElementById('graph'), {
  getTypes: () => state,
  nodeForm: openNodeForm,
  edgeForm: openEdgeForm,
  edgeFields: (container, init) => edgeFields(container, init, edgeContext()),
  confirm: (message) => confirmModal(message),
  onChange: () => {
    renderSidebar()
    persist()
  },
  onFilterChange: () => scheduleSidebar(),
})

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
  state.meta = { ...doc.meta }
  state.nodeTypes = structuredClone(doc.nodeTypes)
  state.edgeTypes = structuredClone(doc.edgeTypes)
  state.tags = structuredClone(doc.tags ?? {})
  ui.jsonDirty = false
  view.load(doc)
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
  // Embedded in another site: never overwrite what the visitor keeps in the app itself.
  if (EMBED.enabled) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view.toDocument(state, true)))
  } catch {
    // storage unavailable (private mode, quota): autosave is only a convenience
  }
}

function restore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return parseDocument(JSON.parse(saved)).doc
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
  return {
    edgeTypes: state.edgeTypes,
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

function typesChanged() {
  view.restyleAll()
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

function exportJson() {
  const doc = currentDocument()
  const name = `${doc.meta.title ? doc.meta.title.replace(/[^\w-]+/g, '_') : 'graphe'}.json`
  download(name, JSON.stringify(doc, null, 2))
}

async function importFile(file) {
  try {
    loadRaw(JSON.parse(await file.text()), file.name)
  } catch (error) {
    toast(`Could not read ${file.name}: ${error.message}`, 'error')
  }
}

function pickFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json' })
  input.addEventListener('change', () => input.files?.[0] && importFile(input.files[0]))
  input.click()
}

async function newDocument() {
  if (view.nodes().length && !(await confirmModal('Clear the current graph?', { confirmLabel: 'New graph' }))) return
  loadDocument(starterDocument())
}

async function loadExample() {
  if (view.nodes().length && !(await confirmModal('Replace the current graph with the Rulezet example?', { confirmLabel: 'Load', danger: false }))) return
  loadRaw(rulezetExample, 'example')
}

// --- rendering ------------------------------------------------------------------

function renderHeader() {
  const title = document.getElementById('doc-title')
  title.value = state.meta.title ?? ''
  title.readOnly = !editable()
  document.title = `${state.meta.title || 'Graph'} · Pivograph`
  for (const id of ['btn-add-node', 'btn-add-edge']) document.getElementById(id).disabled = !editable()
  document.getElementById('footer-hint').textContent = editable() ? 'Double-click an item to edit it' : 'Click a tag or a type to filter'
  // Read-only badge, with the way to unlock editing.
  const badge = document.getElementById('readonly-badge')
  badge.hidden = editable()
  const source = state.meta.source?.format === 'ocd' ? ` · well-known of ${state.meta.source.domain ?? 'an organization'}` : ''
  badge.replaceChildren(
    h('span', { title: 'Editing is turned off for this graph' }, `🔒 Read-only${source}`),
    h('button', { class: 'pg-btn pg-btn-ghost', onclick: enableEditing }, 'Enable editing'))
}

async function enableEditing() {
  const ok = await confirmModal('Enable editing? The graph stops being a faithful view of the imported descriptor as soon as you change it.', { confirmLabel: 'Enable editing', danger: false })
  if (!ok) return
  const doc = view.toDocument(state, true) // keep the current layout
  state.meta.readOnly = false
  loadDocument({ ...doc, meta: { ...doc.meta, readOnly: false } })
  toast('Editing enabled.')
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
    if (EMBED.tags && !EMBED.enabled) show = localStorage.getItem(PILLS_KEY) !== 'off'
  } catch {
    // storage unavailable: pills are shown
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
  document.getElementById('btn-new').addEventListener('click', newDocument)
  document.getElementById('btn-open').addEventListener('click', pickFile)
  document.getElementById('btn-wellknown').addEventListener('click', importWellKnown)
  document.getElementById('btn-example').addEventListener('click', loadExample)
  document.getElementById('btn-export').addEventListener('click', exportJson)
  document.getElementById('btn-add-node').addEventListener('click', addNode)
  document.getElementById('btn-add-edge').addEventListener('click', () => addEdge())
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

/** Loads data given by the host page or the ?src URL, and reports back to the host. */
function loadForHost(raw, name, origin) {
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
    // Only the page embedding the app can load data into it.
    if (event.source !== window.parent || event.data?.type !== 'pivograph:load') return
    loadForHost(event.data.data, event.data.name ?? 'data', event.origin)
  })
}

document.body.classList.toggle('pg-embed', EMBED.enabled)
document.body.classList.toggle('pg-no-sidebar', !EMBED.sidebar)
bindHeader()
if (EMBED.enabled) {
  // Start empty: the graph comes from ?src or from the host page.
  loadDocument({ ...emptyDocument(), meta: { title: '', readOnly: true } })
  if (EMBED.src) loadSrc(EMBED.src)
} else {
  const saved = restore()
  if (saved) loadDocument(saved)
  else loadRaw(rulezetExample, 'example')
  if (EMBED.src) loadSrc(EMBED.src)
}
tellHost({ type: 'pivograph:ready' })
