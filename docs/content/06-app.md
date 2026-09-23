## Using the app

**Top bar.** *Add* creates a node or an edge. *Graph* starts a new graph, opens a file (a Pivograph document or an Open Contributions Descriptor), imports an organization from its domain, or loads the Rulezet example. *Export* saves the graph (see [Reports](#reports)).

**Side panel** (left, resizable by dragging its edge):

- *Nodes* and *Edges* list everything with its type and description. Click to select on the graph, double-click to edit. The filter box searches labels, types, descriptions and tags.
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

**View.** *Tags on graph* shows or hides every tag pill. Pivotick's *View* and *Physics* tools change the layout; the minimap and zoom controls sit on the right.

**Saving.** The map is kept in the browser automatically. *Export → Graph data (JSON)* downloads it (with positions, unless *positions* is unticked in the JSON tab). The other *Export* entries are described in [Reports](#reports).
