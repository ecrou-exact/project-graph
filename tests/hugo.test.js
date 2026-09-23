// The Hugo component (hugo/pivograph): builds the example site and checks that
// Hugo rebuilds the Rulezet example from its pages, and that the page's text
// says the same sentences as the report protocol (src/report.js).
// Needs the `hugo` binary (on PATH, or HUGO=/path/to/hugo); skipped without it.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDocument } from '../src/model.js'
import { reportModel } from '../src/report.js'

const root = new URL('..', import.meta.url).pathname
const hugo = process.env.HUGO || 'hugo'
let available = true
try {
  execFileSync(hugo, ['version'], { stdio: 'ignore' })
} catch {
  available = false
}

const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

describe.skipIf(!available)('Hugo component', () => {
  const out = mkdtempSync(join(tmpdir(), 'pivograph-hugo-'))
  const log = available ? execFileSync(hugo, ['-s', join(root, 'hugo/example'), '-d', out, '--quiet'], { encoding: 'utf8' }) : ''
  const built = JSON.parse(available ? readFileSync(join(out, 'pivograph/projects.json'), 'utf8') : '{}')
  const original = parseDocument(JSON.parse(readFileSync(join(root, 'examples/rulezet.json'), 'utf8'))).doc

  it('builds without warnings', () => {
    expect(log).not.toMatch(/WARN|ERROR/)
  })

  it('rebuilds the example from the pages', () => {
    const { doc, errors, warnings } = parseDocument(built)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(canon(doc.nodeTypes)).toEqual(canon(original.nodeTypes))
    expect(canon(doc.edgeTypes)).toEqual(canon(original.edgeTypes))
    expect(doc.meta).toMatchObject({ title: original.meta.title, linkDistance: original.meta.linkDistance, readOnly: true })
    for (const node of original.nodes) {
      const { image: _i, links: _l, ...fields } = node
      const mine = doc.nodes.find((n) => n.id === node.id)
      expect(canon(mine)).toMatchObject(canon(fields))
      expect(mine.image).toMatch(new RegExp(`/projects/${node.id}/logo\\.png$`))
      expect(mine.links[0]).toMatchObject({ label: 'Site page', url: expect.stringMatching(`/projects/${node.id}/$`) })
    }
    const key = (e) => JSON.stringify(canon([e.from, e.to, e.type, e.label, e.description, e.details]))
    expect(doc.edges.map(key).sort()).toEqual(original.edges.map(key).sort())
  })

  it('writes the same sentences as the report protocol', () => {
    const html = readFileSync(join(out, 'projects/index.html'), 'utf8')
    const items = [...html.matchAll(/<li>([\s\S]*?)(?:<p>|<dl|<\/li>)/g)].map((m) => plain(m[1]))
    const text = (segments) => segments.map((s) => (typeof s === 'string' ? s : s.name ?? `#${s.tag}`)).join('')
    const model = reportModel(parseDocument(built).doc)
    const sentences = [
      ...model.groups.flatMap((g) => g.nodes.flatMap((n) => n.relations.map(text))),
      ...model.relations.flatMap((r) => [...r.plain.map(text), ...r.rich.map((x) => text(x.sentence))]),
    ]
    expect(sentences.length).toBeGreaterThan(20)
    for (const s of sentences) expect(items).toContain(s)
  })

  it('works without JavaScript: the text is in the page, the iframe is not', () => {
    const html = readFileSync(join(out, 'projects/index.html'), 'utf8')
    expect(html).not.toMatch(/<iframe/)
    expect((html.match(/class="pivograph-node"/g) ?? []).length).toBe(original.nodes.length)
    expect(html).toContain('data-src="/pivograph/projects.json"')
  })

  it('gives tags the colours of the app', async () => {
    const { tagLook, readableOn } = await import('../src/model.js')
    const html = readFileSync(join(out, 'projects/index.html'), 'utf8')
    for (const tag of ['cti', 'threat-intelligence', 'yara', 'incident-response']) {
      const color = tagLook(tag).color
      expect(html).toContain(`style="background:${color};color:${readableOn(color)}">#${tag}<`)
    }
  })

  it('draws the graph as SVG for readers without JavaScript', () => {
    const html = readFileSync(join(out, 'projects/index.html'), 'utf8')
    const svg = html.match(/<svg class="pivograph-svg"[\s\S]*?<\/svg>/)?.[0] ?? ''
    expect(svg).toMatch(/role="img"/)
    expect(svg).toContain(`<title id="pivograph-projects-title">${original.meta.title}</title>`)
    // every node, as a link to its entry in the text, with its logo
    for (const node of original.nodes) {
      expect(svg).toContain(`<a href="#pivograph-${node.id}">`)
      expect(svg).toContain(`href="/projects/${node.id}/logo.png"`)
    }
    // every edge as a path with its arrow; labels written out
    const edgesLayer = svg.match(/<g class="pivograph-svg-edges">([\s\S]*?)<\/g>/)?.[1] ?? ''
    expect((edgesLayer.match(/<path d="M/g) ?? []).length).toBe(original.edges.length)
    expect((svg.match(/marker-end="url\(#pivograph-projects-arrow-\d\)"/g) ?? []).length).toBe(original.edges.length)
    expect(svg).toContain('>pushes rules as MISP events</text>')
    expect(svg).toContain('stroke-dasharray')
  })

  it('reads a data file, and keeps the positions of the app in the picture', () => {
    // A copy of the example with a data file: a graph exported from the app, with positions.
    const site = mkdtempSync(join(tmpdir(), 'pivograph-hugo-data-'))
    cpSync(join(root, 'hugo/example'), site, { recursive: true, filter: (f) => !/[\\/](public|resources)$/.test(f) })
    const minimal = JSON.parse(readFileSync(join(root, 'examples/minimal.json'), 'utf8'))
    const positions = { rulezet: [0, 0], misp: [340, -150], flowintel: [-340, -150] }
    const placed = { ...minimal, nodes: minimal.nodes.map((n) => ({ ...n, x: positions[n.id][0], y: positions[n.id][1] })) }
    mkdirSync(join(site, 'data/pivograph'), { recursive: true })
    writeFileSync(join(site, 'data/pivograph/minimal.json'), JSON.stringify(placed))
    writeFileSync(join(site, 'content/data-file.md'), '---\ntitle: Data file\n---\n\n{{< pivograph data="minimal" >}}\n')
    // The copy still finds the component: its themesDir ("..") becomes an absolute path.
    const config = join(site, 'hugo.toml')
    writeFileSync(config, readFileSync(config, 'utf8').replace(/themesDir = ".*"/, `themesDir = ${JSON.stringify(join(root, 'hugo'))}`))
    const built = join(site, 'out')
    const log = execFileSync(hugo, ['-s', site, '-d', built, '--quiet'], { encoding: 'utf8' })
    expect(log).not.toMatch(/WARN|ERROR/)
    expect(canon(JSON.parse(readFileSync(join(built, 'pivograph/minimal.json'), 'utf8')))).toEqual(canon(placed))
    const html = readFileSync(join(built, 'data-file/index.html'), 'utf8')
    expect(html).toContain('<g transform="translate(340.0,-150.0)"><title>MISP</title>')
    expect(html).toContain('<g transform="translate(0.0,0.0)"><title>Rulezet</title>')
    expect((html.match(/class="pivograph-node"/g) ?? []).length).toBe(3)
  })
})
