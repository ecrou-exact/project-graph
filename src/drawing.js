// What Pivograph draws itself in Pivotick's zoom layer, so it pans and zooms
// with the graph and appears in the PNG export:
//
// - sections: titled frames behind the graph ("Incident response", "Sensors"…),
//   for the picture only — they hold no nodes;
// - arrows: from / to a node, a section, a note or a free point, each end
//   placed anywhere on its target (`at`), with a label that can be moved
//   (notes are Pivotick's: arrows reach them through hooks.noteBox);
// - the legend: the node and edge types in use, in a box;
// - shapes: rectangles, ellipses, clouds, stars, pictures, icons… with text;
// - strokes: lines drawn by hand with the pen.
//
// Everything connects: an arrow's end can be attached to a node, a section, a
// note, a shape or a stroke (or be a free point). Two modes help draw:
// "connect" (click a thing, then another — or drag from one to the other — to
// draw an arrow between them) and "pen" (drag to draw by hand). Escape leaves
// a mode.
//
// Layers: sections, notes and arrow lines go first in the zoom layer (under
// Pivotick's edges and nodes); arrow labels, handles and the legend go last
// (over everything).
//
// In an editable graph: a section's title band moves it, its corner resizes
// it, a double-click edits it. A click on an arrow selects it: its ends can
// then be dragged onto a node, a section, a note or empty space; its label can
// be dragged; Delete removes it, a double-click edits it. A note moves when
// dragged, its corner sets its width; click + Delete removes it. The legend
// moves when dragged; a double-click edits its title.
import {
  DIRECTIONS, LABEL_FONTS, arrowEndTarget, noteBlocks, resolveArrow, resolveSection, resolveShape, resolveStroke, strokeBox,
} from './model.js'
import { outlinePath, simplify, smoothPath, textBox } from './shapes.js'
import { badgeIconSvg } from './badgeIcons.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML = 'http://www.w3.org/1999/xhtml'
const PAD = 24
const HANDLE = 14
const MIN = { width: 80, height: 60 }
const MARKER = { end: 'pg-draw-arrow-end', start: 'pg-draw-arrow-start' }

export class DrawingLayer {
  /**
   * @param {object} hooks
   * @param {() => object[]} hooks.getSections the document's sections (mutated in place on drag)
   * @param {() => object[]} hooks.getArrows the document's arrows (mutated in place on drag)
   * @param {() => boolean} hooks.editable
   * @param {() => void} hooks.onChange after a section or an arrow was moved or resized
   * @param {(id: string) => void} hooks.onEditSection
   * @param {(id: string) => void} hooks.onEditArrow
   * @param {() => {id: string, x, y, width, height}[]} [hooks.getNotes] Pivotick's notes, as boxes
   * @param {() => object|undefined} [hooks.getLegend] the document's legend (mutated in place on drag)
   * @param {() => {nodes: object[], edges: object[]}} [hooks.legendItems] the types in use
   * @param {() => void} [hooks.onEditLegend]
   * @param {() => object[]} [hooks.getShapes] the document's shapes (mutated in place on drag)
   * @param {() => object[]} [hooks.getStrokes] the document's strokes (mutated in place on drag)
   * @param {(id: string) => void} [hooks.onEditShape]
   * @param {(id: string) => void} [hooks.onEditStroke]
   * @param {(kind: string, id: string) => void} [hooks.onDelete] the selected thing, on Delete
   * @param {(from: object, to: object) => void} [hooks.onConnect] connect mode: draw an arrow between two ends
   * @param {(points: number[][]) => void} [hooks.onStroke] pen mode: a stroke was drawn
   * @param {(mode: string|null) => void} [hooks.onModeChange]
   * @param {(id: string) => {x, y, width, height}|null} hooks.nodeBox a node's box, in graph coordinates
   * @param {(clientX: number, clientY: number) => string|null} hooks.nodeAt the node under a screen point
   */
  constructor(hooks) {
    this.hooks = hooks
    this.zoomLayer = null
    this.back = null // sections, then arrow lines
    this.front = null // arrow labels and handles
    this.selection = null // { kind: 'arrow' | 'note' | 'shape' | 'stroke', id }
    this.frame = null
    this.mode = null // 'connect' | 'pen' | null
    this.pending = null // connect mode: the first end, waiting for the second
    // On the window, before Pivotick's own keys (which take Escape for themselves).
    window.addEventListener('keydown', (event) => {
      if (event.target.closest?.('input, textarea, select, [contenteditable], dialog')) return
      if (event.key === 'Escape' && this.pending) {
        event.preventDefault()
        event.stopPropagation()
        this.cancelPending()
        return
      }
      if (event.key === 'Escape' && this.mode) {
        event.preventDefault()
        this.setMode(null)
        return
      }
      if (!this.hooks.editable() || !['Delete', 'Backspace'].includes(event.key) || !this.selection) return
      event.preventDefault()
      const { kind, id } = this.selection
      this.hooks.onDelete?.(kind, id)
    }, true)
  }

  /** The selected arrow's id (its handles are shown), or null. */
  get selected() {
    return this.selection?.kind === 'arrow' ? this.selection.id : null
  }



  /** Draws into this zoom layer (Pivotick's). */
  attach(zoomLayer) {
    this.zoomLayer = zoomLayer
    this.selection = null
    this.pending = null
    this.back = svg('g', { class: 'pg-drawing-back' })
    this.front = svg('g', { class: 'pg-drawing-front' })
    this.labelGroup = svg('g', { class: 'pg-arrow-labels' })
    this.legendGroup = svg('g', { class: 'pg-legend-layer' })
    this.front.append(this.labelGroup, this.legendGroup)
    if (!zoomLayer) return
    zoomLayer.prepend(this.back)
    zoomLayer.append(this.front)
    // A click on the canvas (not on something of ours) unselects it.
    zoomLayer.ownerSVGElement?.addEventListener('pointerdown', () => this.pick(null))
    this.bindModes(zoomLayer.ownerSVGElement?.parentElement)
    this.render()
  }

  /** Redraws on the next frame (e.g. while a node is dragged). */
  schedule() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.renderArrows()
    })
  }

  render() {
    if (!this.back) return
    // Pivotick may add layers: stay first (sections) and last (labels).
    if (this.zoomLayer.firstChild !== this.back) this.zoomLayer.prepend(this.back)
    if (this.zoomLayer.lastChild !== this.front) this.zoomLayer.append(this.front)
    const editable = this.hooks.editable()
    this.sectionGroup = svg('g', { class: 'pg-sections' })
    this.sectionGroup.append(...this.hooks.getSections().map((section) => this.drawSection(section, editable)))
    this.shapeGroup = svg('g', { class: 'pg-shapes' })
    this.shapeGroup.append(...(this.hooks.getShapes?.() ?? []).map((shape) => this.drawShape(shape, editable)))
    this.strokeGroup = svg('g', { class: 'pg-strokes' })
    this.strokeGroup.append(...(this.hooks.getStrokes?.() ?? []).map((stroke) => this.drawStroke(stroke, editable)))
    this.arrowGroup = svg('g', { class: 'pg-arrows' })
    this.back.replaceChildren(markers(), this.sectionGroup, this.shapeGroup, this.strokeGroup, this.arrowGroup)
    this.renderLegend()
    this.renderArrows()
  }

  /** Selects an arrow (by id), or nothing. */
  select(id) {
    this.pick(id ? { kind: 'arrow', id } : null)
  }

  /** Selects one thing ({ kind, id }) or nothing; Delete removes it. */
  pick(selection) {
    const same = (a, b) => a?.kind === b?.kind && a?.id === b?.id
    if (same(this.selection, selection)) return
    const hadArrow = this.selected
    this.selection = selection
    for (const [kind, group] of [['shape', this.shapeGroup], ['stroke', this.strokeGroup]]) {
      group?.querySelectorAll(':scope > g').forEach((g) => g.classList.toggle('is-selected', selection?.kind === kind && g.dataset.id === selection.id))
    }
    if (hadArrow || this.selected) this.renderArrows()
  }

  // --- shapes ----------------------------------------------------------------------

  drawShape(shape, editable) {
    const a = resolveShape(shape)
    const selected = this.selection?.kind === 'shape' && this.selection.id === shape.id
    const g = svg('g', { class: `pg-shape${selected ? ' is-selected' : ''}`, 'data-id': shape.id, transform: `translate(${a.x},${a.y})` })
    if (a.opacity !== undefined) g.style.opacity = a.opacity
    // The whole box takes the pointer, even where the outline is thin or empty (text, a star's tips).
    const hit = svg('rect', { class: 'pg-shape-hit', width: a.width, height: a.height })
    const body = svg('g', { class: 'pg-shape-body' })
    g.append(hit, body)
    this.paintShape(body, a)
    if (editable) {
      const handle = svg('rect', { class: 'pg-shape-handle', x: a.width - HANDLE / 2, y: a.height - HANDLE / 2, width: HANDLE, height: HANDLE, rx: 3 })
      handle.append(title('Drag to resize'))
      g.append(handle)
      g.append(title(`${a.text ? `${a.text.split('\n')[0]}: ` : ''}drag to move, double-click to edit`))
      this.drag(g, () => ({
        move: (dx, dy) => {
          shape.x = Math.round(a.x + dx)
          shape.y = Math.round(a.y + dy)
          g.setAttribute('transform', `translate(${shape.x},${shape.y})`)
          this.schedule()
        },
        cancel: () => this.pick({ kind: 'shape', id: shape.id }),
      }))
      this.drag(handle, () => ({
        move: (dx, dy) => {
          shape.width = Math.round(Math.max(20, a.width + dx))
          shape.height = Math.round(Math.max(20, a.height + dy))
          body.replaceChildren()
          this.paintShape(body, resolveShape(shape))
          set(hit, { width: shape.width, height: shape.height })
          set(handle, { x: shape.width - HANDLE / 2, y: shape.height - HANDLE / 2 })
          this.schedule()
        },
      }))
      g.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditShape?.(shape.id)
      })
    }
    return g
  }

  /** The shape's outline, picture or icon, and its text. */
  paintShape(body, a) {
    const w = a.width
    const h = a.height
    const stroke = Number(a.borderWidth) > 0 && a.borderColor && a.borderColor !== 'none' ? a.borderColor : 'none'
    const paint = (el) => {
      el.setAttribute('fill', a.fill ?? 'none')
      el.setAttribute('stroke', stroke)
      el.setAttribute('stroke-width', Number(a.borderWidth) || 0)
      if (a.dashed) el.setAttribute('stroke-dasharray', `${(Number(a.borderWidth) || 2) * 3} ${(Number(a.borderWidth) || 2) * 2}`)
      return el
    }
    const bare = a.kind === 'image' || a.kind === 'icon'
    if (a.kind === 'image') {
      if (stroke !== 'none' || (a.fill && a.fill !== 'none')) body.append(paint(svg('rect', { width: w, height: h, rx: 6 })))
      if (a.image) body.append(svg('image', { href: a.image, width: w, height: h, preserveAspectRatio: 'xMidYMid meet' }))
      else body.append(svg('rect', { class: 'pg-shape-placeholder', width: w, height: h, rx: 6 }))
    } else if (a.kind === 'icon') {
      if (stroke !== 'none') {
        const frame = paint(svg('rect', { width: w, height: h, rx: 8 }))
        frame.setAttribute('fill', 'none')
        body.append(frame)
      }
      const markup = badgeIconSvg(a.icon || 'star', a.fill && a.fill !== 'none' ? a.fill : 'currentColor')
      if (markup) {
        const icon = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
        const side = Math.min(w, h) * 0.8
        for (const [k, v] of Object.entries({ x: (w - side) / 2, y: (h - side) / 2, width: side, height: side })) icon.setAttribute(k, v)
        body.append(document.importNode(icon, true))
      }
    } else if (a.kind !== 'text') {
      body.append(paint(svg('path', { class: 'pg-shape-outline', d: outlinePath(a.kind, w, h) })))
    }
    if (!a.text) return
    if (bare) {
      // Under the picture or the icon, as a caption.
      const text = svg('text', { class: 'pg-shape-caption', x: w / 2, y: h + 6, 'text-anchor': 'middle', 'font-size': a.textSize })
      text.style.fill = a.textColor
      if (a.font) text.style.fontFamily = LABEL_FONTS[a.font]?.css ?? a.font
      a.text.split('\n').forEach((line, i) => {
        const span = svg('tspan', { x: w / 2, dy: i === 0 ? '1em' : '1.25em' })
        span.textContent = line
        text.append(span)
      })
      body.append(text)
      return
    }
    const box = textBox(a.kind, w, h)
    const fo = svg('foreignObject', { x: box.x, y: box.y, width: box.width, height: box.height, class: 'pg-shape-fo' })
    const div = html('div', 'pg-shape-text')
    Object.assign(div.style, { color: a.textColor, fontSize: `${a.textSize}px`, width: `${box.width}px`, height: `${box.height}px` })
    if (a.kind === 'text') div.classList.add('is-plain')
    if (a.font) div.style.fontFamily = LABEL_FONTS[a.font]?.css ?? a.font
    for (const block of noteBlocks(a.text)) {
      const line = html('div', `pg-note-${block.kind}`)
      if (block.kind === 'bullet') line.append('• ')
      if (!block.parts.length) line.append(html('br'))
      for (const part of block.parts) {
        const span = html(part.bold ? 'strong' : 'span')
        span.textContent = part.text
        line.append(span)
      }
      div.append(line)
    }
    fo.append(div)
    body.append(fo)
  }

  // --- strokes (drawn by hand) ------------------------------------------------------

  drawStroke(stroke, editable) {
    const a = resolveStroke(stroke)
    const selected = this.selection?.kind === 'stroke' && this.selection.id === stroke.id
    const g = svg('g', { class: `pg-stroke${selected ? ' is-selected' : ''}`, 'data-id': stroke.id })
    if (a.opacity !== undefined) g.style.opacity = a.opacity
    const d = smoothPath(a.points)
    const line = svg('path', { class: 'pg-stroke-line', d })
    Object.assign(line.style, { stroke: a.color, strokeWidth: `${Number(a.width) || 3}px` })
    if (a.dashed) line.style.strokeDasharray = `${(Number(a.width) || 3) * 2.5} ${(Number(a.width) || 3) * 2.5}`
    g.append(line)
    if (editable) {
      const hit = svg('path', { class: 'pg-stroke-hit', d })
      hit.append(title('A drawing: drag to move, double-click to edit, Delete to remove'))
      g.append(hit)
      this.drag(g, () => {
        const from = stroke.points.map((p) => [...p])
        return {
          move: (dx, dy) => {
            stroke.points = from.map(([x, y]) => [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10])
            g.setAttribute('transform', `translate(${dx},${dy})`)
            this.schedule()
          },
          cancel: () => this.pick({ kind: 'stroke', id: stroke.id }),
        }
      })
      g.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditStroke?.(stroke.id)
      })
    }
    return g
  }

  // --- modes: connect, pen ----------------------------------------------------------

  /** 'connect', 'pen' or null (select / move). */
  setMode(mode) {
    if (!this.hooks.editable()) mode = null
    this.cancelPending()
    this.mode = mode
    this.root?.classList.toggle('pg-mode-connect', mode === 'connect')
    this.root?.classList.toggle('pg-mode-pen', mode === 'pen')
    this.hooks.onModeChange?.(mode)
  }

  /**
   * In a mode, gestures on the canvas are ours: they are caught on their way
   * down (capture), before Pivotick pans the view or drags a node.
   */
  bindModes(root) {
    this.root = root
    if (!root) return
    root.classList.toggle('pg-mode-connect', this.mode === 'connect')
    root.classList.toggle('pg-mode-pen', this.mode === 'pen')
    const ours = (event) => this.mode && event.button === 0 && event.target instanceof Element
      && event.target.closest('svg') && !event.target.closest('.pvt-toolbar, .pvt-sidebar, button, a, input')
    for (const type of ['mousedown', 'touchstart', 'click', 'dblclick']) {
      root.addEventListener(type, (event) => {
        if (this.mode && event.target instanceof Element && event.target.closest('svg')) event.stopPropagation()
      }, true)
    }
    root.addEventListener('pointerdown', (event) => {
      if (!ours(event)) return
      event.stopPropagation()
      event.preventDefault()
      if (this.mode === 'pen') this.startStroke(event)
      else this.connectAt(event)
    }, true)
  }

  startStroke(event) {
    const scale = this.zoomLayer.getScreenCTM()?.a || 1
    const p = this.toGraph(event.clientX, event.clientY)
    const points = [[p.x, p.y]]
    const preview = svg('path', { class: 'pg-stroke-line pg-stroke-preview' })
    const { color, width } = { ...resolveStroke({}), ...this.penStyle }
    Object.assign(preview.style, { stroke: color, strokeWidth: `${width}px` })
    this.labelGroup.append(preview)
    const move = (e) => {
      const q = this.toGraph(e.clientX, e.clientY)
      const last = points.at(-1)
      if (Math.hypot(q.x - last[0], q.y - last[1]) * scale < 2) return
      points.push([q.x, q.y])
      preview.setAttribute('d', smoothPath(points))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      preview.remove()
      const simple = simplify(points, 1.2 / scale)
      if (simple.length >= 2) this.hooks.onStroke?.(simple.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /**
   * Connect mode: the first click picks where the arrow starts, the second
   * where it ends — or press on a thing and release on another.
   */
  connectAt(event) {
    const end = this.connectEnd(event.clientX, event.clientY)
    if (this.pending) return this.finishConnect(end)
    const start = this.toGraph(event.clientX, event.clientY)
    const line = svg('line', { class: 'pg-connect-preview', x1: start.x, y1: start.y, x2: start.x, y2: start.y })
    this.labelGroup.append(line)
    const from = this.boxOf(end)
    if (from) this.labelGroup.append(svg('rect', { class: 'pg-connect-from', x: from.x - 4, y: from.y - 4, width: from.width + 8, height: from.height + 8, rx: 6 }))
    const move = (e) => {
      const p = this.toGraph(e.clientX, e.clientY)
      set(line, { x2: p.x, y2: p.y })
    }
    const up = (e) => {
      window.removeEventListener('pointerup', up)
      // Pressed on one thing and released on another: done.
      if (Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) > 12 && this.pending) {
        this.finishConnect(this.connectEnd(e.clientX, e.clientY))
      }
    }
    this.pending = { end, line, move }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    this.hooks.onModeChange?.(this.mode)
  }

  finishConnect(to) {
    const from = this.pending.end
    this.cancelPending()
    const a = arrowEndTarget(from)
    const b = arrowEndTarget(to)
    if (a && b && a.kind === b.kind && a.id === b.id) return // the same thing twice
    if (!a && !b && Math.hypot(from.x - to.x, from.y - to.y) < 4) return
    this.hooks.onConnect?.(from, to)
  }

  cancelPending() {
    if (!this.pending) return
    window.removeEventListener('pointermove', this.pending.move)
    this.labelGroup?.querySelectorAll('.pg-connect-preview, .pg-connect-from').forEach((el) => el.remove())
    this.pending = null
    this.hooks.onModeChange?.(this.mode)
  }

  /** What a click connects to: a thing (its border facing the other end, so it follows when moved), or a point. */
  connectEnd(clientX, clientY) {
    const end = this.dropTarget(clientX, clientY)
    const target = arrowEndTarget(end)
    return target ? { [target.kind]: target.id } : end
  }

  // --- legend ----------------------------------------------------------------------

  renderLegend() {
    if (!this.legendGroup) return
    const legend = this.hooks.getLegend?.()
    const items = legend && !legend.hidden ? this.hooks.legendItems?.() : null
    if (!items || (!items.nodes.length && !items.edges.length)) return this.legendGroup.replaceChildren()
    const g = svg('g', { class: 'pg-legend', transform: `translate(${legend.x},${legend.y})` })
    const fo = svg('foreignObject', { width: 1, height: 1, class: 'pg-note-fo' })
    const box = html('div', 'pg-legend-box')
    if (legend.title !== '') {
      const heading = html('div', 'pg-legend-title')
      heading.textContent = legend.title ?? 'Legend'
      box.append(heading)
    }
    for (const item of items.nodes) box.append(legendRow(nodeSwatch(item), item.label))
    for (const item of items.edges) box.append(legendRow(edgeSwatch(item), item.label))
    fo.append(box)
    g.append(fo)
    this.legendGroup.replaceChildren(g)
    const measure = (tries) => {
      if (box.offsetWidth) set(fo, { width: Math.ceil(box.offsetWidth), height: Math.ceil(box.offsetHeight) })
      else if (tries > 0 && box.isConnected) requestAnimationFrame(() => measure(tries - 1))
    }
    measure(10)
    if (this.hooks.editable()) {
      g.classList.add('is-movable')
      g.append(title('Legend: drag to move, double-click to edit'))
      this.drag(g, () => ({
        move: (dx, dy) => g.setAttribute('transform', `translate(${Math.round(legend.x + dx)},${Math.round(legend.y + dy)})`),
        end: () => {
          const [, x, y] = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform')) ?? []
          if (x !== undefined) Object.assign(legend, { x: Number(x), y: Number(y) })
        },
      }))
      g.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditLegend?.()
      })
    }
  }

  // --- sections ------------------------------------------------------------------

  drawSection(section, editable) {
    const s = resolveSection(section)
    const g = svg('g', { class: 'pg-section', 'data-id': section.id, transform: `translate(${s.x},${s.y})` })
    const box = svg('rect', { class: 'pg-section-box', rx: 16, width: s.width, height: s.height })
    if (s.fill) box.style.fill = s.fill
    if (s.borderColor) box.style.stroke = s.borderColor
    g.append(box)

    const band = s.titleSize + PAD * 1.5
    if (s.title) {
      const text = svg('text', { class: 'pg-section-title', x: PAD, y: PAD + s.titleSize * 0.85, 'font-size': s.titleSize })
      text.textContent = s.title
      if (s.color) text.style.fill = s.color
      if (s.titleFont) text.style.fontFamily = LABEL_FONTS[s.titleFont]?.css ?? s.titleFont
      g.append(text)
      // Underlined when it has a colour, unless told otherwise.
      if (s.underline ?? Boolean(s.color)) {
        const y = PAD + s.titleSize + 10
        const line = svg('line', { class: 'pg-section-underline', x1: PAD, x2: Math.max(PAD, s.width - PAD), y1: y, y2: y })
        if (s.color) line.style.stroke = s.color
        g.append(line)
      }
    }

    if (editable) {
      const grip = svg('rect', { class: 'pg-section-grip', width: s.width, height: Math.min(band, s.height) })
      grip.append(title(`${s.title || 'Section'}: drag to move, double-click to edit`))
      const handle = svg('rect', {
        class: 'pg-section-handle', x: s.width - HANDLE, y: s.height - HANDLE, width: HANDLE, height: HANDLE, rx: 3,
      })
      handle.append(title('Drag to resize'))
      g.append(grip, handle)
      this.bindSectionDrag(grip, section, g, 'move')
      this.bindSectionDrag(handle, section, g, 'resize')
      grip.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditSection(section.id)
      })
    }
    return g
  }

  /** Moves or resizes a section with the pointer, in graph coordinates. */
  bindSectionDrag(target, section, g, mode) {
    this.drag(target, (start) => {
      const from = resolveSection(section)
      g.classList.add('is-dragging')
      return {
        move: (dx, dy) => {
          if (mode === 'move') {
            section.x = Math.round(from.x + dx)
            section.y = Math.round(from.y + dy)
            g.setAttribute('transform', `translate(${section.x},${section.y})`)
          } else {
            section.width = Math.round(Math.max(MIN.width, from.width + dx))
            section.height = Math.round(Math.max(MIN.height, from.height + dy))
            // Resize in place: the handle being dragged must stay in the document.
            const { width, height } = section
            set(g.querySelector('.pg-section-box'), { width, height })
            set(g.querySelector('.pg-section-underline'), { x2: Math.max(PAD, width - PAD) })
            set(g.querySelector('.pg-section-grip'), { width })
            set(g.querySelector('.pg-section-handle'), { x: width - HANDLE, y: height - HANDLE })
          }
          // Arrows attached to the section follow it.
          this.renderArrows()
        },
        end: () => g.classList.remove('is-dragging'),
      }
    })
  }

  // --- arrows --------------------------------------------------------------------------

  renderArrows() {
    if (!this.arrowGroup) return
    const editable = this.hooks.editable()
    const lines = []
    const labels = []
    for (const arrow of this.hooks.getArrows()) {
      const geometry = this.arrowGeometry(arrow)
      if (!geometry) continue
      const a = resolveArrow(arrow)
      lines.push(this.drawArrowLine(arrow, a, geometry, editable))
      const label = this.drawArrowLabel(arrow, a, geometry, editable)
      if (label) labels.push(label)
    }
    this.arrowGroup.replaceChildren(...lines)
    const handles = editable ? this.drawHandles() : []
    this.labelGroup.replaceChildren(...labels, ...handles)
    // Label backgrounds are sized from the text, once it is in the document.
    for (const label of labels) fitLabel(label)
  }

  /** Where the arrow's ends are and the path between them; null when an end is gone. */
  arrowGeometry(arrow) {
    const ends = [arrow.from, arrow.to].map((end) => ({ end, box: this.boxOf(end) }))
    if (ends.some(({ end, box }) => !box && !isPoint(end))) return null
    const ref = ends.map(({ end, box }) => (box ? center(box) : { x: end.x, y: end.y }))
    // Free points, placed ends and sections first; then nodes aim at them.
    const points = [null, null]
    ends.forEach(({ end, box }, i) => {
      if (!box) points[i] = { x: end.x, y: end.y }
      else if (end.at) points[i] = { x: box.x + end.at[0] * box.width, y: box.y + end.at[1] * box.height }
      else if (end.shape !== undefined) points[i] = shapeBorder(this.shapeKind(end.shape), box, ref[1 - i])
      else if (end.node === undefined) points[i] = facing(box, ref[1 - i])
    })
    ends.forEach(({ box }, i) => {
      if (!points[i]) points[i] = border(box, points[1 - i] ?? ref[1 - i])
    })
    const a = resolveArrow(arrow)
    if (a.route === 'curved') {
      // A quadratic curve bowing to the left of the way it goes, by a fifth of its length.
      const [p, q] = points
      const control = { x: (p.x + q.x) / 2 - (q.y - p.y) * 0.2, y: (p.y + q.y) / 2 + (q.x - p.x) * 0.2 }
      const mid = { x: 0.25 * p.x + 0.5 * control.x + 0.25 * q.x, y: 0.25 * p.y + 0.5 * control.y + 0.25 * q.y }
      return { points, route: [p, q], control, mid }
    }
    const route = a.route === 'elbow' ? elbow(points[0], points[1], ends[0].box) : [points[0], points[1]]
    return { points, route, mid: middle(route) }
  }

  shapeKind(id) {
    return (this.hooks.getShapes?.() ?? []).find((s) => s.id === id)?.kind
  }

  boxOf(end) {
    if (end.node !== undefined) return this.hooks.nodeBox(end.node)
    if (end.section !== undefined) {
      const section = this.hooks.getSections().find((s) => s.id === end.section)
      if (!section) return null
      const s = resolveSection(section)
      return { x: s.x, y: s.y, width: s.width, height: s.height }
    }
    if (end.note !== undefined) return (this.hooks.getNotes?.() ?? []).find((n) => n.id === end.note) ?? null
    if (end.shape !== undefined) {
      const shape = (this.hooks.getShapes?.() ?? []).find((s) => s.id === end.shape)
      if (!shape) return null
      const a = resolveShape(shape)
      return { x: a.x, y: a.y, width: a.width, height: a.height }
    }
    if (end.stroke !== undefined) {
      const stroke = (this.hooks.getStrokes?.() ?? []).find((s) => s.id === end.stroke)
      return stroke ? strokeBox(stroke) : null
    }
    return null
  }

  drawArrowLine(arrow, a, geometry, editable) {
    const g = svg('g', { class: `pg-arrow${this.selected === arrow.id ? ' is-selected' : ''}`, 'data-id': arrow.id })
    const xy = (p) => `${round(p.x)},${round(p.y)}`
    const d = geometry.control
      ? `M${xy(geometry.route[0])}Q${xy(geometry.control)} ${xy(geometry.route[1])}`
      : `M${geometry.route.map(xy).join('L')}`
    const direction = DIRECTIONS[a.direction] ? a.direction : 'forward'
    const line = svg('path', { class: 'pg-arrow-line', d })
    Object.assign(line.style, { stroke: a.color, strokeWidth: `${Number(a.width) || 2}px` })
    if (a.dashed) line.style.strokeDasharray = `${(Number(a.width) || 2) * 3} ${(Number(a.width) || 2) * 3}`
    if (direction === 'forward' || direction === 'both') line.setAttribute('marker-end', `url(#${MARKER.end})`)
    if (direction === 'backward' || direction === 'both') line.setAttribute('marker-start', `url(#${MARKER.start})`)
    g.append(line)
    if (editable) {
      const hit = svg('path', { class: 'pg-arrow-hit', d })
      hit.append(title(`${a.label ? `${a.label.replace(/\n/g, ' ')}: ` : ''}click to select, double-click to edit`))
      stopPivotick(hit)
      hit.addEventListener('pointerdown', (event) => {
        event.stopPropagation()
        this.select(arrow.id)
      })
      hit.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditArrow(arrow.id)
      })
      g.append(hit)
    } else if (a.description) {
      line.append(title(a.description))
    }
    return g
  }

  drawArrowLabel(arrow, a, geometry, editable) {
    if (!a.label) return null
    const [dx, dy] = a.labelOffset ?? [0, 0]
    const g = svg('g', {
      class: `pg-arrow-label${editable ? ' is-movable' : ''}`,
      transform: `translate(${round(geometry.mid.x + dx)},${round(geometry.mid.y + dy)})`,
      'data-id': arrow.id,
    })
    const size = Number(a.labelSize) || 14
    const bg = svg('rect', { class: 'pg-arrow-label-bg', rx: 4 })
    if (a.labelBackground) bg.style.fill = a.labelBackground
    const text = svg('text', { class: 'pg-arrow-label-text', 'text-anchor': 'middle', 'font-size': size })
    text.style.fill = a.labelColor ?? a.color
    if (a.labelFont) text.style.fontFamily = LABEL_FONTS[a.labelFont]?.css ?? a.labelFont
    const lines = String(a.label).split('\n')
    lines.forEach((line, i) => {
      const span = svg('tspan', { x: 0, dy: i === 0 ? `${(-(lines.length - 1) / 2) * 1.25 + 0.35}em` : '1.25em' })
      span.textContent = line
      text.append(span)
    })
    g.append(bg, text)
    if (a.description) g.append(title(a.description))
    if (editable) {
      this.drag(g, () => {
        this.select(arrow.id)
        const from = a.labelOffset ?? [0, 0]
        return {
          move: (mx, my) => {
            arrow.labelOffset = [Math.round(from[0] + mx), Math.round(from[1] + my)]
            this.schedule()
          },
        }
      })
      g.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditArrow(arrow.id)
      })
    }
    return g
  }

  /** The selected arrow's end handles. */
  drawHandles() {
    const arrow = this.hooks.getArrows().find((a) => a.id === this.selected)
    const geometry = arrow && this.arrowGeometry(arrow)
    if (!geometry) return []
    return ['from', 'to'].map((key, i) => {
      const p = geometry.points[i]
      const handle = svg('circle', { class: 'pg-arrow-handle', cx: round(p.x), cy: round(p.y), r: 7 })
      handle.append(title('Drag onto a node, a section, a note, a shape, a drawing or empty space'))
      this.drag(handle, () => ({
        move: (_dx, _dy, event) => {
          // While dragging, the end follows the pointer.
          arrow[key] = this.toGraph(event.clientX, event.clientY)
          this.schedule()
        },
        end: (event) => {
          arrow[key] = this.dropTarget(event.clientX, event.clientY)
          this.renderArrows()
        },
      }))
      return handle
    })
  }

  /** What is under the pointer: a node, a note or a section (the end placed where it was dropped, on the border), or a free point. */
  dropTarget(clientX, clientY) {
    const p = this.toGraph(clientX, clientY)
    const nodeId = this.hooks.nodeAt(clientX, clientY)
    const box = nodeId !== null ? this.hooks.nodeBox(nodeId) : null
    if (box) return { node: nodeId, at: onBorder(box, p) }
    const inside = (b) => b && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
    // Topmost first: notes, then drawings and shapes (the last drawn is on top), then sections.
    for (const note of [...(this.hooks.getNotes?.() ?? [])].reverse()) {
      if (inside(note)) return { note: note.id, at: onBorder(note, p) }
    }
    for (const kind of ['stroke', 'shape']) {
      const list = kind === 'stroke' ? this.hooks.getStrokes?.() : this.hooks.getShapes?.()
      for (const item of [...(list ?? [])].reverse()) {
        const box = this.boxOf({ [kind]: item.id })
        if (inside(kind === 'stroke' ? grow(box, 6) : box)) return { [kind]: item.id, at: onBorder(box, p) }
      }
    }
    const sections = this.hooks.getSections()
      .map((section) => ({ section, s: resolveSection(section) }))
      .filter(({ s }) => p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height)
      .sort((a, b) => a.s.width * a.s.height - b.s.width * b.s.height)
    if (sections.length) {
      const { section, s } = sections[0]
      return { section: section.id, at: onBorder({ x: s.x, y: s.y, width: s.width, height: s.height }, p) }
    }
    return { x: Math.round(p.x), y: Math.round(p.y) }
  }

  // --- shared ---------------------------------------------------------------------------

  /**
   * A pointer drag in graph coordinates. `begin(event)` returns { move(dx, dy, event), end?(event) };
   * hooks.onChange runs after a drag that moved something.
   */
  drag(target, begin) {
    stopPivotick(target)
    target.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      const scale = this.zoomLayer.getScreenCTM()?.a || 1
      const start = { x: event.clientX, y: event.clientY }
      const gesture = begin(event)
      let moved = false
      const move = (e) => {
        const dx = (e.clientX - start.x) / scale
        const dy = (e.clientY - start.y) / scale
        moved ||= Math.abs(dx) + Math.abs(dy) > 0
        if (moved) gesture.move(dx, dy, e)
      }
      const up = (e) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (moved) gesture.end?.(e)
        else gesture.cancel?.()
        if (moved) {
          this.render()
          this.hooks.onChange()
        }
      }
      // On the window, not the target: the target may be redrawn during the drag.
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    })
  }

  /** A screen point in graph coordinates. */
  toGraph(clientX, clientY) {
    const ctm = this.zoomLayer?.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  /** The middle of what is on screen, in graph coordinates (where new things go). */
  viewCenter() {
    const rect = this.zoomLayer?.ownerSVGElement?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return this.toGraph(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }
}

// --- geometry ------------------------------------------------------------------------------

function grow(box, by) {
  return box && { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by }
}

function isPoint(end) {
  return Number.isFinite(end?.x) && Number.isFinite(end?.y)
}

function center(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Where an arrow towards `target` leaves a big box (a section): straight up or
 * down when the target is above or below it, sideways when it is beside it.
 */
function facing(box, target) {
  const inX = target.x >= box.x && target.x <= box.x + box.width
  const inY = target.y >= box.y && target.y <= box.y + box.height
  if (inX && !inY) return { x: target.x, y: target.y < box.y ? box.y : box.y + box.height }
  if (inY && !inX) return { x: target.x < box.x ? box.x : box.x + box.width, y: target.y }
  return border(box, target)
}

/**
 * Where the line from a shape's centre to `target` meets its outline: on the
 * ellipse of round shapes (ellipse, cloud, star), on the rhombus of a diamond,
 * on the box otherwise.
 */
function shapeBorder(kind, box, target) {
  const c = center(box)
  const dx = target.x - c.x
  const dy = target.y - c.y
  if (!dx && !dy) return c
  const rx = box.width / 2
  const ry = box.height / 2
  let t
  if (kind === 'ellipse' || kind === 'cloud' || kind === 'star') t = 1 / Math.hypot(dx / rx, dy / ry)
  else if (kind === 'diamond') t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)
  else return border(box, target)
  // Stars and clouds: a little inside the ellipse, where the outline mostly is.
  if (kind !== 'ellipse' && kind !== 'diamond') t *= kind === 'star' ? 0.75 : 0.95
  return { x: c.x + dx * Math.min(t, 1), y: c.y + dy * Math.min(t, 1) }
}

/** Where the line from the box's centre to `target` crosses the box's border. */
function border(box, target) {
  const c = center(box)
  const dx = target.x - c.x
  const dy = target.y - c.y
  if (!dx && !dy) return c
  const scale = Math.min(dx ? box.width / 2 / Math.abs(dx) : Infinity, dy ? box.height / 2 / Math.abs(dy) : Infinity)
  return { x: c.x + dx * Math.min(scale, 1), y: c.y + dy * Math.min(scale, 1) }
}

/** The point's place on the box ([0..1, 0..1]), moved onto the nearest side. */
function onBorder(box, p) {
  const u = clamp01((p.x - box.x) / box.width)
  const v = clamp01((p.y - box.y) / box.height)
  const distances = [u * box.width, (1 - u) * box.width, v * box.height, (1 - v) * box.height]
  const side = distances.indexOf(Math.min(...distances))
  const at = side === 0 ? [0, v] : side === 1 ? [1, v] : side === 2 ? [u, 0] : [u, 1]
  return at.map((n) => Math.round(n * 1000) / 1000)
}

/** Right-angled route: leaves vertically from a top / bottom side, horizontally otherwise. */
function elbow(a, b, boxA) {
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return [a, b]
  const vertical = boxA
    ? Math.abs(a.y - boxA.y) < 1 || Math.abs(a.y - (boxA.y + boxA.height)) < 1
    : Math.abs(b.y - a.y) > Math.abs(b.x - a.x)
  if (vertical) {
    const y = (a.y + b.y) / 2
    return [a, { x: a.x, y }, { x: b.x, y }, b]
  }
  const x = (a.x + b.x) / 2
  return [a, { x, y: a.y }, { x, y: b.y }, b]
}

/** Halfway along a route. */
function middle(route) {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p.x - route[i].x, p.y - route[i].y))
  let half = lengths.reduce((sum, l) => sum + l, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (half <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? half / lengths[i] : 0
      return { x: route[i].x + (route[i + 1].x - route[i].x) * t, y: route[i].y + (route[i + 1].y - route[i].y) * t }
    }
    half -= lengths[i]
  }
  return route[0]
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5))
}

function round(n) {
  return Math.round(n * 10) / 10
}

// --- svg helpers ---------------------------------------------------------------------------

function markers() {
  const defs = svg('defs')
  for (const [key, id] of Object.entries(MARKER)) {
    const marker = svg('marker', {
      id, viewBox: '0 -5 10 10', refX: 8, refY: 0, markerWidth: 9, markerHeight: 9,
      orient: key === 'end' ? 'auto' : 'auto-start-reverse',
    })
    marker.append(svg('path', { d: 'M0,-5L10,0L0,5', fill: 'context-stroke' }))
    defs.append(marker)
  }
  return defs
}

/** A label's background, fitted to its text. */
function fitLabel(g) {
  const text = g.querySelector('text')
  const bg = g.querySelector('rect')
  const box = text.getBBox()
  if (!box.width) return
  set(bg, { x: box.x - 6, y: box.y - 3, width: box.width + 12, height: box.height + 6 })
}

/** Keeps Pivotick (d3-zoom, selection box) from seeing a gesture on our elements. */
function stopPivotick(el) {
  for (const type of ['mousedown', 'touchstart', 'click', 'dblclick']) el.addEventListener(type, (e) => e.stopPropagation())
}

/** An HTML element, for the text drawn inside a <foreignObject>. */
function html(tag, className) {
  const el = document.createElementNS(XHTML, tag)
  if (className) el.className = className
  return el
}

function legendRow(swatch, label) {
  const row = html('div', 'pg-legend-row')
  const text = html('span')
  text.textContent = label
  row.append(swatch, text)
  return row
}

/** A node type's look, small: its shape in its colour (or its image). */
function nodeSwatch(item) {
  const box = svg('svg', { width: 22, height: 18, viewBox: '-11 -9 22 18', class: 'pg-legend-swatch' })
  const paint = { fill: item.color, stroke: item.borderColor ?? 'none', 'stroke-width': item.borderColor ? 1.5 : 0 }
  const shapes = {
    square: () => svg('rect', { x: -7, y: -7, width: 14, height: 14, rx: 2, ...paint }),
    triangle: () => svg('polygon', { points: '0,-8 8,6 -8,6', ...paint }),
    hexagon: () => svg('polygon', { points: '-4,-7 4,-7 8,0 4,7 -4,7 -8,0', ...paint }),
    diamond: () => svg('polygon', { points: '0,-8 10,0 0,8 -10,0', ...paint }),
    parallelogram: () => svg('polygon', { points: '-6,-6 10,-6 6,6 -10,6', ...paint }),
    pill: () => svg('rect', { x: -10, y: -6, width: 20, height: 12, rx: 6, ...paint }),
    ellipse: () => svg('ellipse', { rx: 10, ry: 7, ...paint }),
    card: () => svg('rect', { x: -10, y: -7, width: 20, height: 14, rx: 3, ...paint }),
    document: () => svg('rect', { x: -9, y: -7, width: 18, height: 14, rx: 1, ...paint }),
    cylinder: () => svg('rect', { x: -8, y: -8, width: 16, height: 16, rx: 4, ...paint }),
  }
  box.append((shapes[item.shape] ?? (() => svg('circle', { r: 7, ...paint })))())
  if (item.image) {
    const img = svg('image', { href: item.image, x: -6, y: -6, width: 12, height: 12, preserveAspectRatio: 'xMidYMid meet' })
    box.append(img)
  }
  return box
}

/** An edge type's look, small: its line, dashed or not, with its arrow. */
function edgeSwatch(item) {
  const box = svg('svg', { width: 30, height: 14, viewBox: '0 -7 30 14', class: 'pg-legend-swatch' })
  const line = svg('line', { x1: 2, x2: 26, y1: 0, y2: 0, stroke: item.color, 'stroke-width': Math.min(Number(item.width) || 2, 4) })
  if (item.dashed) line.setAttribute('stroke-dasharray', '4 3')
  box.append(line)
  if (item.direction === 'forward' || item.direction === 'both') box.append(svg('path', { d: 'M22,-4L29,0L22,4Z', fill: item.color }))
  if (item.direction === 'backward' || item.direction === 'both') box.append(svg('path', { d: 'M8,-4L1,0L8,4Z', fill: item.color }))
  return box
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  return el
}

function set(el, attrs) {
  if (el) for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
}

function title(text) {
  const el = svg('title')
  el.textContent = text
  return el
}
