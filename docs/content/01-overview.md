## Overview

Pivograph draws an organization as a graph: its projects, platforms, data sources and partners are **nodes**, and the ways they depend on, feed or maintain each other are **edges**. The whole map is one JSON document. You can write it by hand, generate it (an AI agent is a good fit), import it from an organization's published [Open Contributions Descriptor](#open-contributions-descriptor), then refine it in the browser.

Rendering and interaction come from [Pivotick](https://pivotick.github.io/Pivotick/), a graph library by CIRCL. Pivograph adds a document format, forms to edit every node and edge, types, tags, GitHub details, filters, and an embeddable read-only viewer.

- **App**: [ecrou-exact.github.io/project-graph](https://ecrou-exact.github.io/project-graph/) — open the bundled Rulezet example, or your own file.
- **Source**: [github.com/ecrou-exact/project-graph](https://github.com/ecrou-exact/project-graph) (MIT).
- **For AI agents**: [`llms.txt`](../llms.txt) and the full text of this page as [`llms-full.txt`](../llms-full.txt); the [JSON schema](pivograph.schema.json); [examples](#examples).

What a map contains:

| Part | What it holds |
|---|---|
| `nodes` | The things being mapped. Each has an id, a label, and optionally a type, a description, links, a GitHub repository, tags, extra details and its own look. |
| `edges` | Directed connections between two nodes: a label that says how they are related, an arrow direction, a type and a look. |
| `nodeTypes`, `edgeTypes` | Shared defaults. A node of type `project` takes the type's colour, shape, image and label style unless it sets its own. |
| `tags` | How each `#tag` is drawn: colour and icon. Tags appear as small pills under nodes and can filter the graph. |
| `meta` | Title, description and a few document settings. |

## Quick start

**In the browser.** Open the [app](https://ecrou-exact.github.io/project-graph/). It starts with the Rulezet example. The *Graph* menu opens a map (or drop a `.json` file on the page), imports an organization's Open Contributions Descriptor, or starts a new graph from ready-made types. *Add* creates nodes and edges. *Export* saves the map as JSON, or as a PDF or Markdown report with a picture of the graph. Changes are also kept in the browser between visits.

**From the command line.**

```bash
git clone https://github.com/ecrou-exact/project-graph.git
cd project-graph
npm install
npm run dev      # http://localhost:5173
npm test         # tests for the document format
npm run build    # static site in dist/
```

**The smallest valid document** has one node:

```json
{ "nodes": [{ "id": "rulezet" }] }
```

Everything else is optional. A missing label defaults to the id; missing types, tags and styles fall back to built-in defaults.
