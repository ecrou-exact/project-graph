import { describe, expect, it } from 'vitest'
import { buildDocs } from '../scripts/docs.mjs'
import { parseDocument } from '../src/model.js'

const files = buildDocs({ pivotickVersion: 'test' })
const text = (key) => String(files[key])

describe('documentation site', () => {
  it('publishes the pages, the files for AI agents, the schema and the examples', () => {
    for (const key of ['docs/index.html', 'docs/guide.html', 'docs/site.css', 'llms.txt', 'llms-full.txt',
      'docs/pivograph.schema.json', 'docs/examples/rulezet.json', 'docs/examples/circl.json', 'docs/examples/minimal.json', 'docs/assets/hero.png']) {
      expect(files[key], key).toBeTruthy()
    }
    expect(text('docs/index.html')).not.toMatch(/\{\{\w+\}\}/)
    expect(text('docs/guide.html')).not.toMatch(/\{\{\w+\}\}/)
  })

  it('has no link to a missing section of the guide', () => {
    const guide = text('docs/guide.html')
    const ids = new Set([...guide.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))
    const inGuide = [...guide.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
    const fromHome = [...text('docs/index.html').matchAll(/href="guide\.html#([^"]+)"/g)].map((m) => m[1])
    expect([...inGuide, ...fromHome].filter((id) => !ids.has(id))).toEqual([])
  })

  it('indexes every section of the guide for the search box', () => {
    const guide = text('docs/guide.html')
    const index = JSON.parse(text('docs/search.json'))
    const sections = [...guide.matchAll(/<h[23] id="([^"]+)"/g)].map((m) => m[1])
    expect(index.map((e) => e.id)).toEqual(sections)
    for (const entry of index) {
      expect(entry.title, entry.id).toBeTruthy()
      expect(entry.text, entry.id).not.toMatch(/```|\]\(/)
    }
    expect(index.find((e) => e.id === 'hugo').text).toContain('without JavaScript')
    for (const page of ['docs/index.html', 'docs/guide.html']) {
      expect(text(page)).toContain('data-site-search')
      expect(text(page)).toContain('<script src="search.js" defer></script>')
    }
    expect(text('docs/search.js')).toContain('function search(')
  })

  it('gives AI agents absolute links only', () => {
    const relative = (md) => [...md.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((url) => !/^https?:/.test(url))
    expect(relative(text('llms-full.txt'))).toEqual([])
    expect(relative(text('llms.txt'))).toEqual([])
  })

  it('shows JSON examples that are valid documents', () => {
    const blocks = [...text('llms-full.txt').matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1])
    const whole = blocks.filter((b) => b.trim().startsWith('{') && !b.includes('…'))
    expect(whole.length).toBeGreaterThan(0)
    for (const block of whole) {
      const { errors, warnings } = parseDocument(JSON.parse(block))
      expect({ errors, warnings }).toEqual({ errors: [], warnings: [] })
    }
    for (const key of ['docs/examples/rulezet.json', 'docs/examples/circl.json', 'docs/examples/minimal.json']) {
      expect(parseDocument(JSON.parse(text(key))).errors, key).toEqual([])
    }
  })
})
