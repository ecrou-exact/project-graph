import { describe, expect, it } from 'vitest'
import { cardLook, fromGraph, isCardShape, noteBlocks, nodeStyle, parseDocument } from '../src/model.js'
import { circleLayout, gridLayout, layeredLayout, snapToGrid } from '../src/layout.js'
import { isMermaid, mermaidToDocument } from '../src/mermaid.js'

const emptyGraph = { getNodes: () => [], getEdges: () => [] }

describe('notes', () => {
  it('keeps notes with text and a position, and round-trips them', () => {
    const { doc, warnings } = parseDocument({
      notes: [
        { id: 'todo', text: '# To do\n- check **MISP**', x: 10.6, y: -4, width: 220.2, fill: 'none', align: 'middle' },
        { text: 'no position' },
        { text: '   ', x: 0, y: 0 },
      ],
    })
    expect(warnings).toHaveLength(2)
    expect(doc.notes).toEqual([{ id: 'todo', text: '# To do\n- check **MISP**', x: 11, y: -4, width: 220, fill: 'none' }])
    expect(fromGraph(emptyGraph, doc).notes).toEqual(doc.notes)
  })

  it('reads headings, bullets and bold words', () => {
    expect(noteBlocks('# Title\n- one **two**\n\nplain')).toEqual([
      { kind: 'heading', parts: [{ text: 'Title', bold: false }] },
      { kind: 'bullet', parts: [{ text: 'one ', bold: false }, { text: 'two', bold: true }] },
      { kind: 'line', parts: [] },
      { kind: 'line', parts: [{ text: 'plain', bold: false }] },
    ])
  })

  it('can be the end of an arrow', () => {
    const { doc, warnings } = parseDocument({
      nodes: [{ id: 'a' }],
      notes: [{ id: 'why', text: 'Why?', x: 0, y: 0 }],
      arrows: [{ from: { note: 'why', at: [1, 0.5] }, to: { node: 'a' }, route: 'curved' }, { from: { note: 'gone' }, to: { node: 'a' } }],
    })
    expect(warnings).toHaveLength(1)
    expect(doc.arrows).toEqual([{ id: 'arrow', from: { note: 'why', at: [1, 0.5] }, to: { node: 'a' }, route: 'curved' }])
  })
})

describe('legend', () => {
  it('needs a position; is kept with its title and round-trips', () => {
    expect(parseDocument({ legend: { title: 'Key' } }).warnings).toHaveLength(1)
    const { doc } = parseDocument({ legend: { x: 4.4, y: 8, title: 'Key', hidden: false } })
    expect(doc.legend).toEqual({ x: 4, y: 8, title: 'Key' })
    expect(fromGraph(emptyGraph, doc).legend).toEqual(doc.legend)
  })
})

describe('flowchart shapes', () => {
  it('are cards: no Pivotick shape, the shape kept for the card', () => {
    for (const shape of ['pill', 'ellipse', 'diamond', 'cylinder', 'document', 'parallelogram']) {
      expect(isCardShape(shape)).toBe(true)
      expect(nodeStyle({ label: 'x', shape }, {}).shape).toBe('none')
      expect(cardLook({ shape }, {}).shape).toBe(shape)
    }
    expect(isCardShape('circle')).toBe(false)
    expect(parseDocument({ nodes: [{ id: 'q', shape: 'diamond' }] }).warnings).toEqual([])
  })
})

describe('layouts', () => {
  const ids = ['a', 'b', 'c', 'd']
  const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'd', to: 'a' }]

  it('layered: ranks follow the edges (cycles broken), nodes of a rank never overlap', () => {
    const p = layeredLayout(ids, edges, { direction: 'TB', rankGap: 100, nodeGap: 40 })
    expect(p.get('a').y).toBeLessThan(p.get('b').y)
    expect(p.get('b').y).toBe(p.get('c').y)
    expect(p.get('d').y).toBeGreaterThan(p.get('b').y)
    expect(Math.abs(p.get('b').x - p.get('c').x)).toBeGreaterThanOrEqual(160)
    const lr = layeredLayout(ids, edges, { direction: 'LR' })
    expect(lr.get('a').x).toBeLessThan(lr.get('b').x)
    expect(lr.get('b').x).toBe(lr.get('c').x)
  })

  it('layered: a group stays side by side within a rank', () => {
    const many = ['r', 'x1', 'y1', 'x2', 'y2']
    const links = many.slice(1).map((to) => ({ from: 'r', to }))
    const p = layeredLayout(many, links, { group: (id) => id[0] === 'r' ? undefined : id[0] })
    const order = many.slice(1).sort((a, b) => p.get(a).x - p.get(b).x).map((id) => id[0]).join('')
    expect(['xxyy', 'yyxx']).toContain(order)
  })

  it('grid, circle and snap', () => {
    const grid = gridLayout(ids, { gap: 0, sizes: new Map(ids.map((id) => [id, { width: 100, height: 50 }])) })
    expect([...grid.values()]).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }])
    const hub = circleLayout(['h', 'a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'].map((to) => ({ from: 'h', to })))
    expect(hub.get('h')).toEqual({ x: 0, y: 0 })
    expect(Math.round(Math.hypot(hub.get('a').x, hub.get('a').y))).toBeGreaterThanOrEqual(120)
    expect(snapToGrid(new Map([['a', { x: 31, y: -9 }]]), 20).get('a')).toEqual({ x: 40, y: -0 })
  })
})

describe('Mermaid flowcharts', () => {
  const text = `---
title: Incident flow
---
flowchart LR
  %% a comment
  A[Sensor<br>Zeek] -->|alerts| B{"Triage?"}
  B -- yes --> C[(MISP)]
  B -. no .-> D([Close])
  C & D ==> E[/Report/]
  subgraph soc [SOC team]
    E --> F>Ticket]:::hot
    F --- G((Done))
  end
  classDef hot fill:#ffe3e3,stroke:#c92a2a,stroke-width:2px
  style A fill:#d0ebff
  A <--> G
  linkStyle 0 stroke:red`

  it('recognises a flowchart', () => {
    expect(isMermaid(text)).toBe(true)
    expect(isMermaid('graph TD\nA-->B')).toBe(true)
    expect(isMermaid('{"nodes": []}')).toBe(false)
  })

  it('reads shapes, links, groups and styles into a valid fixed-layout document', () => {
    const { doc, warnings } = mermaidToDocument(text)
    expect(warnings).toEqual(['Line 17: "linkStyle" is not supported, skipped.'])
    expect(doc.meta).toMatchObject({ title: 'Incident flow', fixedLayout: true })
    const node = (id) => doc.nodes.find((n) => n.id === id)
    expect(node('A')).toMatchObject({ label: 'Sensor\nZeek', shape: 'card', color: '#d0ebff' })
    expect(node('B')).toMatchObject({ label: 'Triage?', shape: 'diamond' })
    expect(node('C').shape).toBe('cylinder')
    expect(node('D').shape).toBe('pill')
    expect(node('E').shape).toBe('parallelogram')
    expect(node('F')).toMatchObject({ shape: 'document', color: '#ffe3e3', borderColor: '#c92a2a', borderWidth: 2 })
    expect(node('G').shape).toBe('ellipse')
    const edge = (from, to) => doc.edges.find((e) => e.from === from && e.to === to)
    expect(edge('A', 'B')).toMatchObject({ label: 'alerts', direction: 'forward' })
    expect(edge('B', 'C')).toMatchObject({ label: 'yes' })
    expect(edge('B', 'D')).toMatchObject({ label: 'no', dashed: true })
    expect(edge('C', 'E')).toMatchObject({ width: 3 })
    expect(edge('D', 'E')).toBeTruthy()
    expect(edge('F', 'G').direction).toBe('none')
    expect(edge('A', 'G').direction).toBe('both')
    expect(node('A').x).toBeLessThan(node('B').x)
    // The subgraph's section frames its nodes.
    expect(doc.sections).toHaveLength(1)
    const s = doc.sections[0]
    expect(s).toMatchObject({ id: 'soc', title: 'SOC team' })
    for (const id of ['E', 'F', 'G']) {
      expect(node(id).x).toBeGreaterThan(s.x)
      expect(node(id).x).toBeLessThan(s.x + s.width)
    }
    const parsed = parseDocument(doc)
    expect(parsed.errors).toEqual([])
    expect(parsed.warnings).toEqual([])
  })

  it('reports what it cannot read', () => {
    expect(mermaidToDocument('sequenceDiagram\nA->>B: hi').errors[0]).toMatch(/flowchart/)
    const { doc, warnings } = mermaidToDocument('graph TD\nA --> B\nA ??? C')
    expect(doc.nodes).toHaveLength(2)
    expect(warnings[0]).toMatch(/Line 3/)
  })
})
