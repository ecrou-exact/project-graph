import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MARKER_END, MARKER_START, NO_MARKER,
  edgeLabel, edgeStyle, fromGraph, nodeLabelLook, nodePills, nodeStyle, parseDetails, parseDocument, parseGithub, parseLinks, parseTags, readableOn, tagLook, resolveNode, slugify, starterDocument, toRawEdge, toRawNode, uniqueId,
} from '../src/model.js'
import { flattenDetails, unflattenDetails } from '../src/ui/forms.js'

const example = JSON.parse(readFileSync(new URL('../examples/rulezet.json', import.meta.url), 'utf8'))

describe('parseDocument', () => {
  it('accepts the bundled example without errors or warnings', () => {
    const { doc, errors, warnings } = parseDocument(example)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(doc.nodes).toHaveLength(example.nodes.length)
    expect(doc.edges).toHaveLength(example.edges.length)
  })

  it('reports edges pointing at unknown nodes', () => {
    const { doc, errors } = parseDocument({ nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'b' }] })
    expect(doc).toBeNull()
    expect(errors[0]).toMatch(/"b" does not exist/)
  })

  it('reports duplicate node ids', () => {
    const { errors } = parseDocument({ nodes: [{ id: 'a' }, { id: 'a' }] })
    expect(errors[0]).toMatch(/Duplicate/)
  })

  it('fills in defaults: label from id, edge ids from endpoints', () => {
    const { doc } = parseDocument({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2 }, { from: 1, to: 2 }] })
    expect(doc.nodes[0]).toEqual({ id: '1', label: '1' })
    expect(doc.edges.map((e) => e.id)).toEqual(['1-2', '1-2-2'])
  })

  it('drops unknown shapes and directions with a warning', () => {
    const { doc, warnings } = parseDocument({
      nodes: [{ id: 'a', shape: 'star' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b', direction: 'sideways' }],
    })
    expect(doc.nodes[0].shape).toBeUndefined()
    expect(doc.edges[0].direction).toBeUndefined()
    expect(warnings).toHaveLength(2)
  })

  it('keeps saved positions', () => {
    const { doc } = parseDocument({ nodes: [{ id: 'a', x: 10, y: -4 }] })
    expect(doc.nodes[0]).toMatchObject({ x: 10, y: -4 })
  })
})

describe('styles', () => {
  const nodeTypes = { tool: { color: '#111111', shape: 'square', size: 20, image: 'icons/tool.svg' } }
  const edgeTypes = { uses: { color: '#222222', dashed: true, direction: 'both', label: 'uses' } }

  it('a node inherits from its type and overrides it', () => {
    expect(resolveNode({ type: 'tool', color: '#ff0000' }, nodeTypes)).toMatchObject({ color: '#ff0000', shape: 'square', size: 20 })
    const style = nodeStyle({ type: 'tool', label: 'X' }, nodeTypes)
    expect(style).toMatchObject({ color: '#111111', shape: 'square', size: 20, imagePath: 'icons/tool.svg', imageFit: 'cover', text: 'X' })
  })

  it('maps directions to start/end markers', () => {
    const markers = (direction) => {
      const { markerStart, markerEnd } = edgeStyle({ direction }, {}).edge
      return [markerStart, markerEnd]
    }
    expect(markers('forward')).toEqual([NO_MARKER, MARKER_END])
    expect(markers('backward')).toEqual([MARKER_START, NO_MARKER])
    expect(markers('both')).toEqual([MARKER_START, MARKER_END])
    expect(markers('none')).toEqual([NO_MARKER, NO_MARKER])
  })

  it('an edge inherits colour, dash, direction and label from its type', () => {
    const style = edgeStyle({ type: 'uses' }, edgeTypes).edge
    expect(style).toMatchObject({ strokeColor: '#222222', dashed: true, markerStart: MARKER_START, markerEnd: MARKER_END })
    expect(edgeLabel({ type: 'uses' }, edgeTypes)).toBe('uses')
    expect(edgeLabel({ type: 'uses', label: 'reads' }, edgeTypes)).toBe('reads')
    expect(edgeStyle({ type: 'uses', dashed: false }, edgeTypes).edge.dashed).toBe(false)
  })
})

describe('round trip through Pivotick shapes', () => {
  it('fromGraph(toRaw*(doc)) gives the document back', () => {
    const { doc } = parseDocument(example)
    // Minimal stand-ins for Pivotick's Node / Edge objects.
    const nodes = doc.nodes.map((n) => {
      const raw = toRawNode(n, doc)
      return { id: raw.id, getData: () => raw.data }
    })
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    const edges = doc.edges.map((e) => {
      const raw = toRawEdge(e, doc)
      return { id: raw.id, from: byId[raw.from], to: byId[raw.to], getData: () => raw.data }
    })
    const back = fromGraph({ getNodes: () => nodes, getEdges: () => edges }, doc, false)
    expect(back).toEqual(doc)
  })
})

describe('ids', () => {
  it('slugifies accents and punctuation', () => {
    expect(slugify('Écosystème Rulezet !')).toBe('ecosysteme-rulezet')
  })

  it('suffixes taken ids', () => {
    expect(uniqueId('MISP', new Set(['misp', 'misp-2']))).toBe('misp-3')
  })
})

describe('starterDocument', () => {
  it('has no nodes but ready-to-use, valid types', () => {
    const starter = starterDocument()
    expect(starter.nodes).toEqual([])
    expect(Object.keys(starter.nodeTypes).length).toBeGreaterThan(0)
    expect(Object.keys(starter.edgeTypes).length).toBeGreaterThan(0)
    const { doc, errors } = parseDocument(starter)
    expect(errors).toEqual([])
    expect(doc.nodeTypes).toEqual(starter.nodeTypes)
  })

  it('is not used as the base of imported documents', () => {
    expect(parseDocument({ nodes: [] }).doc.nodeTypes).toEqual({})
  })
})

describe('node border and label look', () => {
  const nodeTypes = { quiet: { hideLabel: true, borderWidth: 0, labelFont: 'mono', labelBackground: '#fff3bf' } }

  it('hides the label and sets the border, inheriting from the type', () => {
    const style = nodeStyle({ type: 'quiet', label: 'X' }, nodeTypes)
    expect(style.text).toBeUndefined()
    expect(style.strokeWidth).toBe(0)
    expect(nodeStyle({ type: 'quiet', label: 'X', hideLabel: false }, nodeTypes).text).toBe('X')
    expect(nodeStyle({ label: 'X', borderColor: '#000' }, {})).toMatchObject({ strokeColor: '#000', text: 'X' })
  })

  it('resolves the label look, with named fonts mapped to CSS', () => {
    expect(nodeLabelLook({ label: 'X' }, {})).toBeNull()
    const look = nodeLabelLook({ type: 'quiet', labelColor: '#d00', labelSize: 16 }, nodeTypes)
    expect(look).toMatchObject({ color: '#d00', size: 16, background: '#fff3bf' })
    expect(look.font).toContain('monospace')
    expect(nodeLabelLook({ labelFont: 'Comic Sans MS' }, {}).font).toBe('Comic Sans MS')
  })
})

describe('tags and badges', () => {
  it('parses #tags from text or arrays, normalized and deduplicated', () => {
    expect(parseTags('#Security #cve, open source ##cve')).toEqual(['security', 'cve', 'open-source'])
    expect(parseTags(['#a', 'b', 'a'])).toEqual(['a', 'b'])
    expect(parseTags(undefined)).toEqual([])
  })

  it('reads the tag registry and node tags from a document', () => {
    const { doc } = parseDocument({ tags: { '#Security': { color: '#d00', icon: 'shield-halved', junk: 1, text: 'S' } }, nodes: [{ id: 'a', tags: '#security #cve' }] })
    expect(doc.tags).toEqual({ security: { color: '#d00', icon: 'shield-halved' } })
    expect(doc.nodes[0].tags).toEqual(['security', 'cve'])
  })

  it('turns tags into pills: registry look, or a stable palette colour', () => {
    const tags = { security: { color: '#fff3bf', icon: 'shield-halved' } }
    const [a, b] = nodePills({ tags: ['security', 'cve'] }, {}, tags)
    expect(a).toEqual({ name: 'security', color: '#fff3bf', fg: '#1c2230', icon: 'shield-halved' })
    expect(b).toMatchObject({ name: 'cve', color: tagLook('cve').color, icon: undefined })
  })

  it('hides pills when asked, per node or per type', () => {
    expect(nodePills({ tags: ['x'], hideBadges: true }, {}, {})).toEqual([])
    expect(nodePills({ tags: ['x'], type: 't' }, { t: { hideBadges: true } }, {})).toEqual([])
    expect(nodeStyle({ label: 'X' }, {}).badges).toBeUndefined()
  })

  it('picks readable badge content colours', () => {
    expect(readableOn('#ffffff')).toBe('#1c2230')
    expect(readableOn('#3b63f3')).toBe('#ffffff')
  })
})

describe('links and GitHub', () => {
  it('normalizes GitHub repositories from slugs, URLs and remotes', () => {
    expect(parseGithub('MISP/MISP')).toBe('MISP/MISP')
    expect(parseGithub('https://github.com/MISP/MISP/tree/2.5')).toBe('MISP/MISP')
    expect(parseGithub('git@github.com:ail-project/ail-framework.git')).toBe('ail-project/ail-framework')
    expect(parseGithub('https://gitlab.com/a/b')).toBeNull()
    expect(parseGithub('not a repo')).toBeNull()
  })

  it('keeps usable links only', () => {
    expect(parseLinks(['https://a', { label: ' Docs ', url: 'https://d' }, { label: 'no url' }, 42])).toEqual([
      { url: 'https://a' }, { label: 'Docs', url: 'https://d' },
    ])
    expect(parseLinks('https://a')).toEqual([])
  })

  it('reads them from a document, warning about a bad repository', () => {
    const { doc, warnings } = parseDocument({ nodes: [
      { id: 'a', github: 'https://github.com/MISP/MISP', links: [{ url: 'https://misp-project.org' }] },
      { id: 'b', github: 'nope' },
    ] })
    expect(doc.nodes[0]).toMatchObject({ github: 'MISP/MISP', links: [{ url: 'https://misp-project.org' }] })
    expect(doc.nodes[1].github).toBeUndefined()
    expect(warnings[0]).toMatch(/not a GitHub repository/)
  })
})

describe('details', () => {
  it('keeps values, lists and nested objects, dropping empty ones', () => {
    expect(parseDetails({ License: 'MIT', Maintainers: ['a', '', 'b'], Empty: '', Nested: { a: 1, b: '', c: {} }, Stars: 3, Fn: () => 1 }))
      .toEqual({ License: 'MIT', Maintainers: ['a', 'b'], Nested: { a: 1 }, Stars: 3 })
  })

  it('round-trips nested details through the path-based form rows', () => {
    const details = { status: 'active', repository: { url: 'https://x', type: 'git' }, contributions: [{ type: 'editor', title: 'T' }], formats: ['json', 'csv'] }
    const rows = flattenDetails(details)
    expect(rows).toContainEqual(['repository.url', 'https://x', false])
    expect(rows).toContainEqual(['contributions.0.title', 'T', false])
    expect(rows).toContainEqual(['formats', ['json', 'csv'], true])
    expect(unflattenDetails(rows.map(([path, value]) => [path, value]))).toEqual(details)
  })
})

describe('saved GitHub details', () => {
  it('keeps the saved summary with its repository, drops it without one', () => {
    const info = { fullName: 'MISP/MISP', stars: 6500, topics: ['cti'], fetchedAt: '2026-09-23T10:00:00Z' }
    const { doc } = parseDocument({ nodes: [{ id: 'a', github: 'MISP/MISP', githubInfo: info }, { id: 'b', githubInfo: info }] })
    expect(doc.nodes[0].githubInfo).toEqual(info)
    expect(doc.nodes[1].githubInfo).toBeUndefined()
  })
})
