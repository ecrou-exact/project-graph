import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isOcd, ocdToDocument, wellKnownUrl } from '../src/ocd.js'
import { parseDocument } from '../src/model.js'

// Official sample from https://github.com/ossbase-org/Open-Contributions-Descriptor
const flowintel = JSON.parse(readFileSync(new URL('./fixtures/ocd-flowintel.json', import.meta.url), 'utf8'))

const minimal = {
  spec_version: '1.0',
  generated_at: '2026-01-01T00:00:00Z',
  organization: { name: 'Example', domain: 'example.org', country: 'LU', links: { homepage: 'https://example.org', github_org: 'https://github.com/example' } },
  contacts: { security: { email: 'security@example.org' } },
  policies: { contributing: 'https://example.org/contributing' },
  projects: [{
    name: 'Tool', description: 'A tool', status: 'archived',
    repository: { url: 'https://github.com/example/tool', license: 'MIT' },
    governance: { maintainers: ['alice'] }, tags: ['cti'], custom_field: 'kept',
  }],
  open_data: [{ name: 'Feed', license: 'CC-BY-4.0', urls: { download: 'https://example.org/feed.json' }, formats: ['json'] }],
  open_standards: [{ body: 'IETF', working_groups: ['sidrops'], contributions: [{ type: 'draft-author', title: 'Draft', url: 'https://datatracker.ietf.org/x' }] }],
  relationships: [
    { type: 'member_of', since: '2024-01-15', target: { kind: 'organization', name: 'Consortium', domain: 'consortium.example' }, evidence: ['https://consortium.example/members'] },
    { type: 'co_maintains', target: { kind: 'project', name: 'Upstream', project: { repository_url: 'https://github.com/upstream/tooling', license: 'MPL-2.0' } } },
  ],
}

describe('OCD import', () => {
  it('recognizes OCD files, not Pivograph documents', () => {
    expect(isOcd(flowintel)).toBe(true)
    expect(isOcd({ nodes: [], organization: {} })).toBe(false)
    expect(isOcd({ nodes: [] })).toBe(false)
  })

  it('builds the well-known URL from a domain or keeps a URL', () => {
    expect(wellKnownUrl('misp-project.org')).toBe('https://misp-project.org/.well-known/open-contributions.json')
    expect(wellKnownUrl('https://misp-project.org/about')).toBe('https://misp-project.org/.well-known/open-contributions.json')
    expect(wellKnownUrl('https://x.org/ocd.json')).toBe('https://x.org/ocd.json')
  })

  it('turns the official flowintel sample into a valid graph', () => {
    const { doc, errors, warnings } = parseDocument(ocdToDocument(flowintel))
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(doc.nodes).toHaveLength(flowintel.projects.length + 1)
    expect(doc.edges).toHaveLength(flowintel.projects.length)
    const project = doc.nodes.find((n) => n.type === 'project' && n.label === 'flowintel')
    expect(project).toMatchObject({ type: 'project', github: 'flowintel/flowintel' })
    expect(project.tags).toContain('threatintel')
  })

  it('keeps each OCD item in its own structure, like OCD Viewer shows it', () => {
    const { doc } = parseDocument(ocdToDocument(flowintel))
    const project = doc.nodes.find((n) => n.type === 'project' && n.label === 'flowintel')
    const source = flowintel.projects.find((p) => p.name === 'flowintel')
    const { name, description, tags, ...rest } = source
    expect(project.details).toEqual(rest)
    expect(Object.keys(project.details)).toEqual(Object.keys(rest)) // same section order
    expect(project.description).toBe(description)
    expect(project.tags).toEqual(tags)
  })

  it('maps every section: organization, contacts, policies, projects, data, standards, relationships', () => {
    const { doc, errors } = parseDocument(ocdToDocument(minimal))
    expect(errors).toEqual([])
    const byType = (t) => doc.nodes.filter((n) => n.type === t)
    const [org] = byType('organization')
    expect(org.details).toMatchObject({
      domain: 'example.org', country: 'LU',
      links: { homepage: 'https://example.org', github_org: 'https://github.com/example' },
      contacts: { security: { email: 'security@example.org' } },
      policies: { contributing: 'https://example.org/contributing' },
      spec_version: '1.0',
    })
    const [tool] = byType('project')
    expect(tool).toMatchObject({ github: 'example/tool', tags: ['cti', 'archived'] })
    expect(tool.details).toEqual({
      status: 'archived', repository: { url: 'https://github.com/example/tool', license: 'MIT' },
      governance: { maintainers: ['alice'] }, custom_field: 'kept',
    })
    expect(doc.tags.archived).toBeDefined()
    expect(byType('dataset')[0].details).toMatchObject({ license: 'CC-BY-4.0', formats: ['json'], urls: { download: 'https://example.org/feed.json' } })
    expect(byType('standard')[0]).toMatchObject({ label: 'IETF', details: { working_groups: ['sidrops'] } })
    expect(byType('standard')[0].details.contributions[0]).toMatchObject({ type: 'draft-author', title: 'Draft' })
    expect(byType('external-organization')[0]).toMatchObject({ label: 'Consortium', details: { kind: 'organization', domain: 'consortium.example' } })
    expect(byType('external-project')[0].github).toBe('upstream/tooling')
    const member = doc.edges.find((e) => e.type === 'rel-member_of')
    expect(member.details).toEqual({ type: 'member_of', since: '2024-01-15', evidence: ['https://consortium.example/members'] })
    expect(doc.edgeTypes['rel-co_maintains'].direction).toBe('both')
    expect(doc.meta.source).toMatchObject({ format: 'ocd', domain: 'example.org' })
    expect(doc.meta.readOnly).toBe(true) // a published descriptor opens read-only
  })
})
