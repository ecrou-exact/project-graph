// Thin controller around a Pivotick instance. Pivotick owns the nodes and
// edges; this class keeps their style in sync with their data and routes
// Pivotick's own create/edit tools to the application's forms.
import { Pivotick, Node, Edge } from 'pivotick'
import 'pivotick/dist/pivotick.css'
import {
  MARKER_END, MARKER_START, NODE_FIELDS, EDGE_FIELDS,
  compact, edgeLabel, edgeLabelLook, edgeStyle, fromGraph, nodeLabelLook, nodePills, nodeStyle, resolveNode, toRawEdge, toRawNode,
} from './model.js'
import { badgeIconSvg } from './badgeIcons.js'
import { faDiagramProject, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { tagPills } from './ui/pills.js'
import { link, linkList, repoCard, repoLink } from './ui/githubCard.js'
import { detailEntries } from './ui/details.js'
import { loadIcon, isIconLoaded, tintedIcon } from './icons.js'
import { DrawingLayer } from './drawing.js'
import { cardElement } from './cards.js'

const ARROW = {
  pathD: 'M0,-5L10,0L0,5',
  viewBox: '0 -5 10 10',
  refX: 6,
  refY: 0,
  markerWidth: 12,
  markerHeight: 12,
  markerUnits: 'userSpaceOnUse',
  // The arrow takes the colour of the edge it sits on.
  fill: 'context-stroke',
}

/** The plain-data part of Pivograph's Pivotick options: layout and arrow markers. */
// Past this many nodes, a graph is spread out a little more: slightly longer
// links and repulsion (Pivotick's default is -150), so that dozens of projects
// around one organisation stay apart without the graph becoming tiny once fitted.
export const BIG_GRAPH = 30

export function pivotickOptions(doc) {
  // Longer links leave room for the node and edge labels; a document with
  // big nodes or long edge labels can ask for more with meta.linkDistance.
  const distance = Number(doc.meta?.linkDistance) || 150
  const big = (doc.nodes?.length ?? 0) > BIG_GRAPH
  // A drawn diagram (meta.fixedLayout): nodes stay exactly at their x / y.
  if (doc.meta?.fixedLayout) {
    return { isDirected: true, simulation: { enabled: false }, render: { markerStyleMap: markers() } }
  }
  return {
    isDirected: true,
    simulation: big
      ? { d3LinkDistance: Math.max(distance, 190), d3ManyBodyStrength: -250, d3CollideRadiusMultiplier: 2.4 }
      : { d3LinkDistance: distance, d3CollideRadiusMultiplier: 2.2 },
    render: { markerStyleMap: markers() },
  }
}

function markers() {
  return {
    [MARKER_END]: { ...ARROW, orient: 'auto' },
    [MARKER_START]: { ...ARROW, orient: 'auto-start-reverse' },
  }
}

export class GraphView {
  /**
   * @param {HTMLElement} container
   * @param {object} hooks
   * @param {() => object} hooks.getTypes returns { nodeTypes, edgeTypes, tags }
   * @param {(init: object) => Promise<object|null>} hooks.nodeForm opens the node form
   * @param {(init: object) => Promise<object|null>} hooks.edgeForm opens the edge form
   * @param {(container: HTMLElement, init: object) => { values(): object }} hooks.edgeFields
   *   renders the edge fields into a foreign container (Pivotick's modal)
   * @param {(message: string) => Promise<boolean>} hooks.confirm
   * @param {() => void} hooks.onChange called after any change of nodes/edges
   * @param {() => void} [hooks.onFilterChange] called when the graph's filters change
   * @param {(node: object) => void} [hooks.openGraph] opens the graph a node points to (its `graph` field)
   * @param {() => void} [hooks.onDrawingChange] called after a section or an arrow was moved or resized
   * @param {(id: string) => void} [hooks.editSection] opens the section form
   * @param {(id: string) => void} [hooks.editArrow] opens the arrow form
   * @param {(id: string) => void} [hooks.deleteArrow] deletes an arrow
   */
  constructor(container, hooks) {
    this.container = container
    this.hooks = hooks
    this.graph = null
    this.changeTimer = null
    this.restyling = false
    this.pendingIcons = new Set()
    this.iconsArrived = false
    this.pillObserver = null
    this.pillFrame = null
    this.showPills = false
    this.readOnly = false
    this.labelSheet = document.createElement('style')
    document.head.append(this.labelSheet)
    this.drawing = new DrawingLayer({
      getSections: () => this.hooks.getTypes().sections ?? [],
      getArrows: () => this.hooks.getTypes().arrows ?? [],
      editable: () => !this.readOnly,
      onChange: () => this.hooks.onDrawingChange?.(),
      onEditSection: (id) => this.hooks.editSection?.(id),
      onEditArrow: (id) => this.hooks.editArrow?.(id),
      onDeleteArrow: (id) => this.hooks.deleteArrow?.(id),
      nodeBox: (id) => this.nodeBox(id),
      nodeAt: (x, y) => this.nodeAt(x, y),
    })
    this.restyleTimer = null
    this.liftedLabels = new WeakMap() // Pivotick edge group -> its label, moved to the front
  }

  load(doc) {
    this.pillObserver?.disconnect()
    this.graph?.destroy()
    this.container.replaceChildren()
    const mount = document.createElement('div')
    mount.className = 'pg-canvas'
    this.container.append(mount)

    const data = this.toPivotickData(doc)
    // Read-only documents (e.g. an imported well-known): no editing affordance at all.
    const readOnly = Boolean(doc.meta?.readOnly)
    this.readOnly = readOnly
    this.fixedLayout = Boolean(doc.meta?.fixedLayout)
    const editable = { enabled: !readOnly }
    const base = pivotickOptions(doc)
    this.graph = new Pivotick(mount, data, {
      ...base,
      render: {
        ...base.render,
        // Custom renderer so a label inherited from the edge type shows too
        // (Pivotick's default one only reads `data.label`).
        renderLabel: (edge) => {
          const { edgeTypes } = this.hooks.getTypes()
          const text = edgeLabel(edge.getData(), edgeTypes)
          const look = edgeLabelLook(edge.getData(), edgeTypes)
          if (!text || look.hidden) return undefined
          const span = document.createElement('span')
          span.className = 'pg-edge-label'
          span.textContent = text
          // Per-edge label style (inherited from the edge type when unset).
          if (look.color) span.style.color = look.color
          if (look.background === 'none') span.classList.add('pg-edge-label-bare')
          else if (look.background) span.style.background = look.background
          if (look.size) span.style.fontSize = `${look.size}px`
          if (look.font) span.style.fontFamily = look.font
          return span
        },
      },
      UI: {
        // 'viewer' (?mode=viewer when embedded): just the graph — pan, zoom, drag, no panels.
        mode: this.uiMode || 'full',
        // With every editor and notes off, Pivotick drops its Create section.
        editors: { nodeEditor: editable, nodeCreator: editable, edgeCreator: editable, edgeEditor: editable, deletion: editable },
        notes: editable,
        filter: {
          facets: this.filterFacets(doc),
          edgeFacets: [{
            key: 'type', label: 'Relationship',
            accessor: (edge) => this.edgeTypeLabel(edge.getData().type),
          }],
        },
        mainHeader: {
          nodeHeaderMap: {
            title: (n) => n.getData().label || String(n.id),
            subtitle: (n) => n.getData().type || n.getData().description || '',
          },
          edgeHeaderMap: {
            title: (e) => edgeLabel(e.getData(), this.hooks.getTypes().edgeTypes) || `${e.from.getData().label} → ${e.to.getData().label}`,
            subtitle: (e) => e.getData().type || '',
          },
        },
        // Tooltip and details panel: information only. Appearance keys are what
        // the graph already shows, and an embedded image is a huge data: URL.
        propertiesPanel: {
          nodePropertiesMap: (node) => this.nodeProperties(node),
          edgePropertiesMap: (edge) => this.edgeProperties(edge),
        },
        // Right-click on a node: Pivotick's entries, then ours (lists are appended).
        contextMenu: {
          menuNode: {
            menu: [{
              text: 'Open its graph',
              title: 'Open the graph of this node',
              svgIcon: faIconSvg(faDiagramProject),
              variant: 'outline-primary',
              visible: (node) => Boolean(this.hooks.openGraph && node?.getData?.().graph),
              onclick: (_event, node) => {
                const target = Array.isArray(node) ? node[0] : node
                if (target) this.hooks.openGraph(target.getData())
              },
            }, ...(readOnly ? [] : [{
              text: 'Edit node',
              title: 'Edit this node',
              svgIcon: faIconSvg(faPenToSquare),
              variant: 'outline-primary',
              onclick: (_event, node) => {
                const target = Array.isArray(node) ? node[0] : node
                if (target) this.editNode(String(target.id))
              },
            }])],
          },
        },
        tooltip: {
          nodePropertiesMap: (node) => this.nodeProperties(node),
          edgePropertiesMap: (edge) => this.edgeProperties(edge),
        },
      },
      callbacks: {
        onBeforeNodeCreate: (ctx) => this.createNodeFromCanvas(ctx),
        onBeforeEdgeCreate: (ctx) => this.createEdgeFromCanvas(ctx),
        onBeforeDelete: (ctx) => this.confirmDelete(ctx),
        onNodeEdit: (session) => this.editNodeSession(session),
        onEdgeEdit: (session) => this.editEdgeSession(session),
        onNodeDbclick: (_event, node) => this.editNode(String(node.id)),
        onEdgeDbclick: (_event, edge) => this.editEdge(String(edge.id)),
      },
    })

    // Sections and arrows: see drawing.js.
    this.drawing.attach(this.graph.renderer.getZoomGroup())
    // Arrows follow the nodes they're attached to; edge labels go to the front.
    this.moveObserver?.disconnect()
    this.moveObserver = new MutationObserver((records) => {
      // Our own drawing changes the DOM too: only Pivotick's changes matter.
      const ours = (node) => node.closest?.('.pg-drawing-back, .pg-drawing-front, .pg-edge-labels')
      if (records.every((r) => ours(r.target))) return
      this.drawing.schedule()
      this.scheduleLabels()
    })
    this.moveObserver.observe(mount, { subtree: true, childList: true, attributes: true, attributeFilter: ['transform', 'class', 'style'] })
    this.scheduleLabels()

    // Tag pills live inside each node's SVG group; Pivotick rebuilds that group's
    // content on every redraw, so draw them again whenever it does.
    this.pillObserver = new MutationObserver(() => this.schedulePills())
    this.pillObserver.observe(mount, { childList: true, subtree: true })
    this.schedulePills()

    // Edits coming from Pivotick itself: recompute the style from the new data.
    // Our own updateData() calls also emit these, with unchanged data: skip those.
    // Filters applied from Pivotick's panel: let the sidebar show them too.
    this.graph.onVisibleChange(() => this.hooks.onFilterChange?.())

    this.graph.on('nodeChange', (node, prev, next) => sameData(prev, next) || this.restyleNode(node))
    this.graph.on('edgeChange', (edge, prev, next) => sameData(prev, next) || this.restyleEdge(edge))
    // Per-node label looks are keyed by the DOM ids Pivotick assigns, known only
    // once a node exists: apply them, and redraw so label backgrounds get resized.
    const hasLook = (node) => nodeLabelLook(node.getData(), this.hooks.getTypes().nodeTypes)
    if (this.nodes().some(hasLook)) this.restyleAll()
    this.graph.on('nodeAdd', (node) => {
      if (hasLook(node)) this.restyleNode(node)
    })
    for (const event of ['nodeAdd', 'nodeRemove', 'nodeChange', 'edgeAdd', 'edgeRemove', 'edgeChange']) {
      this.graph.on(event, () => this.notifyChange())
    }
  }

  /**
   * Pivotick's filter panel. Option lists are functions, so they are read from
   * the live graph each time the panel opens (tags added since are offered).
   */
  filterFacets(doc) {
    const sorted = (values) => [...values].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)))
    const facets = [
      {
        key: 'tags', label: 'Tags', type: 'multiselect',
        options: (graph) => {
          const all = new Set(Object.keys(this.hooks.getTypes().tags ?? {}))
          for (const node of graph.getNodes()) for (const tag of node.getData().tags ?? []) all.add(tag)
          return sorted(all).map((tag) => ({ label: `#${tag}`, value: tag }))
        },
      },
      {
        key: 'type', label: 'Type', type: 'multiselect',
        options: (graph) => sorted(new Set(graph.getNodes().map((n) => n.getData().type)))
          .map((type) => ({ label: this.hooks.getTypes().nodeTypes[type]?.label || type, value: type })),
      },
      { key: 'label', label: 'Label', type: 'text', matchMode: 'partial' },
      { key: 'description', label: 'Description', type: 'text', matchMode: 'partial' },
    ]
    // Facets for well-known detail fields (OCD projects), offered when present.
    const detailFacets = [
      { key: 'status', label: 'Status', read: (d) => d?.status },
      { key: 'license', label: 'License', read: (d) => d?.repository?.license ?? d?.license },
    ]
    for (const { key, label, read } of detailFacets) {
      if (!doc.nodes.some((n) => read(n.details) !== undefined)) continue
      facets.push({
        key, label, type: 'multiselect',
        accessor: (node) => read(node.getData().details),
        options: (graph) => sorted(new Set(graph.getNodes().map((n) => read(n.getData().details))))
          .map((value) => ({ label: String(value), value: String(value) })),
      })
    }
    return facets
  }

  // --- filters shared with Pivotick's filter panel ---------------------------

  /** The values currently selected for a node filter (tags, type…). */
  filterValues(key) {
    const value = this.graph?.queryEngine.getFilters()[key]?.value
    return Array.isArray(value) ? value : value === undefined ? [] : [value]
  }

  /** Adds a value to a node filter, or removes it when it's already there. */
  toggleFilter(key, value) {
    const engine = this.graph.queryEngine
    const values = new Set(this.filterValues(key))
    if (values.has(value)) values.delete(value)
    else values.add(value)
    if (values.size) engine.setFilter(key, { value: [...values] })
    else engine.removeFilter(key)
    this.hooks.onFilterChange?.()
  }

  /** The relationship layers (edge types) currently selected. */
  edgeFilterValues() {
    const value = this.graph?.queryEngine.getEdgeFilters().type?.value
    return Array.isArray(value) ? value : value === undefined ? [] : [value]
  }

  toggleEdgeFilter(type) {
    const engine = this.graph.queryEngine
    const label = this.edgeTypeLabel(type)
    const values = new Set(this.edgeFilterValues())
    if (values.has(label)) values.delete(label)
    else values.add(label)
    if (values.size) engine.setEdgeFilter('type', { value: [...values] })
    else engine.removeEdgeFilter('type')
    this.hooks.onFilterChange?.()
  }

  isEdgeFilterActive(type) {
    return this.edgeFilterValues().includes(this.edgeTypeLabel(type))
  }

  resetFilters() {
    const engine = this.graph.queryEngine
    engine.resetFilters()
    engine.removeEdgeFilter('type')
    this.hooks.onFilterChange?.()
  }

  edgeTypeLabel(type) {
    if (!type) return '(no type)'
    const def = this.hooks.getTypes().edgeTypes[type]
    return def?.label || type
  }

  // --- reading -------------------------------------------------------------

  /** Tooltip / details panel entries; async when there is a GitHub repo to fetch. */
  nodeProperties(node) {
    const data = node.getData()
    const { nodeTypes, tags } = this.hooks.getTypes()
    const type = data.type && nodeTypes[data.type]
    // Same order as an OCD item: identity, its own fields, then tags and links.
    const entries = [
      ...propertyList([
        ['label', data.label],
        ['type', type ? type.label || data.type : data.type],
        ['description', data.description],
        ['graph', data.graph && this.hooks.openGraph ? graphButton(data, this.hooks.openGraph) : undefined],
      ]),
      ...detailEntries(data.details),
      ...propertyList([
        ['tags', data.tags?.length ? tagPills(data.tags, tags) : undefined],
        ['website', data.url && link(data.url)],
        ['links', data.links?.length ? linkList(data.links) : undefined],
      ]),
    ]
    // GitHub details come from what was saved when the node was edited: showing
    // a node never calls the GitHub API (it is rate-limited).
    if (!data.github) return entries
    const value = data.githubInfo?.fullName ? repoCard(data.githubInfo, { description: !data.description }) : repoLink(data.github)
    return [...entries, { name: 'GitHub', value }]
  }

  edgeProperties(edge) {
    const data = edge.getData()
    const types = this.hooks.getTypes().edgeTypes
    const type = data.type && types[data.type]
    const labelOf = (n) => n.getData().label ?? String(n.id)
    return propertyList([
      ['from', labelOf(edge.from)],
      ['to', labelOf(edge.to)],
      ['label', edgeLabel(data, types)],
      ['type', type ? type.label || data.type : data.type],
      ['description', data.description],
    ]).concat(detailEntries(data.details))
  }

  nodes() {
    return this.graph?.getNodes() ?? []
  }

  /** The live nodes. getNodes() returns copies, which carry fresh DOM ids. */
  liveNodes() {
    return this.graph?.getMutableNodes() ?? []
  }

  edges() {
    return this.graph?.getEdges() ?? []
  }

  toDocument(base, withPositions) {
    return fromGraph(this.graph, base, withPositions)
  }

  // --- writing (programmatic, from the app's own forms) ---------------------

  addNode(values) {
    const raw = this.withStyle(toRawNode(values, this.hooks.getTypes()))
    if (raw.x === undefined) Object.assign(raw, this.freeSpot())
    this.graph.addNode(pinned(raw, { meta: { fixedLayout: this.fixedLayout } }))
    // A graph's first nodes land wherever the empty view happened to be: frame them.
    const count = this.nodes().length
    if (count <= 3) this.graph.renderer.fitAndCenterWhenSettled(1)
    this.notifyChange()
  }

  /** A readable edge id: `from-to`, suffixed when the pair is already linked. */
  freeEdgeId(from, to) {
    const taken = new Set(this.edges().map((e) => String(e.id)))
    let id = `${from}-${to}`
    for (let i = 2; taken.has(id); i++) id = `${from}-${to}-${i}`
    return id
  }

  /**
   * Near the middle of the current graph, so a new node lands in view — but a
   * link's length away from it, so it doesn't sit on top of the others.
   */
  freeSpot() {
    const placed = this.nodes().filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
    if (!placed.length) return { x: 0, y: 0 }
    const cx = placed.reduce((sum, n) => sum + n.x, 0) / placed.length
    const cy = placed.reduce((sum, n) => sum + n.y, 0) / placed.length
    const angle = Math.random() * 2 * Math.PI
    return { x: cx + Math.cos(angle) * 150, y: cy + Math.sin(angle) * 150 }
  }

  updateNode(id, values) {
    const data = compact(values, NODE_FIELDS)
    this.refreshLabelStyles(this.liveNodes().map((n) => (String(n.id) === id ? { domID: n.domID, data } : n)))
    this.graph.updateData([new Node(id, data, this.nodeStyleFor(data))], undefined)
    this.graph.nextTick()
    this.notifyChange()
  }

  removeNode(id) {
    this.graph.removeNode(id)
    this.notifyChange()
  }

  addEdge(values) {
    this.graph.addEdge(toRawEdge(values, this.hooks.getTypes()))
    this.notifyChange()
  }

  updateEdge(id, values) {
    const current = this.edges().find((e) => String(e.id) === id)
    if (!current) return
    const endpointsChanged = String(current.from.id) !== values.from || String(current.to.id) !== values.to
    if (endpointsChanged) {
      // Moving an edge is a remove + add: the simplest way to rewire it everywhere.
      this.graph.removeEdge(id)
      this.addEdge({ ...values, id })
      return
    }
    const data = compact(values, EDGE_FIELDS)
    const edge = new Edge(id, current.from, current.to, data, edgeStyle(data, this.hooks.getTypes().edgeTypes))
    this.graph.updateData(undefined, [edge])
    this.graph.nextTick()
    this.notifyChange()
  }

  removeEdge(id) {
    this.graph.removeEdge(id)
    this.notifyChange()
  }

  /**
   * The node's Pivotick style. An `icon`-fit image is swapped for a copy drawn
   * on the node's colour (see icons.js); until its SVG is loaded the plain path
   * is used, and every node is restyled once it arrives.
   */
  nodeStyleFor(data) {
    const style = nodeStyle(data, this.hooks.getTypes().nodeTypes)
    if (resolveNode(data, this.hooks.getTypes().nodeTypes).shape === 'card') {
      // Read from the node, not `data`: the style outlives edits made through Pivotick.
      style.html = (node) => cardElement(node.getData(), this.hooks.getTypes().nodeTypes, () => this.scheduleRestyle())
      return style
    }
    if (style.imagePath && style.imageFit === 'icon') {
      const path = style.imagePath
      const tinted = tintedIcon(path, style.color, style.shape)
      if (tinted) style.imagePath = tinted
      else if (!isIconLoaded(path)) this.awaitIcon(path)
    }
    return style
  }

  /** Redraws every node soon, once (a card's image arrived: it must be measured again). */
  scheduleRestyle() {
    clearTimeout(this.restyleTimer)
    this.restyleTimer = setTimeout(() => this.graph && this.restyleAll(), 30)
  }

  /** A node's box in graph coordinates: its shape, or its card (not its label). */
  nodeBox(id) {
    const node = this.liveNodes().find((n) => String(n.id) === String(id))
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null
    const group = node.getGraphElement?.()
    const shape = group?.querySelector(':scope > foreignObject, :scope > .node')
    if (shape) {
      const box = shape.getBBox()
      if (box.width && box.height) return { x: node.x + box.x, y: node.y + box.y, width: box.width, height: box.height }
    }
    const size = Number(node.getData().size) || 14
    return { x: node.x - size, y: node.y - size, width: size * 2, height: size * 2 }
  }

  /** The id of the node under a screen point, or null. */
  nodeAt(clientX, clientY) {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const group = el.closest?.('.pvt-node')
      if (!group) continue
      const node = this.liveNodes().find((n) => `node-${n.domID}` === group.id)
      if (node) return String(node.id)
    }
    return null
  }

  scheduleLabels() {
    if (this.labelFrame) return
    this.labelFrame = requestAnimationFrame(() => {
      this.labelFrame = null
      this.liftEdgeLabels()
    })
  }

  /**
   * Pivotick draws each edge's label inside the edge's group, so the edges and
   * nodes drawn after it cover it. Each label is shown by a copy in a layer in
   * front (same coordinates there), kept in step with the original — which
   * Pivotick keeps moving, and which stays in place, hidden (style.css).
   */
  liftEdgeLabels() {
    const front = this.drawing.front
    if (!front?.isConnected) return
    let layer = front.parentNode.querySelector(':scope > .pg-edge-labels')
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      layer.setAttribute('class', 'pg-edge-labels')
    }
    if (layer.nextSibling !== front) front.before(layer)
    const shown = new Set()
    for (const original of front.parentNode.querySelectorAll('.pvt-edge-group > .label-container')) {
      let copy = this.liftedLabels.get(original)
      // A new label, or one whose content Pivotick redrew: copy it again.
      if (!copy || copy.pgSource !== original.innerHTML) {
        const next = original.cloneNode(true)
        next.pgSource = original.innerHTML
        if (copy) copy.replaceWith(next)
        copy = next
        this.liftedLabels.set(original, copy)
      }
      if (copy.parentNode !== layer) layer.append(copy)
      const transform = original.getAttribute('transform') ?? ''
      if (copy.getAttribute('transform') !== transform) copy.setAttribute('transform', transform)
      // Hidden with its edge (filters).
      const style = getComputedStyle(original.parentNode)
      const display = style.display === 'none' || style.visibility === 'hidden' ? 'none' : ''
      if (copy.style.display !== display) copy.style.display = display
      if (copy.style.opacity !== style.opacity) copy.style.opacity = style.opacity
      shown.add(copy)
    }
    // Copies of labels that are gone (edge deleted).
    for (const copy of [...layer.children]) if (!shown.has(copy)) copy.remove()
  }

  /** Restyles once when a pending icon arrives — one redraw per batch, not per node. */
  awaitIcon(path) {
    if (this.pendingIcons.has(path)) return
    this.pendingIcons.add(path)
    loadIcon(path).then((svg) => {
      this.pendingIcons.delete(path)
      if (svg) this.iconsArrived = true
      if (this.pendingIcons.size || !this.iconsArrived) return
      this.iconsArrived = false
      this.restyleAll()
    })
  }

  /**
   * A file for Pivotick alone, without Pivograph: `new Pivotick(el, file, file.options)`.
   * Edge labels inherited from a type are written into `data.label` (the only
   * field Pivotick's default renderer reads); images are left to the caller to inline.
   */
  toPivotickFile(doc) {
    const { nodes, edges } = this.toPivotickData(doc)
    return {
      // A card is drawn by a function, which a file can't hold: a square with its label instead.
      nodes: nodes.map((n) => (n.style.html ? { ...n, style: nodeStyle({ ...n.data, shape: 'square' }, doc.nodeTypes) } : n)),
      edges: edges.map((e) => {
        const label = edgeLabelLook(e.data, doc.edgeTypes).hidden ? '' : edgeLabel(e.data, doc.edgeTypes)
        const { label: _own, ...data } = e.data
        return { ...e, data: label ? { ...data, label } : data }
      }),
      options: pivotickOptions(doc),
    }
  }

  /**
   * The graph as Pivotick's own input, `{ nodes, edges }` with the computed
   * styles: what `load()` passes to `new Pivotick(container, data, options)`.
   */
  toPivotickData(doc) {
    return {
      nodes: doc.nodes.map((n) => pinned(this.withStyle(toRawNode(n, doc)), doc)),
      edges: doc.edges.map((e) => toRawEdge(e, doc)),
    }
  }

  withStyle(raw) {
    return { ...raw, style: this.nodeStyleFor(raw.data) }
  }

  /**
   * Pivotick draws every outside label with one global style, so per-node label
   * colour, background and size go into a stylesheet keyed by the node's DOM id
   * (`node-<domID>`, assigned by Pivotick). Must run before Pivotick redraws the
   * node: it sizes the label's background from the text as styled at that moment.
   * @param {{ domID: string, data: object }[]} [nodes] defaults to the live nodes
   */
  refreshLabelStyles(nodes = this.liveNodes()) {
    const nodeTypes = this.hooks.getTypes().nodeTypes
    const rules = []
    for (const node of nodes) {
      const data = typeof node.getData === 'function' ? node.getData() : node.data
      const look = nodeLabelLook(data, nodeTypes)
      if (!look || !node.domID) continue
      const root = `#${CSS.escape(`node-${node.domID}`)}`
      const text = []
      if (look.color) text.push(`fill: ${cssValue(look.color)}`)
      if (look.size) text.push(`font-size: ${look.size}px`)
      if (look.font) text.push(`font-family: ${cssValue(look.font)}`)
      if (text.length) rules.push(`${root} .pvt-node-label { ${text.join('; ')} }`)
      if (look.background === 'none') rules.push(`${root} .pvt-node-label-group rect { display: none }`)
      else if (look.background) rules.push(`${root} .pvt-node-label-group rect { fill: ${cssValue(look.background)} }`)
    }
    this.labelSheet.textContent = rules.join('\n')
  }

  schedulePills() {
    if (this.pillFrame) return
    this.pillFrame = requestAnimationFrame(() => {
      this.pillFrame = null
      this.drawPills()
    })
  }

  /** Shows or hides every tag pill on the graph (a view setting, not saved in the document). */
  setShowPills(show) {
    this.showPills = show
    this.drawPills()
  }

  /** Draws each node's tag pills in a row under its label (or its shape). */
  drawPills() {
    const { nodeTypes, tags } = this.hooks.getTypes()
    for (const node of this.liveNodes()) {
      const group = node.getGraphElement()
      if (!group) continue
      const pills = this.showPills ? visiblePills(nodePills(node.getData(), nodeTypes, tags)) : []
      const existing = group.querySelector(':scope > .pg-pills')
      const top = pillsTop(group)
      const key = JSON.stringify([pills, top])
      if (existing?.dataset.key === key) continue
      existing?.remove()
      if (!pills.length) continue
      const row = drawPillRow(pills, top)
      row.dataset.key = key
      group.append(row)
    }
  }

  /** Re-applies every style, e.g. after a type definition changed. */
  restyleAll() {
    // setStyle() alone doesn't redraw a node's content; updateData() does.
    this.refreshLabelStyles()
    const edgeTypes = this.hooks.getTypes().edgeTypes
    const nodes = this.nodes().map((n) => new Node(String(n.id), n.getData(), this.nodeStyleFor(n.getData())))
    const edges = this.edges().map((e) => new Edge(String(e.id), e.from, e.to, e.getData(), edgeStyle(e.getData(), edgeTypes)))
    this.graph.updateData(nodes, edges)
    this.graph.nextTick()
  }

  select(id) {
    // The live node, not a copy from getNodes(): Pivotick draws the details header
    // (icon included) from the element it is given.
    const element = this.liveNodes().find((n) => String(n.id) === id) ?? this.edges().find((e) => String(e.id) === id)
    if (element) this.graph.selectElement(element)
  }

  // --- Pivotick UI hooks -----------------------------------------------------

  async createNodeFromCanvas() {
    const values = await this.hooks.nodeForm({ mode: 'create' })
    if (!values) return false
    const data = compact(values, NODE_FIELDS)
    return { accept: true, id: values.id, data, style: this.nodeStyleFor(data) }
  }

  async createEdgeFromCanvas(ctx) {
    if (ctx.kind !== 'edge') return true
    const values = await this.hooks.edgeForm({
      mode: 'create',
      values: { from: String(ctx.source.id), to: String(ctx.target.id) },
      lockEnds: true,
    })
    if (!values) return false
    const data = compact(values, EDGE_FIELDS)
    const id = this.freeEdgeId(values.from, values.to)
    return { accept: true, id, data, style: edgeStyle(data, this.hooks.getTypes().edgeTypes) }
  }

  async confirmDelete(ctx) {
    const parts = []
    if (ctx.nodes.length) parts.push(`${ctx.nodes.length} node(s)`)
    const edgeCount = ctx.edges.length + ctx.cascadingEdges.length
    if (edgeCount) parts.push(`${edgeCount} edge(s)`)
    if (!parts.length) return true
    return this.hooks.confirm(`Delete ${parts.join(' and ')}?`)
  }

  /**
   * Pivotick's "Edit node" tool. In Pivotick 2.0.1 its modal cannot submit a
   * custom body (the submit reads a form that isn't there), so close that modal
   * — which cancels the session — and open our own form instead.
   */
  editNodeSession(session) {
    const id = String(session.node.id)
    requestAnimationFrame(() => {
      document.getElementById('edit-node-modal')?.__modalInstance?.destroy()
      if (session.active) session.cancel()
      this.editNode(id)
    })
    return document.createElement('div')
  }

  /**
   * Pivotick's "Edit edge" entry wants a body for its own modal, and reads
   * nothing back on submit: the body has to keep `session.draft` up to date.
   */
  editEdgeSession(session) {
    const edge = session.edge
    const body = document.createElement('div')
    body.className = 'pg-form'
    const form = this.hooks.edgeFields(body, {
      mode: 'edit',
      lockEnds: true,
      values: { id: String(edge.id), from: String(edge.from.id), to: String(edge.to.id), ...edge.getData() },
    })
    const sync = () => session.setDraft(compact(form.values(), EDGE_FIELDS))
    body.addEventListener('input', sync)
    body.addEventListener('change', sync)
    sync()
    return body
  }

  async editNode(id) {
    const node = this.nodes().find((n) => String(n.id) === id)
    if (!node) return
    // A read-only map can't be edited: double-clicking a node (on the graph or
    // in the side panel) opens its website instead, in a new tab.
    if (this.readOnly) {
      const { url } = node.getData()
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener')
      return
    }
    const values = await this.hooks.nodeForm({ mode: 'edit', values: { id, ...node.getData() } })
    if (values) this.updateNode(id, values)
  }

  async editEdge(id) {
    if (this.readOnly) return
    const edge = this.edges().find((e) => String(e.id) === id)
    if (!edge) return
    const values = await this.hooks.edgeForm({
      mode: 'edit',
      values: { id, from: String(edge.from.id), to: String(edge.to.id), ...edge.getData() },
    })
    if (values) this.updateEdge(id, values)
  }

  // Called on Pivotick's own change events; updateData() may emit them again.
  restyleNode(node) {
    if (this.restyling) return
    this.restyling = true
    try {
      this.refreshLabelStyles()
      this.graph.updateData([new Node(String(node.id), node.getData(), this.nodeStyleFor(node.getData()))], undefined)
      this.graph.nextTick()
    } finally {
      this.restyling = false
    }
  }

  restyleEdge(edge) {
    if (this.restyling) return
    this.restyling = true
    try {
      const style = edgeStyle(edge.getData(), this.hooks.getTypes().edgeTypes)
      this.graph.updateData(undefined, [new Edge(String(edge.id), edge.from, edge.to, edge.getData(), style)])
      this.graph.nextTick()
    } finally {
      this.restyling = false
    }
  }

  notifyChange() {
    clearTimeout(this.changeTimer)
    this.changeTimer = setTimeout(() => this.hooks.onChange(), 50)
  }
}

/**
 * In a fixed layout, a node with a position is pinned there (fx / fy): even
 * with the simulation off, Pivotick runs warm-up ticks on the first layout.
 */
function pinned(raw, doc) {
  if (!doc.meta?.fixedLayout || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return raw
  return { ...raw, fx: raw.x, fy: raw.y }
}

function sameData(a, b) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
}

function propertyList(pairs) {
  return pairs.filter(([, value]) => value !== undefined && value !== '').map(([name, value]) => ({ name, value }))
}

/** Values from the JSON go into a stylesheet: keep them from closing the rule. */
function cssValue(value) {
  return String(value).replace(/[;{}<>\\]/g, '')
}

// --- tag pills (SVG) ---------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg'
const PILL = { height: 16, pad: 6, icon: 10, gap: 4, rowGap: 3, maxRow: 200, font: 10 }

/** Where the pill row starts, in the node group's coordinates: under the label, or the shape. */
function pillsTop(group) {
  const label = group.querySelector(':scope > .pvt-node-label-group')
  if (label) {
    const box = label.getBBox()
    // + the CSS translateY given to labels (style.css).
    return Math.round(box.y + box.height + 5 + 3)
  }
  const shape = group.querySelector(':scope > .node')
  const box = shape ? shape.getBBox() : { y: 0, height: 0 }
  return Math.round(box.y + box.height + 4)
}

/** At most `max` pills under a node: beyond that, the first ones and a "+N" pill. */
function visiblePills(pills, max = 4) {
  if (pills.length <= max) return pills
  const shown = pills.slice(0, max - 1)
  const rest = pills.slice(max - 1)
  return [...shown, {
    name: `+${rest.length}`, color: '#8a94a6', fg: '#ffffff', title: rest.map((p) => `#${p.name}`).join(' '),
  }]
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

function drawPillRow(pills, top) {
  const row = svg('g', { class: 'pg-pills' })
  // Build each pill at the origin first, to measure it.
  const items = pills.map((pill) => {
    const g = svg('g', { class: 'pg-pill' })
    const title = svg('title')
    title.textContent = pill.title ?? `#${pill.name}`
    const text = svg('text', {
      class: 'pg-pill-text', 'dominant-baseline': 'central', 'font-size': PILL.font, fill: pill.fg,
    })
    text.textContent = pill.name
    const rect = svg('rect', { height: PILL.height, rx: PILL.height / 2, fill: pill.color })
    g.append(title, rect, text)
    row.append(g)
    const iconMarkup = badgeIconSvg(pill.icon, pill.fg)
    let icon = null
    if (iconMarkup) {
      icon = new DOMParser().parseFromString(iconMarkup, 'image/svg+xml').documentElement
      icon.setAttribute('width', PILL.icon)
      icon.setAttribute('height', PILL.icon)
      g.append(icon)
    }
    return { g, rect, text, icon }
  })
  // Text can only be measured once the row is in the document (the caller
  // appends it): lay out with an estimate now, then again on the next frame.
  const layout = () => {
    const widths = items.map(({ text, icon }) => {
      const textWidth = text.getComputedTextLength() || text.textContent.length * PILL.font * 0.6
      return PILL.pad * 2 + textWidth + (icon ? PILL.icon + 3 : 0)
    })
    // Wrap into centred rows no wider than maxRow.
    const rows = [[]]
    let width = 0
    widths.forEach((w, i) => {
      if (rows.at(-1).length && width + PILL.gap + w > PILL.maxRow) {
        rows.push([])
        width = 0
      }
      width += (rows.at(-1).length ? PILL.gap : 0) + w
      rows.at(-1).push(i)
    })
    rows.forEach((indexes, r) => {
      const total = indexes.reduce((sum, i) => sum + widths[i], 0) + PILL.gap * (indexes.length - 1)
      let x = -total / 2
      const y = top + r * (PILL.height + PILL.rowGap)
      for (const i of indexes) {
        const { rect, text, icon } = items[i]
        rect.setAttribute('x', x)
        rect.setAttribute('y', y)
        rect.setAttribute('width', widths[i])
        let cursor = x + PILL.pad
        if (icon) {
          icon.setAttribute('x', cursor)
          icon.setAttribute('y', y + (PILL.height - PILL.icon) / 2)
          cursor += PILL.icon + 3
        }
        text.setAttribute('x', cursor)
        text.setAttribute('y', y + PILL.height / 2)
        x += widths[i] + PILL.gap
      }
    })
  }
  layout()
  requestAnimationFrame(layout)
  return row
}

/** The button that opens the graph a node points to. */
function graphButton(data, openGraph) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'pg-btn pg-graph-btn'
  button.innerHTML = faIconSvg(faDiagramProject)
  button.append(`Open the graph of ${data.label}`)
  button.addEventListener('click', () => openGraph(data))
  return button
}

/** A Font Awesome icon as SVG markup in the current text colour (for Pivotick menus). */
function faIconSvg({ icon: [width, height, , , path] }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="currentColor" d="${[].concat(path).join(' ')}"/></svg>`
}
