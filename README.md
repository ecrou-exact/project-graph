# Pivograph

Build a **graph of a project's connections** from a simple JSON file, then edit it with the mouse or through forms. Rendering and interaction are powered by the latest version of [Pivotick](https://pivotick.github.io/Pivotick/) (CIRCL).

Bundled example: projects linked to **Rulezet** (`examples/rulezet.json`).

## Features

- **Nodes**: label, type, description, link, colour, shape (circle, square, triangle, hexagon), size, image (URL, relative path, embedded local file, or one of the bundled icons), border (colour, width or none), and label (shown or hidden, text colour, background or none, size, font). The node form is split into tabs: Content, Links, Appearance, Border, Label, Badges.
- **Edges**: label, type, colour, width, solid/dashed line, and **arrow direction**: `→`, `←`, `↔` or no arrow.
- **Tags**: `#tags` on a node become coloured pills under it, with a colour and an optional icon (a curated set of Font Awesome Free icons, picked from a grid) per tag, shared by every node with that tag. Existing tags are suggested when typing; pills can be hidden per node or per type. A Tags tab lists and edits them.
- **Links**: a website, a GitHub repository and any number of other links per node. For the GitHub repository, the details panel and tooltip show its description, stars, forks, open issues, language, licence, topics and last update, fetched from the GitHub API (cached for 6 hours; the API allows 60 unauthenticated requests per hour).
- **Types**: a node or edge type defines default styling; every element can override it.
  *New* starts a graph with ready-to-use types (one per bundled icon, plus common relations such as *uses*, *depends on*, *integrates with*), all editable in the Types tab.
- **Two synchronised ways to edit**:
  - the app's own UI: `+ Node` / `+ Edge` buttons, filterable lists, double-click to edit;
  - Pivotick's tools: *Create ▸ Add node* (click on the canvas) and *Add edge* (click source, then target) open **the same form modal**; so do *Edit node* and *Edit edge*.
- Built-in **JSON editor** (JSON tab) with validation and error messages.
- Import (button, or drag & drop a `.json` file) and JSON export (with or without positions, to keep the layout).
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
| `links` | other links: `[{ "label": "Docs", "url": "https://…" }]` |
| `tags` | `["security", "cve"]` (or `"#security #cve"`) |
| `hideBadges` | `true` hides the tag pills |
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
| `description` | free text |

Style precedence: **element value** > **type value** > built-in default. Node types accept every appearance field above (border and label included).

The hover tooltip and the details panel show information only (id, label, type, description, link), not appearance fields such as a long embedded image.

Bundled icons (`public/icons/`): `project`, `platform`, `tool`, `data`, `organization`, `format`, `rule`, `code` — white glyphs meant for `imageFit: "icon"` on a coloured node.

## Layout

```
src/
  model.js     JSON format: validation, type inheritance, conversion to/from Pivotick
  graph.js     Pivotick instance: styles, arrow markers, wiring of the native tools
  main.js      app shell: sidebar, import/export, autosave
  ui/          forms, modals, DOM helpers
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
