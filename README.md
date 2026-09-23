# Pivograph

Build a **graph of a project's connections** from a simple JSON file, then edit it with the mouse or through forms. Rendering and interaction are powered by the latest version of [Pivotick](https://pivotick.github.io/Pivotick/) (CIRCL).

Bundled example: projects linked to **Rulezet** (`examples/rulezet.json`).

**Documentation: [ecrou-exact.github.io/project-graph/docs](https://ecrou-exact.github.io/project-graph/docs/)** — the guide (format reference, a step-by-step procedure to map an organization, OCD import, embedding, architecture), plus [`llms.txt`](https://ecrou-exact.github.io/project-graph/llms.txt) and [`llms-full.txt`](https://ecrou-exact.github.io/project-graph/llms-full.txt) for AI agents.

## Features

- **Nodes**: label, type, description, link, colour, shape (circle, square, triangle, hexagon), size, image (URL, relative path, embedded local file, or one of the bundled icons), border (colour, width or none), and label (shown or hidden, text colour, background or none, size, font). The node form is split into tabs: Content, Links, Appearance, Border, Label, Badges.
- **Edges**, edited like nodes (tabs Content, Line, Label, Details, with a live preview): how the two are related (label, with suggestions from the graph and common relationship words), type, **arrow direction** (`→`, `←`, `↔` or none), source/target swap; colour, width, solid/dashed, shape (auto, straight, curved), moving dashes; label shown or hidden, text colour, background or none, size, font. Edge types provide all of these as defaults.
- **Tags**: `#tags` on a node become coloured pills under it, with a colour and an optional icon (a curated set of Font Awesome Free icons, picked from a grid) per tag, shared by every node with that tag. Existing tags are suggested when typing; pills can be hidden per node or per type. A Tags tab lists and edits them.
- **Links**: a website, a GitHub repository and any number of other links per node. The GitHub API (60 unauthenticated requests per hour) is only called from the node form — when a repository is entered, or with *Refresh* — and the summary (description, stars, forks, open issues, language, licence, topics, last update) is saved with the node (`githubInfo`) and shown from there: displaying or importing a graph, a well-known file included, never calls it. When fetching, *Also add the repository topics as tags* adds the repository's GitHub topics to the node's tags (never removing any).
- **Details**: any extra key / value fields on a node or an edge (license, maintainers, formats…), shown in the details panel and tooltip, edited in the Details tab.
- **Open Contributions Descriptor import**: open, drop or paste a `.well-known/open-contributions.json` file (or use *Import well-known…* with a domain or URL) and it becomes a graph — see below.
- **Types**: a node or edge type defines default styling; every element can override it.
  *New* starts a graph with ready-to-use types (one per bundled icon, plus common relations such as *uses*, *depends on*, *integrates with*), all editable in the Types tab.
- **Two synchronised ways to edit**:
  - the app's own UI: `+ Node` / `+ Edge` buttons, filterable lists, double-click to edit;
  - Pivotick's tools: *Create ▸ Add node* (click on the canvas) and *Add edge* (click source, then target) open **the same form modal**; so do *Edit node* and *Edit edge*.
- Built-in **JSON editor** (JSON tab) with validation and error messages.
- Import (button, or drag & drop a `.json` file) and JSON export (with or without positions, to keep the layout).
- Pivotick's **Filter Graph** panel filters by tags (every tag in the graph is offered), type, label, description and — for OCD projects — status and license; relationships can be toggled by type.
- A *Tags on graph* button shows or hides every tag pill on the graph (remembered per browser).
- Resizable side panel: drag its edge (or focus it and use the arrow keys); the width is remembered.
- Clicking a tag or a type in the side panel filters the graph (click again to remove it; several can be combined); the filter is the same as Pivotick's panel, and active filters are listed at the top of the side panel with a *Clear* button. The node list shows each node's description.
- Autosave in the browser.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # tests for the JSON format
npm run build      # static site in dist/
```

## Keeping Pivotick up to date

- `package.json` depends on `pivotick@latest`; `package-lock.json` pins the installed version.
- `npm run update:pivotick` installs the latest published version and prints the installed version next to the one on npm.
- The **Update Pivotick** GitHub workflow (`.github/workflows/update-pivotick.yml`) does this every Monday: it installs the latest version, runs the tests and the build, and opens a pull request if the version changed.
- The version in use is shown at the bottom of the sidebar.

## Open Contributions Descriptor (OCD)

[OCD](https://github.com/ossbase-org/Open-Contributions-Descriptor) is a machine-readable description of an organization's open source projects, open data, open standards participation and relationships, published at `https://<domain>/.well-known/open-contributions.json` (see also [OCD Viewer](https://github.com/ossbase-org/ocd-viewer)).

Pivograph recognizes an OCD file wherever a JSON file is accepted (*Open JSON…*, drag & drop, the JSON tab) and converts it:

| OCD | Graph |
|---|---|
| `organization` | central *Organization* node: description, homepage, domain, country, links, plus `contacts` (emails, URLs) and `policies` as links |
| `projects[]` | *Project* nodes, linked from the organization: description, `tags` as pills, GitHub repository (so the GitHub card), all links (project page, docs, releases, issues, good first issues, changelog, security policy…), license, status, maintainers and custom fields in the details; `archived` / `disabled` become tags |
| `open_data[]` | *Open data* nodes (“publishes”): license, publisher, formats, update frequency, URLs |
| `open_standards[]` | *Open standard* nodes (“participates in”): working groups as tags, contributions as links |
| `relationships[]` | *External organization* / *External project* nodes, linked with the relationship type (`maintains`, `co_maintains`, `supports`, `contributes_to`, `sponsors`, `upstream_of`, `downstream_of`, `member_of`, `affiliated_with`); `since`, `until`, evidence and contacts in the edge details |

*Import well-known…* opens a local file, or fetches the file from a domain (`misp-project.org` → `https://misp-project.org/.well-known/open-contributions.json`) or a URL, and offers the official samples (MISP, AIL, flowintel). The site must allow cross-origin requests; otherwise download the file and open it.

Each item keeps its OCD structure in the node's `details` (status, repository { url, license, type, clone }, links, participate, governance, release, custom fields…), so the details panel reads section by section like OCD Viewer, and unknown or future fields are kept. The details form edits nested fields by path (`repository.url`).

An imported descriptor opens **read-only**: no creation, editing or deletion (Pivotick's Create tools, context-menu entries, double-click, the app's buttons and the JSON editor are all off), while browsing, filtering and exporting still work. *Enable editing* in the header lifts it.

The result is an ordinary Pivograph graph: it can be edited, restyled and exported like any other. Under a node, at most three tag pills are drawn plus a “+N” pill; the details panel lists them all.

## Embedding in another site

The app can be embedded in an `<iframe>` without its top bar (logo, *New*, *Open JSON…*):

| Parameter | Effect |
|---|---|
| `embed=1` | hide the top bar; start empty and read-only; never touch the visitor's saved graph |
| `src=<url>` | load this JSON at start (a Pivograph graph or an OCD file; the server must allow CORS) |
| `sidebar=0` | hide the side panel |
| `tags=0` | start with the tag pills hidden |

```html
<iframe src="https://ecrou-exact.github.io/project-graph/?embed=1&src=https://example.org/.well-known/open-contributions.json"
        style="width:100%;height:80vh;border:0"></iframe>
```

The host page can also send the data itself — for instance a file its visitor opened:

```js
const frame = document.querySelector('iframe')
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return
  if (event.data?.type === 'pivograph:ready') {
    frame.contentWindow.postMessage({ type: 'pivograph:load', data: ocdJson, name: 'open-contributions.json' }, '*')
  }
  // then { type: 'pivograph:loaded', nodes, edges } or { type: 'pivograph:error', message }
})
```

[OCD Viewer](https://github.com/ossbase-org/ocd-viewer) uses this for its *Graph* view.

## JSON format

Full schema: [`schema/pivograph.schema.json`](schema/pivograph.schema.json).

```json
{
  "version": 1,
  "meta": { "title": "My project" },
  "nodeTypes": {
    "project": { "label": "Project", "color": "#3b63f3", "shape": "hexagon", "size": 26 },
    "tool":    { "label": "Tool",    "color": "#0f9d8a", "image": "icons/tool.svg", "imageFit": "icon" }
  },
  "edgeTypes": {
    "uses": { "label": "uses", "color": "#8a94a6" },
    "sync": { "label": "syncs with", "direction": "both", "dashed": true }
  },
  "nodes": [
    { "id": "rulezet", "label": "Rulezet", "type": "project", "url": "https://rulezet.org" },
    { "id": "misp", "label": "MISP", "type": "tool", "color": "#d6384b" }
  ],
  "edges": [
    { "from": "rulezet", "to": "misp", "type": "sync", "label": "shares" }
  ]
}
```

### Node

| Field | Description |
|---|---|
| `id` | **required**, unique |
| `label` | displayed text (defaults to the id) |
| `type` | key in `nodeTypes` |
| `description` | shown in the details panel and tooltip |
| `url` | website |
| `github` | GitHub repository, `owner/repo` or any github.com URL |
| `githubInfo` | the repository summary saved from the form (filled in by the app) |
| `links` | other links: `[{ "label": "Docs", "url": "https://…" }]` |
| `tags` | `["security", "cve"]` (or `"#security #cve"`) |
| `hideBadges` | `true` hides the tag pills |
| `details` | extra fields: `{ "License": "MIT", "Maintainers": ["alice", "bob"] }` (strings, numbers, booleans or lists of them) |
| `color` | any CSS colour |
| `shape` | `circle`, `square`, `triangle`, `hexagon` |
| `size` | radius in pixels |
| `image` | URL, relative path (`icons/…`) or `data:` URL |
| `imageFit` | `cover`, `contain`, `icon`, `frame` |
| `borderColor`, `borderWidth` | outline of the shape; `borderWidth: 0` removes it |
| `hideLabel` | `true` hides the label (e.g. when the image already shows the name) |
| `labelColor`, `labelSize` | label text colour and size (px) |
| `labelBackground` | CSS colour, or `"none"` for no background |
| `labelFont` | `sans`, `serif`, `mono`, `rounded`, `condensed`, or any CSS font-family |
| `x`, `y` | saved position (optional) |

### Tags

A top-level `tags` object sets how each tag looks; tags without an entry get a colour picked from their name.

```json
"tags": {
  "open-source": { "color": "#2f9e44", "icon": "github" },
  "threat-intel": { "color": "#d6384b", "icon": "shield-halved" }
}
```

Icons are Font Awesome Free names (`src/badgeIcons.js` lists the bundled ones).

### Edge

| Field | Description |
|---|---|
| `from`, `to` | **required**, node ids |
| `id` | optional, generated as `from-to` otherwise |
| `label` | text on the edge |
| `type` | key in `edgeTypes` |
| `direction` | `forward` (from → to, default), `backward` (to → from), `both`, `none` |
| `color`, `width`, `dashed` | line appearance |
| `curve` | `auto` (default), `straight`, `curved` |
| `animated` | `true`: moving dashes along the edge |
| `hideLabel`, `labelColor`, `labelBackground`, `labelSize`, `labelFont` | label look, as for nodes |
| `description` | free text |
| `details` | extra fields, as for nodes |

Style precedence: **element value** > **type value** > built-in default. Node types accept every appearance field above (border and label included).

The hover tooltip and the details panel show information only (id, label, type, description, link), not appearance fields such as a long embedded image.

Bundled icons (`public/icons/`): `project`, `platform`, `tool`, `data`, `organization`, `format`, `rule`, `code` — white glyphs meant for `imageFit: "icon"` on a coloured node.

## Layout

```
src/
  model.js     JSON format: validation, type inheritance, conversion to/from Pivotick
  graph.js     Pivotick instance: styles, arrow markers, wiring of the native tools
  main.js      app shell: sidebar, import/export, autosave
  ocd.js       Open Contributions Descriptor import
  github.js    GitHub API client (cached)
  ui/          forms, modals, pills, GitHub card, DOM helpers
docs/          documentation site: content/*.md, home.html, guide.html, site.css
scripts/docs.mjs  builds docs/index.html, docs/guide.html, llms.txt, llms-full.txt (Vite plugin)
examples/      example graphs
schema/        JSON schema of the format
tests/         Vitest tests for the format
```

## Notes on Pivotick 2.0.1

A few workarounds live in `src/graph.js` and `src/style.css`, each with a comment:

- The constructor is `new Pivotick(container, data, options)` (the README's single-object form does not work).
- With a custom `onNodeEdit` body, Pivotick's *Edit Node* button throws; the app closes that modal and opens its own form instead.
- Custom edge labels are measured in screen pixels (0 px before layout, too wide when zoomed); CSS ignores that measurement and centres them.
- Outside node labels use one global style, so per-node label styles go into a generated stylesheet keyed by each node's DOM id — taken from `getMutableNodes()`, since `getNodes()` returns copies with fresh ids.
- `setStyle()` doesn't redraw a node's content; restyling goes through `updateData()`.
- `cover` images are drawn as squares over round shapes; CSS clips them.
- Pivotick's own node badges only fit three characters and read as status dots, so tags are drawn as SVG pills inside each node's group, re-added by a `MutationObserver` whenever Pivotick redraws the node.
- A harmless `SVGLength … relative length` error can appear in the console when a node is updated: it comes from a d3-zoom animation on Pivotick's hidden neighbour-graph canvas.

## Deployment

The **CI & GitHub Pages** workflow tests, builds and publishes the site to GitHub Pages on every push to `main` (enable *Settings ▸ Pages ▸ Source: GitHub Actions*).

## License

MIT. Tag icons: [Font Awesome Free](https://fontawesome.com) by Fonticons, Inc., icons under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
