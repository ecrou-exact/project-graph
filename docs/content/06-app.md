## Using the app

**Top bar.** *Search the docs* finds a section of this guide as you type (↑ ↓ and Enter to open it). *Arrange* places the nodes (see below). *Graph* starts a new graph, opens a file (a Pivograph document, an Open Contributions Descriptor or a Mermaid flowchart), imports an organization from its domain or a Mermaid flowchart from text, or loads an example. *Export* saves the graph (see [Reports](#reports)).

**Side panel** (left, resizable by dragging its edge):

- *Nodes* and *Edges* list everything with its type and description. Click to select on the graph, double-click to edit. On a read-only map, double-clicking a node (in the list or on the graph) opens its website in a new tab instead. The filter box searches labels, types, descriptions and tags.
- *Tags* and *Types* list tags and types. Click one to **filter** the graph by it (click again to remove; several combine). Double-click to edit its colour, icon or style.
- *JSON* shows the document; edit it and press *Apply*.

**Editing a node** (double-click, right-click → *Edit node*, or the *Create* tools on the canvas) opens a form in tabs:

| Tab | Fields |
|---|---|
| Content | Label, id, type, description |
| Links | Website, GitHub repository, other links |
| Details | Extra fields, edited by path (`repository.url`) |
| Appearance | Colour, shape, size, image, image fit |
| Border | Width (0 = none), colour |
| Label | Shown or hidden, size, font, text colour, background |
| Badges | Tags (existing tags are suggested), show or hide the tag pills |

**Editing an edge** (double-click, or right-click → *Edit Edge*) opens a form with a live preview: *Content* (source, target, swap, how they are related, type, arrow direction), *Line* (colour, width, solid or dashed, shape, moving dashes), *Label* and *Details*. Drawing a new edge on the canvas (*Create* → *Add edge*, then click the source and the target) opens the same form.

**GitHub details.** Entering a repository in a node's *Links* tab fetches its description, stars, forks, open issues, language, licence, topics and last update from the GitHub API, and saves them with the node (`githubInfo`). *Refresh from GitHub* fetches them again; *Also add the repository topics as tags* copies the topics into the node's tags. Nothing else calls the API: showing or importing a map never does, which keeps within the limit of 60 unauthenticated requests per hour.

**Filtering.** Pivotick's *Filter Graph* panel filters by tags (every tag is offered), type, label, description and, for OCD projects, status and license; relationship types can be switched on and off. Filters set from the side panel and from *Filter Graph* are the same; active filters are listed at the top of the side panel with *Clear*.

**The rail** (on the left of the canvas) is Pivotick's: *Select*, *Create* (add a node, an edge or a **note**; Pivotick's notes can be attached to a node or an edge), *View*, *Physics* — and Pivograph's **Draw** mode (D) under them:

- *Connect* — click two things, or drag from one to the other, to link them: two nodes get an edge, anything else (a note, a shape, a drawing, a section, a point) an arrow;
- *Pen* — drag to draw by hand (colour and width in the panel);
- *Text*, *Section*, *Arrow…* (the arrow form), *Legend* (the types in use, with their look);
- a button per shape: rectangle, rounded, ellipse, diamond, triangle, hexagon, star, cloud, cylinder, speech bubble, icon, picture.

Escape leaves Connect or Pen. Click a shape, a drawing or an arrow and press Delete to remove it.

**Drawing a diagram.** Nodes can take flowchart shapes with the text inside: card, pill, ellipse, diamond, cylinder, document, parallelogram (*Appearance → Shape*). The *Drawing* tab lists sections, notes, shapes, drawings and arrows.

**Arranging.** The *Arrange* menu places every node once, then fixes the layout: *Tree, top to bottom* and *Tree, left to right* follow the edges like a flowchart (cycles are broken, crossings reduced), *Grid* puts them in rows grouped by type, *Circle* puts them in a ring (a hub goes in the middle), *Snap to grid* rounds the positions to 20 px to line nodes up. The new layout is centred where the graph was, so sections and notes stay around it. *Undo the last arrangement* puts the nodes back.

**Mermaid flowcharts.** *Graph → Import a Mermaid flowchart…* turns text into an editable diagram — the `flowchart LR` / `graph TD` syntax of GitHub, GitLab, Notion or Obsidian. Shapes (`A[box]`, `A(rounded)`, `A([pill])`, `A((circle))`, `A{decision}`, `A[(database)]`, `A>document]`, `A[/in-out/]`), links (`-->`, `---`, `-.->`, `==>`, `<-->`, with `|label|` or `-- label -->`), chains and `&` groups, `subgraph … end` (they become sections), and colours from `style`, `classDef`, `class` and `:::class` are read; the rest is skipped with a warning. Opening or dropping a `.mmd` file — or a Markdown file holding a ```` ```mermaid ```` block — does the same.

```
flowchart LR
  sensors([Sensors]) -->|alerts| triage{Relevant?}
  triage -- yes --> misp[(MISP)]
  triage -. no .-> archive[Archive]
  subgraph ir [Incident response]
    misp --> case[/Case in flowintel/]
  end
```

**View.** *Tags on graph* shows or hides every tag pill. Pivotick's *View* and *Physics* tools change the layout; the minimap and zoom controls sit on the right.

**Saving.** A map you create is kept automatically **in your browser only** (local storage): nothing is sent to GitHub or to any server, and other visitors never see it. The Rulezet example and imported descriptors are locked: they can be explored and exported, not edited. *Export → Graph data (JSON)* downloads it (with positions, unless *positions* is unticked in the JSON tab). The other *Export* entries are described in [Reports](#reports).
