## Architecture

Pivograph is a static web app built with [Vite](https://vite.dev), in plain JavaScript modules, with no server.

```text
src/
  main.js        app shell: state, side panel, import/export, embedding, autosave
  graph.js       GraphView: the Pivotick instance, styles, forms wired to Pivotick's tools, filters, tag pills
  model.js       the document format: parsing and validation, type inheritance, Pivotick styles
  ocd.js         Open Contributions Descriptor → document
  icons.js       node icons drawn on the node's colour
  badgeIcons.js  the bundled Font Awesome Free icons
  github.js      GitHub API client (cached, only used by the node form)
  ui/            forms, modals, tag pills, GitHub card, details rendering, DOM helper
examples/        example maps
schema/          JSON schema of the format
docs/            this documentation (Markdown, built into docs/index.html and llms-full.txt)
tests/           Vitest tests
```

**Data flow.** A JSON file goes through `parseDocument()` (model.js), which validates it and returns a normalized document with errors and warnings. `GraphView.load()` turns its nodes and edges into Pivotick elements (`toRawNode`, `toRawEdge`); from then on **Pivotick holds the nodes and edges**, and the app holds the document-level state (`meta`, `nodeTypes`, `edgeTypes`, `tags`). `view.toDocument()` reads them back for export and autosave.

**Styles are derived, never stored.** Every visual field lives in a node's or edge's data. `nodeStyle()` and `edgeStyle()` compute the Pivotick style from the data and the types, so an edit made anywhere — a form, Pivotick's own tools, a type change — restyles the element.

**Edits** from the app's forms go through `GraphView.updateNode()` / `updateEdge()` (Pivotick's `updateData()`). Pivotick's own create and edit tools are routed to the same forms through its callbacks (`onBeforeNodeCreate`, `onBeforeEdgeCreate`, `onNodeEdit`, `onEdgeEdit`).

**Things drawn outside Pivotick's styles:**

- Node label looks (colour, background, size, font) go into a generated stylesheet keyed by each node's DOM id.
- Tag pills are SVG groups added inside each node's group, redrawn by a `MutationObserver` whenever Pivotick redraws the node.
- Icons with `imageFit: "icon"` are redrawn as data URLs on the node's colour, so they stay visible in Pivotick's tooltip and panels.

**Pivotick 2.0.1 notes**, worked around in the code:

- The constructor is `new Pivotick(container, data, options)`.
- `getNodes()` returns copies with fresh DOM ids; `getMutableNodes()` returns the live nodes.
- `setStyle()` does not redraw a node's content; `updateData()` does.
- With a custom `onNodeEdit` body, the *Edit Node* button of Pivotick's modal fails; the app closes that modal and opens its own form.
- Custom edge labels are measured in screen pixels; CSS re-centres them.

## Development

```bash
npm run dev              # dev server with hot reload; the docs are served at /docs/
npm test                 # Vitest: document format, OCD import, icons
npm run build            # static site in dist/: the app, docs/, llms.txt, llms-full.txt
npm run update:pivotick  # install the latest Pivotick
```

Every push to `main` runs the tests, builds and deploys to GitHub Pages. A weekly workflow installs the latest Pivotick, runs the tests and the build, and opens a pull request if the version changed.

This documentation is written in `docs/content/*.md`. The build turns it into `docs/index.html` (static HTML, readable without JavaScript) and `llms-full.txt`, and publishes the schema and the examples next to it.

## For AI agents

| File | Content |
|---|---|
| [`/llms.txt`](../llms.txt) | Short index of this documentation, in the llms.txt format. |
| [`/llms-full.txt`](../llms-full.txt) | This whole page as Markdown. Read it before generating a map. |
| [`pivograph.schema.json`](pivograph.schema.json) | JSON schema of the document format. |
| [`examples/rulezet.json`](examples/rulezet.json) | A complete, checked map. |
| [`examples/minimal.json`](examples/minimal.json) | The smallest useful map. |

To produce a map, follow [Mapping an organization](#mapping-an-organization), write the document per [Document format](#document-format), and check it against the [validation](#validation) rules. Output only the JSON document.
