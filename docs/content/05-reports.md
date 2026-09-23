## Reports

*Export* offers five formats:

| Menu entry | File | Content |
|---|---|---|
| Graph data (JSON) | `<title>.json` | The document, to open again or edit later. |
| Pivotick data (JSON) | `<title>.pivotick.json` | The graph for Pivotick alone, without Pivograph: nodes and edges with their computed styles, positions and embedded images, plus the options they need. |
| Report (PDF) | via the print dialog | A picture of the graph, then a text written from every field. Choose *Save as PDF*. |
| Report (Markdown) | `<title>.md` | The same report as Markdown, with the picture embedded. |
| Picture (PNG) | `<title>.png` | The whole graph as drawn, whatever the zoom. |

**Pivotick data.** The file is self-contained and loads in any page that has Pivotick:

```js
const file = await (await fetch('map.pivotick.json')).json()
new Pivotick(container, file, file.options)
```

- `nodes` and `edges` are Pivotick's raw nodes and edges (`{ id, data, style }`, `{ id, from, to, data, style }`), with `x` and `y` when positions are kept.
- Logos and icons are embedded as data URLs, so the file shows them anywhere. An image from another site that doesn't allow cross-origin requests stays a link, and the app says so.
- `options` holds the arrow markers (`pg-arrow`, `pg-arrow-start`) and the link distance. Without them, Pivotick draws the edges without arrow heads.
- An edge label inherited from the edge type is copied into `data.label`, the field Pivotick's default label renderer reads.

The file keeps everything Pivotick draws: colours, shapes, sizes, images, borders, line styles, arrows, edge labels. It does not keep what Pivograph draws on top of Pivotick: the tag pills, and the colour, background and font of node and edge labels. Pivotick shows those labels in its default style.

### The picture

The graph is drawn as it looks in the app, with images, labels and tag pills included. The picture covers the whole graph, not just the visible part, at twice the screen resolution, and is at most 4000 pixels on its longest side. Images from another site are left out unless that site allows cross-origin requests.

### The report protocol

The content is decided by `reportModel()` in `src/report.js`, and laid out by `buildReport()` (Markdown) and `reportHtml()` in `src/reportPrint.js` (PDF). The rules are fixed, so any graph gives a complete report and the same document always gives the same text:

1. **Title** from `meta.title` (default *Untitled graph*), then the picture, then `meta.description`.
2. **Overview.** The number of nodes, by type; the number of relationships, by edge type when there are several; the three most connected nodes (two relationships or more); the nodes without any relationship; the most used tags.
3. **Nodes**, grouped by type in their order of first appearance, with untyped nodes last under *Other*. For each node:
   - "*Label* is a *type*." followed by its description;
   - website, GitHub repository (with the saved `githubInfo`: description, stars, forks, open issues, language, licence, last update, topics not already in the tags, and the date of the data), other links, tags;
   - `details` as a nested list, with keys shown with `_` replaced by spaces and URLs as links;
   - every relationship of the node, as a sentence.
4. **Relationships**, grouped by edge type. A relationship that has a description or details gets its own entry with them. The others are merged when only their object differs: "**MISP Project** maintains **MISP**, **PyMISP** and **misp-modules**."
5. **Tags**: every tag, with its nodes.
6. A footer with the date and the counts.

**How a relationship becomes a sentence.** The subject is the node the arrow starts from. With `direction` set to `forward` (the default) or `none`, that is the source (`from`); with `backward`, it is the target. The label is the edge's own `label`, else its type's label, else its type id with `_` and `-` turned into spaces. A final parenthesis in the label is moved to the end of the sentence. The label is then read by its words:

| Label | Kind | Sentence |
|---|---|---|
| `uses`, `depends on`, `draws graphs with` | verb, alone or ending with a preposition | **A** uses **B**. |
| `pushes rules as MISP events` | verb with its own object | **A** pushes rules as MISP events (→ **B**). |
| `member of`, `affiliated with`, `used by` | state (ends with a preposition, or starts with a participle) | **A** is member of **B**. |
| `API`, `upstream` | noun | **A** is linked to **B** (API). |
| none | — | **A** is linked to **B**. |

A word counts as a verb when it ends in *s* (*uses*, *pushes*), or when it is one of *is*, *are*, *was*, *has*, *have*, *can*, *will*, *may*, *must*, *does*, *use*. A label that starts with a capital letter is read as a noun. With `direction: "both"`, the sentence ends with "in both directions". An edge from a node to itself reads "… itself".

**Writing labels that read well.** Use a lowercase verb phrase from the source's point of view: `uses`, `depends on`, `fetches data from`, `is funded by`. The same label then reads well on the graph and in the report.

### The PDF layout

The PDF and the Markdown file say the same thing; the PDF lays it out with the graph's own colours:

- the first page: title, description, a legend of the node types (colour and count) and relationship types (a sample of their line), the picture, and the overview;
- each node with a bar in its colour, its logo or icon, its type, its links, its GitHub statistics, its tags as coloured pills with their icons, its details as a table, and its relationships;
- each relationship type with a sample of its line, colour and dashes included;
- the tag index as pills, and a running header with the title and the date on every page.

The page has no margin of its own, so the browser prints no header or footer (address, date) over the report. Use *Save as PDF* with the default options; keep *Background graphics* on if the browser offers it.

### From the command line

```bash
npm run report -- examples/rulezet.json report.md
npm run report -- open-contributions.json report.md --image graph.png
```

The command runs the same protocol on a Pivograph document or an Open Contributions Descriptor. Making the picture needs a browser, so the command can only link one you pass with `--image`.
