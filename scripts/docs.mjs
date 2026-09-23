// Builds the documentation site from docs/content/*.md:
//   docs/index.html   home page (docs/home.html)
//   docs/guide.html   the guide: static HTML (readable without JavaScript), contents from the headings
//   llms-full.txt     the same content as Markdown, links made absolute, for AI agents
//   llms.txt          short index in the llms.txt format (https://llmstxt.org)
//   docs/pivograph.schema.json, docs/examples/*.json   published as-is
// As a Vite plugin: emitted into dist/ on build, served live on the dev server.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import javascript from 'highlight.js/lib/languages/javascript'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'

hljs.registerLanguage('json', json)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('bash', bash)

export const SITE = 'https://ecrou-exact.github.io/project-graph/'
export const REPO = 'https://github.com/ecrou-exact/project-graph'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')

function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function markdownSource() {
  return readdirSync(join(root, 'docs/content'))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => read(`docs/content/${f}`).trim())
    .join('\n\n')
}

/** Markdown -> { html, toc } with anchored headings, highlighted code, scrollable tables. */
function render(markdown) {
  const toc = []
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const id = slug(text)
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: text.replace(/<[^>]+>/g, '') })
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section"></a>${text}</h${depth}>\n`
      },
      code({ text, lang }) {
        const language = hljs.getLanguage(lang ?? '') ? lang : null
        const body = language ? hljs.highlight(text, { language }).value : escapeHtml(text)
        const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
        return `<div class="code">${label}<pre><code class="hljs${language ? ` language-${language}` : ''}">${body}</code></pre></div>\n`
      },
      table(token) {
        const cell = (c, tag) => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`
      },
    },
  })
  return { html: marked.parse(markdown), toc }
}

function tocHtml(toc) {
  let html = '<ol class="toc-list">'
  let open = false
  for (const item of toc) {
    if (item.depth === 2) {
      if (open) html += '</ol></li>'
      html += `<li><a href="#${item.id}">${item.text}</a><ol>`
      open = true
    } else {
      html += `<li><a href="#${item.id}">${item.text}</a></li>`
    }
  }
  if (open) html += '</ol></li>'
  return `${html}</ol>`
}

/** Links written for docs/index.html, made absolute for a file read on its own. */
function absoluteLinks(markdown) {
  return markdown
    .replace(/\]\(\.\.\/([^)]+)\)/g, `](${SITE}$1)`)
    .replace(/\]\((pivograph\.schema\.json|examples\/[^)]+)\)/g, `](${SITE}docs/$1)`)
    .replace(/\]\(#([^)]+)\)/g, `](${SITE}docs/guide.html#$1)`)
}

// One line per guide section, for the home page's index of the guide.
const SECTION_SUMMARIES = {
  'overview': 'What a map contains, and where to find the app, the source and the files for AI agents.',
  'quick-start': 'Use it in the browser, or run it locally.',
  'mapping-an-organization': 'The procedure to map an organization: sources, nodes, edges, types, validation, a checklist and a prompt.',
  'document-format': 'Every field of meta, nodes, edges, types and tags, with defaults and validation rules.',
  'examples': 'A complete checked map and a minimal one.',
  'open-contributions-descriptor': 'How a .well-known/open-contributions.json file becomes a map.',
  'embedding': 'Show a map on another site: iframe parameters and the postMessage protocol.',
  'using-the-app': 'Editing nodes and edges, GitHub details, filters and saving.',
  'architecture': 'How the code is organized, and the Pivotick details it works around.',
  'development': 'Scripts, tests, deployment and this documentation.',
  'for-ai-agents': 'The files an AI agent should read and produce.',
}

// A short map shown on the home page, highlighted like the guide's code.
const SNIPPET = `\`\`\`json
{
  "meta": { "title": "Projects linked to Rulezet" },
  "nodeTypes": {
    "project": {
      "color": "#3b63f3",
      "shape": "hexagon",
      "image": "icons/project.svg",
      "imageFit": "icon"
    }
  },
  "nodes": [
    {
      "id": "rulezet",
      "label": "Rulezet",
      "type": "project",
      "github": "rulezet/rulezet-core"
    },
    {
      "id": "misp",
      "label": "MISP",
      "tags": ["threat-intelligence"]
    }
  ],
  "edges": [
    {
      "from": "rulezet",
      "to": "misp",
      "label": "pushes rules as MISP events"
    }
  ]
}
\`\`\``

function fill(template, values) {
  // Functions, not strings: a replacement string would interpret "$" sequences in the content.
  let out = template
  for (const [key, value] of Object.entries(values)) out = out.replaceAll(`{{${key}}}`, () => value)
  return out
}

export function buildDocs({ pivotickVersion = '' } = {}) {
  const markdown = markdownSource()
  const { html, toc } = render(markdown)
  const common = { pivotick: pivotickVersion, repo: REPO, site: SITE }
  const page = fill(read('docs/guide.html'), { ...common, content: html, toc: tocHtml(toc) })
  const guideIndex = toc.filter((t) => t.depth === 2).map((t) =>
    `<div><dt><a href="guide.html#${t.id}">${t.text}</a></dt><dd>${SECTION_SUMMARIES[t.id] ?? ''}</dd></div>`).join('\n        ')
  const home = fill(read('docs/home.html'), { ...common, snippet: render(SNIPPET).html, guideIndex })

  const full = `# Pivograph documentation\n\n> Map an organization's projects and their connections as a graph, from one JSON document.\n> Source: ${REPO} — App: ${SITE} — Guide: ${SITE}docs/guide.html\n\n${absoluteLinks(markdown)}\n`

  const index = `# Pivograph

> Pivograph maps an organization's projects, platforms, data and partners as a graph (nodes and directed edges) from one JSON document, rendered and edited in the browser with Pivotick. It imports Open Contributions Descriptors (.well-known/open-contributions.json) and can be embedded in other sites.

To map an organization, read the full documentation first and follow its "Mapping an organization" procedure and "Document format" reference exactly.

## Docs

- [Full documentation](${SITE}llms-full.txt): everything below in one Markdown file
- [Mapping an organization](${SITE}docs/guide.html#mapping-an-organization): the procedure to follow, with a checklist and a prompt template
- [Document format](${SITE}docs/guide.html#document-format): every field of nodes, edges, types, tags and meta, with defaults and validation rules
- [Open Contributions Descriptor](${SITE}docs/guide.html#open-contributions-descriptor): how an OCD file becomes a map
- [Embedding](${SITE}docs/guide.html#embedding): iframe parameters and postMessage protocol

## Data

- [JSON schema](${SITE}docs/pivograph.schema.json): the document format for validators
- [Example: projects linked to Rulezet](${SITE}docs/examples/rulezet.json): a complete, checked map
- [Example: minimal map](${SITE}docs/examples/minimal.json)

## Optional

- [Source code](${REPO}): MIT
- [App](${SITE}): load a map, edit it, export it
`

  return {
    'docs/index.html': home,
    'docs/guide.html': page,
    'docs/site.css': read('docs/site.css'),
    'llms-full.txt': full,
    'llms.txt': index,
    'docs/pivograph.schema.json': read('schema/pivograph.schema.json'),
    'docs/examples/rulezet.json': read('examples/rulezet.json'),
    'docs/examples/minimal.json': read('examples/minimal.json'),
    'docs/assets/hero.png': readFileSync(join(root, 'docs/assets/hero.png')),
  }
}

const TYPES = { css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', txt: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8', png: 'image/png' }

/** Vite plugin: serves the docs in dev, emits them into dist/ on build. */
export function docsPlugin() {
  const pivotickVersion = JSON.parse(read('node_modules/pivotick/package.json')).version
  return {
    name: 'pivograph-docs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '')
        if (path === 'docs') {
          // Relative links in the page need the trailing slash (GitHub Pages adds it too).
          res.statusCode = 301
          res.setHeader('Location', '/docs/')
          return res.end()
        }
        const key = path === 'docs/' ? 'docs/index.html' : path
        const files = key.startsWith('docs/') || key.startsWith('llms') ? buildDocs({ pivotickVersion }) : null
        if (!files?.[key]) return next()
        res.setHeader('Content-Type', TYPES[key.split('.').pop()] ?? 'text/plain; charset=utf-8')
        res.end(files[key])
      })
      server.watcher.add(join(root, 'docs'))
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(buildDocs({ pivotickVersion }))) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}
