## Document format

A Pivograph document is a JSON object. All top-level keys are optional; unknown keys are ignored. The [JSON schema](pivograph.schema.json) describes the same format for validators.

```json
{
  "version": 1,
  "meta": { "title": "…", "description": "…" },
  "nodeTypes": { "project": { … } },
  "edgeTypes": { "uses": { … } },
  "tags": { "open-source": { … } },
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
| `readOnly` | boolean | Opens the map without editing tools until *Enable editing*. Set automatically on imported descriptors. |
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
| `shape` | string | `circle` | `circle`, `square`, `triangle` or `hexagon`. |
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

### Validation

Loading a document reports:

- **Errors** — the document is refused: the root is not an object; `nodes`, `edges`, `nodeTypes`, `edgeTypes` or `tags` has the wrong shape; a node has no id; two nodes share an id; an edge lacks `from` or `to`, or points to a node that does not exist.
- **Warnings** — the document loads, the listed value is ignored: an unknown `shape` or `direction`; a `type` not declared in `nodeTypes` / `edgeTypes`; a `github` value that is not a repository; a duplicate edge id (renamed).

## Examples

- [`examples/rulezet.json`](examples/rulezet.json): how Rulezet connects to ten other projects, with logos, detailed relationship descriptions, GitHub details and tags. It is the example the app opens with.
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
