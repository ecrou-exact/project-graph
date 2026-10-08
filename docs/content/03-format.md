## Document format

A Pivograph document is a JSON object. All top-level keys are optional; unknown keys are ignored. The [JSON schema](pivograph.schema.json) describes the same format for validators.

```json
{
  "version": 1,
  "meta": { "title": "…", "description": "…" },
  "nodeTypes": { "project": { … } },
  "edgeTypes": { "uses": { … } },
  "tags": { "open-source": { … } },
  "sections": [ { "title": "…", "x": 0, "y": 0, … } ],
  "arrows": [ { "from": { "node": "…" }, "to": { "section": "…" }, … } ],
  "nodes": [ { "id": "…", … } ],
  "edges": [ { "from": "…", "to": "…", … } ]
}
```

**Inheritance.** For every visual field, the value on the node or edge wins; otherwise its type's value is used; otherwise the built-in default. Leaving a field out is how you say "inherit".

### meta

| Field | Type | Description |
|---|---|---|
| `title` | string | Shown in the app's header and the browser tab. |
| `description` | string | What the map shows, the arrow convention, when facts were checked. |
| `linkDistance` | number | Edge length in the layout. Default `150`; raise it (200–350) for big nodes or long edge labels. |
| `fixedLayout` | boolean | Nodes stay exactly at their `x` / `y`: no force layout, as in a drawn diagram. *Add → Fixed layout* toggles it. |
| `readOnly` | boolean | Opens the map locked: it can be explored and exported, not edited. Set automatically on imported descriptors and on the bundled example. To change a locked map, edit its JSON file. |
| `source` | object | Where the map came from, e.g. `{ "format": "ocd", "domain": "misp-project.org" }`. Set by imports. |

### nodes

Each node is an object. Only `id` is required.

| Field | Type | Description |
|---|---|---|
| `id` | string or number | **Required.** Unique. Edges refer to it. Use lowercase-with-hyphens. |
| `label` | string | Displayed name. Defaults to the id. |
| `type` | string | A key of `nodeTypes`. Undeclared types load with a warning. |
| `description` | string | One or two sentences, shown in the details panel, the tooltip and the node list. |
| `url` | string | The node's website. |
| `graph` | string | Another graph that details this node, e.g. `examples/circl/misp.json` for an organisation and its projects: a Pivograph graph or an OCD file, as a URL or a path relative to the app. The details panel and the right-click menu offer *Open its graph*; a *←* button in the header leads back. |
| `github` | string | GitHub repository: `owner/repo`, or any github.com URL of the repository (normalized to `owner/repo`). |
| `githubInfo` | object | Repository summary saved by the app when a repository is fetched in the node form: `fullName`, `url`, `description`, `homepage`, `stars`, `forks`, `issues`, `language`, `license`, `topics`, `archived`, `pushedAt`, `fetchedAt`. Kept only together with `github`. You can fill it yourself from the GitHub API. |
| `links` | array | Other links: `[{ "label": "Documentation", "url": "https://…" }]`. `label` is optional. |
| `tags` | array or string | `["threat-intelligence", "python"]`, or `"#threat-intelligence #python"`. Normalized to lowercase, spaces become hyphens, duplicates removed. |
| `details` | object | Extra facts shown in the details panel: strings, numbers, booleans, lists, or nested objects of those. Nested objects are shown as sub-sections. Empty values are dropped. |
| `x`, `y` | number | Saved position. Both are needed. Export keeps positions unless you untick *positions*. |

**Look** (each can also be set on a node type):

| Field | Type | Default | Description |
|---|---|---|---|
| `color` | CSS colour | `#4f7cff` | Fill colour. `transparent` works, e.g. for logos. |
| `shape` | string | `circle` | `circle`, `square`, `triangle`, `hexagon`, or `card`: a rounded box with the image and the label **inside** (see below). |
| `size` | number | `14` | Radius in pixels. |
| `image` | string | | URL, path relative to the app (`icons/tool.svg`, `logos/misp.png`), or `data:` URL. |
| `imageFit` | string | `cover` | `cover` (fills the shape), `contain` (whole image inside), `icon` (a glyph on the node's colour), `frame` (square shape framing the image). |
| `borderColor` | CSS colour | `#ffffff` | Outline colour. |
| `borderWidth` | number | `2` | Outline width; `0` removes it. |
| `hideLabel` | boolean | `false` | Hide the label, e.g. when the image already shows the name. |
| `labelColor` | CSS colour | | Label text colour. |
| `labelBackground` | CSS colour or `"none"` | | Label background; `"none"` for no background. |
| `labelSize` | number | auto | Label font size in pixels. |
| `labelFont` | string | | `sans`, `serif`, `mono`, `rounded`, `condensed`, or any CSS `font-family`. |
| `hideBadges` | boolean | `false` | Hide the tag pills under the node. |

**Card nodes** (`shape: "card"`) draw the box of a diagram: the image (if any), then the label and an optional `subtitle`, inside the box; edges and arrows end on its border. `color` is the background (default white), `borderColor` / `borderWidth` the border, `labelColor` / `labelSize` / `labelFont` the text (`\n` starts a new line). `size` and `imageFit` don't apply.

| Field | Type | Default | Description |
|---|---|---|---|
| `subtitle` | string | | Second line, under the image and label. |
| `width`, `height` | number | its content | Box size in pixels. |
| `padding` | number | `16` | Space between the border and the content: raise it to give logos more room. |
| `imageSize` | number | `56` | Image height in pixels. |
| `imagePosition` | string | `top` | `top` (image above the label) or `left` (beside it). |

`labelFont` also accepts `hand`: Excalidraw's hand-drawn font (Virgil, bundled).

Bundled images: `icons/project.svg`, `platform`, `tool`, `data`, `organization`, `format`, `rule`, `code` (white glyphs for `imageFit: "icon"`).

### edges

Each edge is an object with `from` and `to`.

| Field | Type | Description |
|---|---|---|
| `from`, `to` | string or number | **Required.** Node ids. Both nodes must exist. |
| `id` | string | Unique. Defaults to `from-to` (with a suffix if needed). |
| `label` | string | How the two are related: a short verb phrase shown on the edge. |
| `type` | string | A key of `edgeTypes`. |
| `description` | string | The mechanism behind the relationship. |
| `details` | object | Extra facts, as for nodes (API endpoints, authentication, sources…). |

**Look** (each can also be set on an edge type):

| Field | Type | Default | Description |
|---|---|---|---|
| `direction` | string | `forward` | `forward` (arrow at `to`), `backward` (arrow at `from`), `both`, `none`. |
| `color` | CSS colour | `#8a94a6` | Line and arrow colour. |
| `width` | number | `2` | Line width. |
| `dashed` | boolean | `false` | Dashed line. |
| `curve` | string | `auto` | `auto` (straight, curved only between nodes with several edges), `straight`, `curved`. |
| `animated` | boolean | `false` | Moving dashes along the edge, showing the flow. |
| `hideLabel` | boolean | `false` | Hide the label. |
| `labelColor`, `labelBackground`, `labelSize`, `labelFont` | | | As for nodes. |

### nodeTypes and edgeTypes

Objects keyed by type name. A node type accepts `label` (display name) and every node **look** field; an edge type accepts `label` (the default edge label) and every edge **look** field.

```json
"nodeTypes": {
  "project": { "label": "Project", "color": "#3b63f3", "shape": "hexagon", "size": 24,
               "image": "icons/project.svg", "imageFit": "icon" },
  "dataset": { "label": "Open data", "color": "#c2860b", "image": "icons/data.svg", "imageFit": "icon" }
},
"edgeTypes": {
  "uses":  { "label": "uses", "color": "#0f9d8a" },
  "feeds": { "label": "feeds", "color": "#c2860b", "animated": true },
  "sync":  { "label": "syncs with", "direction": "both", "dashed": true }
}
```

### tags

Tags are declared on nodes. The top-level `tags` object only sets how a tag is drawn; tags without an entry get a colour derived from their name.

| Field | Type | Description |
|---|---|---|
| `color` | CSS colour | Pill colour; the text turns black or white for contrast. |
| `icon` | string | A bundled Font Awesome Free icon name. |

```json
"tags": {
  "open-source": { "color": "#2f9e44", "icon": "github" },
  "threat-intelligence": { "color": "#d6384b", "icon": "shield-halved" }
}
```

Available icons: `shield-halved`, `bug`, `virus`, `skull`, `lock`, `key`, `fingerprint`, `triangle-exclamation`, `circle-info`, `circle-question`, `check`, `xmark`, `star`, `flag`, `tag`, `heart`, `fire`, `bolt`, `bell`, `lightbulb`, `eye`, `magnifying-glass`, `database`, `server`, `cloud`, `network-wired`, `globe`, `link`, `code`, `terminal`, `gear`, `wrench`, `cube`, `robot`, `rocket`, `chart-line`, `clock`, `book`, `file-lines`, `graduation-cap`, `user`, `users`, `building`, `handshake`, `scale-balanced`, `money-bill`, and the brands `github`, `gitlab`, `python`, `js`, `rust`, `docker`, `linux`, `windows`, `apple`, `android`, `aws`, `google`, `slack`, `discord`, `mastodon`.

### sections

Titled frames drawn behind the graph ("Incident response", "Sensors"…), for the picture only: they hold no nodes and edges don't point to them. Add one with *Add → Section*; drag its title to move it, its bottom-right corner to resize it, double-click its title to edit it (or use the Sections tab). Pair them with `meta.fixedLayout` so the nodes stay inside. They are part of the PNG export.

| Field | Type | Default | Description |
|---|---|---|---|
| `x`, `y` | number | | **Required.** Top-left corner, in graph coordinates (the same as the nodes' `x` / `y`). |
| `width`, `height` | number | `400`, `240` | Size. |
| `title` | string | | Shown in the top-left corner. |
| `color` | CSS colour | grey | Title colour, and the line under it. |
| `underline` | boolean | when `color` is set | Line under the title. |
| `titleSize` | number | `22` | Title font size in pixels. |
| `titleFont` | string | | As `labelFont`. |
| `fill` | CSS colour or `"none"` | light grey | Background; `"none"` for a bare title (e.g. the diagram's heading). |
| `borderColor` | CSS colour or `"none"` | grey | Border. |
| `id` | string | from the title | Unique. |

```json
"meta": { "title": "SOC stack", "fixedLayout": true },
"sections": [
  { "title": "Incident response", "x": 20, "y": 115, "width": 750, "height": 420, "color": "#1971c2" },
  { "title": "Sensors", "x": 20, "y": 880, "width": 1660, "height": 250 }
]
```

### arrows

Arrows drawn by Pivograph, like sections, for diagrams: unlike an edge, an arrow can start or end on a **section** or on **a free point**, and each end can sit **anywhere** on its target. Add one with *Add → Arrow*; click it on the graph to select it, then drag its ends (onto a node, a section or empty space) and its label; Delete removes it, a double-click edits it. Arrows are part of the PNG export, not of the report.

| Field | Type | Default | Description |
|---|---|---|---|
| `from`, `to` | object | | **Required.** `{ "node": "id" }`, `{ "section": "id" }` or `{ "x": 0, "y": 0 }`. Add `"at": [u, v]` to place the end on the target's box: `[0, 0]` top-left, `[1, 1]` bottom-right, `[0.5, 1]` the middle of the bottom side. Without `at`, the end sits on the side facing the other end (straight up or down from a section). |
| `label` | string | | `\n` starts a new line. |
| `description` | string | | Shown when the pointer is over the arrow. |
| `direction` | string | `forward` | As for edges: `forward`, `backward`, `both`, `none`. |
| `route` | string | `straight` | `straight` or `elbow` (right angles). |
| `color`, `width`, `dashed` | | `#343a40`, `2`, `false` | Line. |
| `labelColor`, `labelSize`, `labelFont`, `labelBackground` | | line colour, `14` | Label; the background defaults to the page colour, `"none"` for none. |
| `labelOffset` | [dx, dy] | `[0, 0]` | Shift of the label from the middle of the arrow (set by dragging it). |

```json
"arrows": [
  { "from": { "node": "misp", "at": [0.5, 1] }, "to": { "section": "pipeline" },
    "direction": "both", "label": "4) Feed detections\n(IoCs) & sightings", "color": "#1c5cff" }
]
```

### Validation

Loading a document reports:

- **Errors** — the document is refused: the root is not an object; `nodes`, `edges`, `nodeTypes`, `edgeTypes` or `tags` has the wrong shape; a node has no id; two nodes share an id; an edge lacks `from` or `to`, or points to a node that does not exist.
- **Warnings** — the document loads, the listed value is ignored: an unknown `shape` or `direction`; a `type` not declared in `nodeTypes` / `edgeTypes`; a `github` value that is not a repository; a duplicate edge id (renamed).

## Examples

- [`examples/rulezet.json`](examples/rulezet.json): how Rulezet connects to ten other projects, with logos, detailed relationship descriptions, GitHub details and tags. It is the example the app opens with.
- [`examples/circl.json`](examples/circl.json): the GitHub organisations managed or co-managed by CIRCL, from [new.circl.lu](https://new.circl.lu/projects/github-organisations/). CIRCL in the centre and 21 organisations around it, each with its logo, description, website, most starred repository (`githubInfo`) and most used topics as tags. Generated by `node scripts/circl-example.mjs` from the GitHub API.
- [`examples/ngsoti-soc-stack.json`](examples/ngsoti-soc-stack.json): a drawn diagram — the NGSOTI SOC stack (sensors, Tenzir pipeline, MISP, flowintel, AIL) with Rulezet: card nodes, sections, arrows, a fixed layout and the hand-drawn font. It opens read-only (*Graph → NGSOTI SOC stack example*).
- [`examples/minimal.json`](examples/minimal.json): the smallest useful map — two types, three nodes, two edges.

A compact example with the main features:

```json
{
  "version": 1,
  "meta": {
    "title": "Projects linked to Rulezet",
    "description": "Arrow = who uses whom. Checked against each project's code, September 2026.",
    "linkDistance": 260
  },
  "nodeTypes": {
    "project": { "label": "Project", "color": "#3b63f3", "shape": "hexagon", "size": 24,
                 "image": "icons/project.svg", "imageFit": "icon" }
  },
  "edgeTypes": {
    "uses": { "label": "uses", "color": "#0f9d8a", "direction": "forward" }
  },
  "tags": { "threat-intelligence": { "color": "#d6384b", "icon": "shield-halved" } },
  "nodes": [
    {
      "id": "rulezet", "label": "Rulezet", "type": "project",
      "description": "Community platform for sharing and managing detection rules.",
      "url": "https://rulezet.org", "github": "rulezet/rulezet-core",
      "tags": ["threat-intelligence", "yara"]
    },
    {
      "id": "vulnerability-lookup", "label": "Vulnerability-Lookup", "type": "project",
      "description": "Vulnerability lookup and correlation.",
      "github": "vulnerability-lookup/vulnerability-lookup",
      "links": [{ "label": "Public instance", "url": "https://vulnerability.circl.lu" }]
    }
  ],
  "edges": [
    {
      "from": "rulezet", "to": "vulnerability-lookup", "type": "uses",
      "label": "fetches CVE & EPSS data",
      "description": "Rulezet uses Vulnerability-Lookup as its CVE reference: every CVE shown on a rule links to its vulnerability.circl.lu page.",
      "details": { "Source": "https://github.com/rulezet/rulezet-core" }
    }
  ]
}
```
