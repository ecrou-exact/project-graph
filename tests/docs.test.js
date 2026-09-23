import { describe, expect, it } from 'vitest'
import { buildDocs } from '../scripts/docs.mjs'
import { parseDocument } from '../src/model.js'

const files = buildDocs({ pivotickVersion: 'test' })
const text = (key) => String(files[key])

describe('documentation site', () => {
  it('publishes the pages, the files for AI agents, the schema and the examples', () => {
    for (const key of ['docs/index.html', 'docs/guide.html', 'docs/site.css', 'llms.txt', 'llms-full.txt',
      'docs/pivograph.schema.json', 'docs/examples/rulezet.json', 'docs/examples/minimal.json', 'docs/assets/hero.png']) {
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
    for (const key of ['docs/examples/rulezet.json', 'docs/examples/minimal.json']) {
      expect(parseDocument(JSON.parse(text(key))).errors, key).toEqual([])
    }
  })
})
