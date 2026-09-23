// Open Contributions Descriptor (OCD) support.
//
// An OCD file (https://github.com/ossbase-org/Open-Contributions-Descriptor),
// usually published at https://<domain>/.well-known/open-contributions.json,
// describes an organization's open source projects, open data, open standards
// participation and relationships. ocdToDocument() turns it into a Pivograph
// document: the organization in the middle, linked to everything it declares.
//
// Each OCD item keeps its own structure in the node's `details` (status,
// repository { url, license, … }, links { … }, participate { … }, custom
// fields…), so the details panel reads section by section like OCD Viewer,
// and nothing — unknown or future fields included — is lost.

import { parseGithub, uniqueId } from './model.js'

export const OCD_WELL_KNOWN = '/.well-known/open-contributions.json'

/** Whether a parsed JSON value looks like an OCD file rather than a Pivograph document. */
export function isOcd(raw) {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw.nodes)
    && raw.organization && typeof raw.organization === 'object'
    && (raw.spec_version !== undefined || Array.isArray(raw.projects)))
}

/** Where an organization's OCD file lives, from a domain or URL ("misp-project.org"). */
export function wellKnownUrl(input) {
  const text = String(input ?? '').trim()
  if (!text) return ''
  if (/\.json(\?|#|$)/i.test(text) || text.includes('/.well-known/')) return /^https?:\/\//.test(text) ? text : `https://${text}`
  const host = text.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return `https://${host}${OCD_WELL_KNOWN}`
}

export const OCD_NODE_TYPES = {
  organization: { label: 'Organization', color: '#3b63f3', shape: 'hexagon', size: 30, image: 'icons/organization.svg', imageFit: 'icon' },
  project: { label: 'Project', color: '#0f9d8a', shape: 'circle', size: 16, image: 'icons/code.svg', imageFit: 'icon' },
  dataset: { label: 'Open data', color: '#c2860b', shape: 'circle', size: 16, image: 'icons/data.svg', imageFit: 'icon' },
  standard: { label: 'Open standard', color: '#7c5cd6', shape: 'square', size: 16, image: 'icons/format.svg', imageFit: 'icon' },
  'external-organization': { label: 'External organization', color: '#56627a', shape: 'hexagon', size: 22, image: 'icons/organization.svg', imageFit: 'icon' },
  'external-project': { label: 'External project', color: '#8a94a6', shape: 'circle', size: 16, image: 'icons/project.svg', imageFit: 'icon' },
}

// Organization -> its own items. "maintains" has no label: with dozens of
// projects around one organization, one label per spoke would only be noise.
const OWN_EDGES = {
  maintains: { label: '', color: '#9aa5b8' },
  publishes: { label: 'publishes', color: '#c2860b' },
  participates: { label: 'participates in', color: '#7c5cd6', dashed: true },
}

// OCD relationship types (format.md, "Relationship type enum").
const RELATIONSHIP_EDGES = {
  maintains: { label: 'maintains', color: '#3b63f3', width: 3 },
  co_maintains: { label: 'co-maintains', color: '#3b63f3', direction: 'both' },
  supports: { label: 'supports', color: '#2f9e44' },
  contributes_to: { label: 'contributes to', color: '#0f9d8a' },
  sponsors: { label: 'sponsors', color: '#e8833a' },
  upstream_of: { label: 'upstream', color: '#7c5cd6', direction: 'backward' },
  downstream_of: { label: 'downstream', color: '#7c5cd6' },
  member_of: { label: 'member of', color: '#56627a', dashed: true },
  affiliated_with: { label: 'affiliated with', color: '#8a94a6', dashed: true, direction: 'none' },
}

const STATUS_TAGS = {
  archived: { color: '#b7791f', icon: 'triangle-exclamation' },
  disabled: { color: '#d6384b', icon: 'xmark' },
}

/**
 * @param {object} ocd a parsed OCD document
 * @returns {object} a raw Pivograph document (to go through parseDocument)
 */
export function ocdToDocument(ocd) {
  const org = ocd.organization ?? {}
  const orgName = text(org.name) || text(org.domain) || 'Organization'
  const ids = new Set()
  const nodes = []
  const edges = []
  const tags = {}
  const usedNodeTypes = new Set(['organization'])
  const edgeTypes = {}

  const addNode = (base, node) => {
    const id = uniqueId(base, ids)
    ids.add(id)
    nodes.push({ id, ...node })
    usedNodeTypes.add(node.type)
    return id
  }
  const addEdge = (from, to, type, def, extra = {}) => {
    edgeTypes[type] ??= def
    edges.push({ from, to, type, ...extra })
  }

  // --- the organization: its fields, then the document-wide sections --------
  const orgId = addNode(`org-${org.domain || orgName}`, {
    label: orgName,
    type: 'organization',
    description: text(org.description),
    details: {
      ...without(org, ['name', 'description']),
      contacts: ocd.contacts,
      policies: ocd.policies,
      spec_version: ocd.spec_version,
      generated_at: ocd.generated_at,
      extensions: ocd.extensions,
      // Unknown top-level sections (newer spec versions) are kept too.
      ...without(ocd, ['spec_version', 'generated_at', 'organization', 'contacts', 'policies',
        'projects', 'open_data', 'open_standards', 'relationships', 'extensions']),
    },
  })

  // --- projects ---------------------------------------------------------------
  for (const project of list(ocd.projects)) {
    const status = text(project.status)
    const tagList = strings(project.tags)
    if (STATUS_TAGS[status]) {
      tagList.push(status)
      tags[status] = STATUS_TAGS[status]
    }
    const id = addNode(`project-${project.name}`, {
      label: text(project.name) || 'Project',
      type: 'project',
      description: text(project.description),
      github: parseGithub(project.repository?.url) ?? undefined,
      tags: tagList,
      details: without(project, ['name', 'description', 'tags']),
    })
    addEdge(orgId, id, 'maintains', OWN_EDGES.maintains)
  }

  // --- open data --------------------------------------------------------------
  for (const dataset of list(ocd.open_data)) {
    const id = addNode(`data-${dataset.name}`, {
      label: text(dataset.name) || 'Dataset',
      type: 'dataset',
      description: text(dataset.description),
      tags: strings(dataset.tags ?? dataset.tag),
      details: without(dataset, ['name', 'description', 'tags', 'tag']),
    })
    addEdge(orgId, id, 'publishes', OWN_EDGES.publishes)
  }

  // --- open standards ---------------------------------------------------------
  for (const standard of list(ocd.open_standards)) {
    const contributionTypes = [...new Set(list(standard.contributions).map((c) => text(c.type)).filter(Boolean))]
    const id = addNode(`standard-${standard.body}`, {
      label: text(standard.body) || 'Standard',
      type: 'standard',
      details: without(standard, ['body']),
    })
    addEdge(orgId, id, 'participates', OWN_EDGES.participates, {
      label: contributionTypes.join(', ') || undefined,
    })
  }

  // --- relationships to other organizations and projects ----------------------
  for (const rel of list(ocd.relationships)) {
    const target = rel.target ?? {}
    const kind = target.kind === 'project' ? 'external-project' : 'external-organization'
    const id = addNode(`${kind === 'external-project' ? 'ext-project' : 'ext-org'}-${target.name || target.domain}`, {
      label: text(target.name) || text(target.domain) || 'Related',
      type: kind,
      github: parseGithub(target.project?.repository_url) ?? undefined,
      details: without(target, ['name']),
    })
    const type = RELATIONSHIP_EDGES[rel.type] ? rel.type : 'affiliated_with'
    addEdge(orgId, id, `rel-${type}`, RELATIONSHIP_EDGES[type], {
      label: RELATIONSHIP_EDGES[rel.type] ? undefined : text(rel.type),
      description: text(rel.description),
      details: without(rel, ['target', 'description']),
    })
  }

  const nodeTypes = Object.fromEntries([...usedNodeTypes].map((t) => [t, OCD_NODE_TYPES[t]]))
  return {
    version: 1,
    meta: {
      title: `${orgName} — open contributions`,
      description: text(org.description) ?? '',
      source: { format: 'ocd', domain: org.domain, spec_version: ocd.spec_version, generated_at: ocd.generated_at },
      // A published descriptor is shown as it is: editing is off until unlocked.
      readOnly: true,
    },
    nodeTypes,
    edgeTypes,
    tags,
    nodes,
    edges,
  }
}

// --- helpers ---------------------------------------------------------------------

function list(value) {
  return Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : []
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function strings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) : []
}

/** A copy of an object without some keys, other keys in their original order. */
function without(object, keys) {
  return Object.fromEntries(Object.entries(object ?? {}).filter(([key]) => !keys.includes(key)))
}
