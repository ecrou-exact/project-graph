// Writes the Hugo example site's content from the example maps: a section per
// map (examples/rulezet.json -> content/projects/, examples/circl.json ->
// content/circl/), with one page bundle per node (front matter `graph`, with
// its relations, and its logo) and the section's `graph` map (title, types).
// Hugo then builds each graph back from its pages
// (hugo/pivograph/layouts/partials/pivograph/document.html).
//   node scripts/hugo-example.mjs
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const site = join(root, 'hugo/example')
const doc = JSON.parse(readFileSync(join(root, 'examples/rulezet.json'), 'utf8'))

/** YAML in block style; scalars are written as JSON, which YAML reads as is. */
function yaml(value, indent = '') {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) return ` [${value.map((v) => JSON.stringify(v)).join(', ')}]`
    return value.map((v) => `\n${indent}- ${yaml(v, `${indent}  `).replace(/^\n\s*/, '')}`).join('')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `\n${indent}${/^[\w-]+$/.test(k) ? k : JSON.stringify(k)}:${yaml(v, `${indent}  `)}`).join('')
  }
  return ` ${JSON.stringify(value)}`
}

function page(frontMatter, body = '') {
  return `---${yaml(frontMatter)}\n---\n${body ? `\n${body}\n` : ''}`
}

/** One section of the example site from one example map: a page bundle per node. */
function section(name, linkTitle, doc, intro, weight) {
  const dir = join(site, 'content', name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '_index.md'), page({
    title: doc.meta.title,
    linkTitle,
    description: doc.meta.description,
    weight,
    graph: { linkDistance: doc.meta.linkDistance, nodeTypes: doc.nodeTypes, edgeTypes: doc.edgeTypes },
  }, `${intro}\n\n{{< pivograph >}}`))
  doc.nodes.forEach((node, i) => {
    const { id, label, description, tags, image, ...rest } = node
    const relations = doc.edges.filter((e) => e.from === id).map(({ id: _id, from: _from, ...edge }) => edge)
    const graph = { id, ...rest }
    if (image) graph.image = 'logo.png'
    if (relations.length) graph.relations = relations
    const bundle = join(dir, id)
    mkdirSync(bundle, { recursive: true })
    // weight keeps the map's order (Hugo would sort the pages by title otherwise)
    writeFileSync(join(bundle, 'index.md'), page({ title: label, description, tags, weight: i + 1, graph }))
    if (image) copyFileSync(join(root, 'public', image), join(bundle, 'logo.png'))
  })
  console.log(`Wrote ${doc.nodes.length} pages to content/${name}/`)
}

section('projects', 'Projects', doc, 'Each project below is a page of this site. Its front matter describes it (`graph`) and says how it relates to the others (`graph.relations`); Hugo builds the graph from these pages.', 1)
section('circl', 'CIRCL', JSON.parse(readFileSync(join(root, 'examples/circl.json'), 'utf8')),
  'Each organisation below is a page of this site, with its logo and its GitHub facts in its front matter (`graph`); CIRCL\'s page lists the organisations it manages (`graph.relations`). Hugo builds the graph from these pages.', 2)
