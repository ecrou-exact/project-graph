// What Pivograph draws itself in Pivotick's zoom layer, so it pans and zooms
// with the graph and appears in the PNG export:
//
// - sections: titled frames behind the graph ("Incident response", "Sensors"…),
//   for the picture only — they hold no nodes;
// - arrows: from / to a node, a section, a note or a free point, each end
//   placed anywhere on its target (`at`), with a label that can be moved;
// - notes: free text, as a sticky note or bare (a heading, a comment);
// - the legend: the node and edge types in use, in a box.
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
import { DIRECTIONS, LABEL_FONTS, noteBlocks, resolveArrow, resolveNote, resolveSection } from './model.js'

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
   * @param {(id: string) => void} hooks.onDeleteArrow
   * @param {() => object[]} [hooks.getNotes] the document's notes (mutated in place on drag)
   * @param {(id: string) => void} [hooks.onEditNote]
   * @param {(id: string) => void} [hooks.onDeleteNote]
   * @param {() => object|undefined} [hooks.getLegend] the document's legend (mutated in place on drag)
   * @param {() => {nodes: object[], edges: object[]}} [hooks.legendItems] the types in use
   * @param {() => void} [hooks.onEditLegend]
   * @param {(id: string) => {x, y, width, height}|null} hooks.nodeBox a node's box, in graph coordinates
   * @param {(clientX: number, clientY: number) => string|null} hooks.nodeAt the node under a screen point
   */
  constructor(hooks) {
    this.hooks = hooks
    this.zoomLayer = null
    this.back = null // sections, then arrow lines
    this.front = null // arrow labels and handles
    this.selected = null // selected arrow id
    this.selectedNote = null
    this.noteBoxes = new Map() // note id -> its box as drawn, in graph coordinates
    this.frame = null
    document.addEventListener('keydown', (event) => {
      if (!this.hooks.editable() || !['Delete', 'Backspace'].includes(event.key)) return
      if (!this.selected && !this.selectedNote) return
      if (event.target.closest?.('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      if (this.selected) this.hooks.onDeleteArrow(this.selected)
      else this.hooks.onDeleteNote?.(this.selectedNote)
    })
  }

  /** Draws into this zoom layer (Pivotick's). */
  attach(zoomLayer) {
    this.zoomLayer = zoomLayer
    this.selected = null
    this.selectedNote = null
    this.back = svg('g', { class: 'pg-drawing-back' })
    this.front = svg('g', { class: 'pg-drawing-front' })
    this.labelGroup = svg('g', { class: 'pg-arrow-labels' })
    this.legendGroup = svg('g', { class: 'pg-legend-layer' })
    this.front.append(this.labelGroup, this.legendGroup)
    if (!zoomLayer) return
    zoomLayer.prepend(this.back)
    zoomLayer.append(this.front)
    // A click on the canvas (not on an arrow or a note) unselects them.
    zoomLayer.ownerSVGElement?.addEventListener('pointerdown', () => {
      this.select(null)
      this.selectNote(null)
    })
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
    this.noteGroup = svg('g', { class: 'pg-notes' })
    this.arrowGroup = svg('g', { class: 'pg-arrows' })
    this.back.replaceChildren(markers(), this.sectionGroup, this.noteGroup, this.arrowGroup)
    this.renderNotes()
    this.renderLegend()
    this.renderArrows()
  }

  select(id) {
    if (this.selected === id) return
    this.selected = id
    if (id) this.selectNote(null)
    this.renderArrows()
  }

  selectNote(id) {
    if (this.selectedNote === id) return
    this.selectedNote = id
    if (id) this.select(null)
    this.noteGroup?.querySelectorAll('.pg-note').forEach((g) => g.classList.toggle('is-selected', g.dataset.id === id))
  }

  // --- notes ---------------------------------------------------------------------

  renderNotes() {
    if (!this.noteGroup) return
    const editable = this.hooks.editable()
    const notes = this.hooks.getNotes?.() ?? []
    this.noteGroup.replaceChildren(...notes.map((note) => this.drawNote(note, editable)))
    // Sized from the text, once it is in the document.
    this.noteBoxes.clear()
    this.fitNotes()
  }

  /** Measures every note; those not laid out yet (canvas still hidden) are tried again next frame. */
  fitNotes(tries = 10) {
    const missed = [...this.noteGroup.children].filter((g) => !this.fitNote(g))
    if (missed.length && tries > 0) {
      requestAnimationFrame(() => {
        if (missed.some((g) => g.isConnected)) this.fitNotes(tries - 1)
        this.renderArrows()
      })
    }
  }

  drawNote(note, editable) {
    const n = resolveNote(note)
    const g = svg('g', { class: `pg-note${this.selectedNote === note.id ? ' is-selected' : ''}`, 'data-id': note.id, transform: `translate(${n.x},${n.y})` })
    // 1 × 1 until measured (fitNote): a big box would count in the graph's frame.
    const fo = svg('foreignObject', { width: 1, height: 1, class: 'pg-note-fo' })
    const box = html('div', `pg-note-box${n.fill === 'none' ? ' is-bare' : ''}`)
    Object.assign(box.style, {
      color: n.color,
      fontSize: `${n.textSize}px`,
      textAlign: n.align,
      width: n.width ? `${n.width}px` : 'max-content',
    })
    if (n.fill !== 'none') box.style.backgroundColor = n.fill
    if (n.borderColor && n.borderColor !== 'none') box.style.border = `1.5px solid ${n.borderColor}`
    if (n.font) box.style.fontFamily = LABEL_FONTS[n.font]?.css ?? n.font
    for (const block of noteBlocks(n.text)) {
      const line = html('div', `pg-note-${block.kind}`)
      // The bullet as text, not CSS ::before: the picture export copies no pseudo-elements.
      if (block.kind === 'bullet') line.append('• ')
      if (!block.parts.length) line.append(html('br'))
      for (const part of block.parts) {
        const span = html(part.bold ? 'strong' : 'span')
        span.textContent = part.text
        line.append(span)
      }
      box.append(line)
    }
    fo.append(box)
    g.append(fo)
    if (editable) {
      const handle = svg('rect', { class: 'pg-note-handle', width: HANDLE, height: HANDLE, rx: 3 })
      handle.append(title('Drag to set the width'))
      g.append(handle)
      this.drag(g, () => ({
        move: (dx, dy) => {
          note.x = Math.round(n.x + dx)
          note.y = Math.round(n.y + dy)
          g.setAttribute('transform', `translate(${note.x},${note.y})`)
          this.noteBoxes.set(note.id, { ...this.noteBoxes.get(note.id), x: note.x, y: note.y })
          this.schedule()
        },
        cancel: () => this.selectNote(note.id),
      }))
      this.drag(handle, () => {
        const from = this.noteBoxes.get(note.id)?.width ?? 200
        return {
          move: (dx) => {
            note.width = Math.round(Math.max(60, from + dx))
            box.style.width = `${note.width}px`
            this.fitNote(g)
            this.schedule()
          },
        }
      })
      g.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.hooks.onEditNote?.(note.id)
      })
    }
    return g
  }

  /** The foreignObject takes the size of the text box; the handle goes to its corner. */
  fitNote(g) {
    const box = g.querySelector('.pg-note-box')
    const fo = g.querySelector('foreignObject')
    const width = Math.ceil(box.offsetWidth)
    const height = Math.ceil(box.offsetHeight)
    if (!width || !height) return false
    set(fo, { width, height })
    set(g.querySelector('.pg-note-handle'), { x: width - HANDLE / 2, y: height - HANDLE / 2 })
    const note = (this.hooks.getNotes?.() ?? []).find((n) => n.id === g.dataset.id)
    if (note) this.noteBoxes.set(note.id, { x: note.x, y: note.y, width, height })
    return true
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
      else if (end.section !== undefined || end.note !== undefined) points[i] = facing(box, ref[1 - i])
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

  boxOf(end) {
    if (end.node !== undefined) return this.hooks.nodeBox(end.node)
    if (end.section !== undefined) {
      const section = this.hooks.getSections().find((s) => s.id === end.section)
      if (!section) return null
      const s = resolveSection(section)
      return { x: s.x, y: s.y, width: s.width, height: s.height }
    }
    if (end.note !== undefined) return this.noteBoxes.get(end.note) ?? null
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
      handle.append(title('Drag onto a node, a section, a note or empty space'))
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
    for (const [id, note] of this.noteBoxes) {
      if (p.x >= note.x && p.x <= note.x + note.width && p.y >= note.y && p.y <= note.y + note.height) return { note: id, at: onBorder(note, p) }
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
