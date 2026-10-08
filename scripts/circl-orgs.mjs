// Writes examples/circl/<id>.json: one graph per organisation of the CIRCL
// example, the organisation in the centre and all its projects around it.
// The source of each graph is the organisation's Open Contributions Descriptor
// (examples/circl-ocd/<GitHub login>.json, generated with github-to-ocd.py from
// public repositories only), read with ocdToDocument like an imported OCD file.
// The organisation node keeps what the level-1 graph (examples/circl.json) says
// about it: its name on the CIRCL page, logo, website, main repository and facts.
//   node scripts/circl-orgs.mjs
// No network access: it only reads the files above.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ocdToDocument } from '../src/ocd.js'

const root = new URL('..', import.meta.url).pathname

// The organisation node looks like in the level-1 graph: its logo on white, no border.
const ORGANISATION_LOOK = {
  label: 'Organisation', color: '#ffffff', shape: 'circle', size: 50, imageFit: 'contain',
  borderWidth: 0, labelSize: 20, labelFont: 'sans', labelBackground: 'none',
}

// Its projects: the organisation's logo, small, on white.
const PROJECT_LOOK = {
  label: 'Project', color: '#ffffff', shape: 'circle', size: 18, imageFit: 'contain',
  borderWidth: 0, labelSize: 12, labelFont: 'sans', labelBackground: 'none',
}

/**
 * One organisation's graph: its OCD, completed with its level-1 node.
 * @param {object} ocd the organisation's Open Contributions Descriptor
 * @param {object} node the organisation's node in examples/circl.json
 */
export function circlOrgDocument(ocd, node) {
  const doc = ocdToDocument(ocd)
  const org = doc.nodes.find((n) => n.type === 'organization')
  // The OCD's facts first (domain, links, generation date), then the level-1 facts.
  Object.assign(org, {
    label: node.label,
    description: node.description ?? org.description,
    url: node.url,
    image: node.image,
    github: node.github,
    githubInfo: node.githubInfo,
    links: node.links,
    tags: node.tags,
    details: { ...org.details, ...node.details },
  })
  doc.nodeTypes.organization = ORGANISATION_LOOK
  // Its projects carry its logo too, smaller.
  for (const n of doc.nodes) if (n.type === 'project') n.image = node.image
  if (doc.nodeTypes.project) doc.nodeTypes.project = PROJECT_LOOK
  doc.meta = {
    ...doc.meta,
    title: `${node.label}: projects`,
    description: `The public GitHub repositories of ${node.label}, one of the GitHub organisations managed or co-managed by CIRCL, from its Open Contributions Descriptor (${ocd.generated_at?.slice(0, 10) ?? 'undated'}).`,
    circl: node.id,
  }
  return doc
}

/** Every organisation of the CIRCL example with its OCD: [{ id, file, doc }]. */
export function circlOrgDocuments() {
  const circl = JSON.parse(readFileSync(join(root, 'examples/circl.json'), 'utf8'))
  const dir = join(root, 'examples/circl-ocd')
  const files = new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5).toLowerCase(), f]))
  return circl.nodes.map((node) => {
    const file = files.get(node.id)
    if (!file) throw new Error(`${node.id}: no OCD file in examples/circl-ocd/`)
    const ocd = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    return { id: node.id, file, ocd, doc: circlOrgDocument(ocd, node) }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = join(root, 'examples/circl')
  mkdirSync(out, { recursive: true })
  for (const { id, doc } of circlOrgDocuments()) {
    writeFileSync(join(out, `${id}.json`), `${JSON.stringify(doc, null, 2)}\n`)
    console.log(`${id}: ${doc.nodes.length - 1} nodes`)
  }
}
