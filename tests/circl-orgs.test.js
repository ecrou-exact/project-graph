// The organisation graphs of the CIRCL example (scripts/circl-orgs.mjs): each
// Open Contributions Descriptor in examples/circl-ocd/ loads without errors,
// with one node per project, and the organisation keeps its level-1 logo.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { circlOrgDocuments } from '../scripts/circl-orgs.mjs'
import { parseDocument } from '../src/model.js'

const root = new URL('..', import.meta.url).pathname
const orgs = circlOrgDocuments()

describe('CIRCL organisation graphs', () => {
  it('has a graph for each of the 22 organisations', () => {
    expect(orgs).toHaveLength(22)
  })

  it.each(orgs.map((o) => [o.id, o]))('%s: loads, one node per project', (id, { ocd, doc }) => {
    const { doc: parsed, errors, warnings } = parseDocument(doc)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    const count = (type) => parsed.nodes.filter((n) => n.type === type).length
    expect(count('organization')).toBe(1)
    expect(count('project')).toBe(ocd.projects.length)
    expect(count('dataset')).toBe(ocd.open_data?.length ?? 0)
    // Only public repositories of this organisation.
    for (const n of parsed.nodes.filter((n) => n.type === 'project')) {
      expect(n.details.repository.url.toLowerCase()).toContain(`github.com/${ocd.organization.links.github_org.split('/').pop().toLowerCase()}/`)
    }
    const org = parsed.nodes.find((n) => n.type === 'organization')
    expect(org.image).toBe(`logos/circl/${id}.png`)
    expect(existsSync(`${root}public/${org.image}`)).toBe(true)
    // Each project carries the logo of its organisation.
    for (const n of parsed.nodes.filter((n) => n.type === 'project')) expect(n.image).toBe(org.image)
    expect(parsed.meta.readOnly).toBe(true)
  })

  it('links each organisation of the CIRCL example to its graph', () => {
    const circl = JSON.parse(readFileSync(`${root}examples/circl.json`, 'utf8'))
    for (const node of circl.nodes) {
      expect(node.graph).toBe(`examples/circl/${node.id}.json`)
      expect(existsSync(`${root}${node.graph}`)).toBe(true)
    }
    expect(parseDocument(circl).doc.nodes.every((n) => n.graph)).toBe(true)
  })

  it('matches the generated files', () => {
    for (const { id, doc } of orgs) {
      const file = JSON.parse(readFileSync(`${root}examples/circl/${id}.json`, 'utf8'))
      expect(file).toEqual(JSON.parse(JSON.stringify(doc)))
    }
  })
})
