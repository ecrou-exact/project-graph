// Writes the Hugo example site's content from examples/rulezet.json: one page
// bundle per node (front matter `graph`, with its relations, and its logo),
// and the section's `graph` map (title, types). Hugo then builds the graph
// back from these pages (hugo/pivograph/layouts/partials/pivograph/document.html).
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
    return Object.entries(value).map(([k, v]) => `\n${indent}${/^[\w-]+$/.test(k) ? k : JSON.stringify(k)}:${yaml(v, `${indent}  `)}`).join('')
  }
  return ` ${JSON.stringify(value)}`
}

function page(frontMatter, body = '') {
  return `---${yaml(frontMatter)}\n---\n${body ? `\n${body}\n` : ''}`
}

const projects = join(site, 'content/projects')
rmSync(projects, { recursive: true, force: true })
mkdirSync(projects, { recursive: true })

writeFileSync(join(projects, '_index.md'), page({
  title: doc.meta.title,
  description: doc.meta.description,
  graph: { linkDistance: doc.meta.linkDistance, nodeTypes: doc.nodeTypes, edgeTypes: doc.edgeTypes },
}, `Each project below is a page of this site. Its front matter describes it (\`graph\`) and says how it relates to the others (\`graph.relations\`); Hugo builds the graph from these pages.

{{< pivograph >}}`))

for (const node of doc.nodes) {
  const { id, label, description, tags, image, ...rest } = node
  const relations = doc.edges.filter((e) => e.from === id).map(({ id: _id, from: _from, ...edge }) => edge)
  const graph = { id, ...rest }
  if (image) graph.image = 'logo.png'
  if (relations.length) graph.relations = relations
  const dir = join(projects, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.md'), page({ title: label, description, tags, graph }))
  if (image) copyFileSync(join(root, 'public', image), join(dir, 'logo.png'))
}

console.log(`Wrote ${doc.nodes.length} project pages to ${projects}`)
