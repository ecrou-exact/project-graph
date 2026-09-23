## Hugo

A site built with [Hugo](https://gohugo.io) can show a graph with the Pivograph component (`hugo/pivograph` in the repository). **Hugo builds the graph's JSON itself**, from the site's pages or from a data file, and every graph works with and without JavaScript:

| | Without JavaScript | With JavaScript |
|---|---|---|
| Picture | The graph **drawn by Hugo as SVG** at build time: nodes with their shape, colour, logo, label and tag pills; edges with their colour, dashes, arrows and labels. A node is a link to its entry in the text, and shows its name on hover. | The **interactive graph** (the Pivograph app in an iframe) replaces the picture: zoom, drag, search, filters by tag, type and relationship, details panel. If the app can't load, the picture comes back. |
| Text | The graph written out: every node with its links, GitHub facts, tags and details, and every relationship as a sentence ([report protocol](#the-report-protocol)). Read by search engines and screen readers. | The same text, folded under *Read the graph as text*. |
| Data | `/pivograph/<name>.json`, linked under the graph. | The same file, handed to the app. |

The same page of the [example site](../hugo-example/projects/), both ways:

<div class="shots">
<figure>
<a href="../hugo-example/projects/?pivograph=static"><img src="assets/hugo-without-js.png" alt="The Rulezet graph drawn by Hugo as SVG: logos, labels, tag pills and coloured arrows, without JavaScript" loading="lazy" width="1060" height="723"></a>
<figcaption><strong>Without JavaScript</strong>: the picture Hugo draws at build time, followed by the text. <a href="../hugo-example/projects/?pivograph=static">Open it</a></figcaption>
</figure>
<figure>
<a href="../hugo-example/projects/?pivograph=interactive"><img src="assets/hugo-with-js.png" alt="The same graph in the interactive Pivograph app, with its search, filter and view tools" loading="lazy" width="1062" height="678"></a>
<figcaption><strong>With JavaScript</strong>: the interactive graph, with search, filters and zoom. <a href="../hugo-example/projects/?pivograph=interactive">Open it</a></figcaption>
</figure>
</div>

The example's source: [hugo/example](https://github.com/ecrou-exact/project-graph/tree/main/hugo/example).

```text
hugo/example/
  hugo.toml                     theme = "pivograph" (a real site: ["my-theme", "pivograph"])
  content/
    projects/
      _index.md                 graph: title, nodeTypes, edgeTypes · {{< pivograph >}}
      rulezet/
        index.md                graph: type, url, github, image, relations
        logo.png
      misp/
        index.md
        logo.png
      …                         one bundle per project
    circl/
      _index.md                 the CIRCL GitHub organisations · {{< pivograph >}}
      circl/  misp/  …          one bundle per organisation, with its logo and GitHub facts
```

`hugo` then writes `public/pivograph/projects.json` and `public/pivograph/circl.json`, the documents the pages show. Both sections are generated from the app's examples by `node scripts/hugo-example.mjs`.

### Add it to a Hugo site

1. **Copy the component** into the site's `themes/` folder:

   ```bash
   git clone --depth 1 https://github.com/ecrou-exact/project-graph /tmp/project-graph
   cp -r /tmp/project-graph/hugo/pivograph themes/pivograph
   ```

   Or as a Hugo Module: `[[module.imports]] path = "github.com/ecrou-exact/project-graph/hugo/pivograph"` (needs Go).

2. **Enable it** in `hugo.toml`, **after** the site's theme. A single `theme = "x"` becomes a list:

   ```toml
   theme = ["my-theme", "pivograph"]
   ```

   The component adds a shortcode and partials under `pivograph/`; it doesn't change any existing page, layout or style.

3. **Give it data**: the site's pages ([option A](#a-graph-from-the-sites-pages)) or a data file ([option B](#a-graph-from-a-data-file)).

4. **Place the graph** with the shortcode in a Markdown page, or with the partial in a layout:

   ```text
   {{< pivograph >}}
   ```

   ```go-html-template
   {{ partial "pivograph/embed.html" (dict "page" . "section" "/projects") }}
   ```

5. **Check**: run `hugo`. It must print no `WARN` from pivograph. Then open the page: with JavaScript you get the interactive graph; add `?pivograph=static` to the address (or turn JavaScript off) to see the version without JavaScript, the picture drawn by Hugo and the text. That choice holds for the browser tab, and the site's links keep it, until `?pivograph=interactive`.

Requirements: Hugo 0.130 or later, standard or extended edition. Nothing to install with npm, no build step besides Hugo.

### A graph from the site's pages

Use this when the site already has one page per project, team, product… Every page below the section whose front matter has a `graph` map becomes a node; its `relations` are its outgoing edges.

```yaml
# content/projects/rulezet/index.md   (a page bundle: logo.png sits next to it)
---
title: Rulezet                        # the node's label
description: Community platform for sharing and managing detection rules.
tags: [cti, yara]                     # the node's tags (the site's own taxonomy)
graph:
  type: project
  url: https://rulezet.org
  github: rulezet/rulezet-core
  image: logo.png
  relations:
    - to: misp                        # id of another node: its file or bundle name
      label: pushes rules as MISP events
      type: uses
      description: Admins register MISP servers in Rulezet…
    - to: vulnerability-lookup
      label: fetches CVE data from
---
```

The section's `_index.md` holds the graph's title and its types, and places it:

```yaml
# content/projects/_index.md
---
title: Projects linked to Rulezet
description: How Rulezet connects to the other projects of its ecosystem.
graph:
  nodeTypes:
    project: { label: Project, shape: circle, size: 44, imageFit: contain }
  edgeTypes:
    uses: { label: uses, color: "#0f9d8a" }
---

{{< pivograph >}}
```

**Front matter reference**

| Where | Key | Becomes | Default |
|---|---|---|---|
| node page | `title` | node `label` | |
| node page | `description` | node `description` | |
| node page | `tags` | node `tags` | |
| node page | `graph.id` | node `id` | the file name (`misp.md`) or bundle name (`misp/index.md`) |
| node page | `graph.label`, `graph.description`, `graph.tags` | override the three above | |
| node page | `graph.image` | node `image`: a page resource (`logo.png`), a site path (`/images/x.png`), a URL, or an icon of the app (`icons/tool.svg`) | |
| node page | `graph.x`, `graph.y` | the node's position, used by the app and by the picture | computed |
| node page | `graph.<field>` | any other [node field](#nodes): `type`, `url`, `github`, `links`, `details`, `color`, `shape`, `size`, `imageFit`, `githubInfo`… | |
| node page | `graph.relations[]` | edges from this node: `to` (required) and any [edge field](#edges): `label`, `type`, `direction`, `description`, `details`, `color`, `dashed`… | |
| section `_index.md` | `title`, `description` | `meta.title`, `meta.description` | |
| section `_index.md` | `graph.nodeTypes`, `graph.edgeTypes`, `graph.tags`, `graph.linkDistance`, `graph.meta` | the same document keys | |

Rules the component applies:

- Every node gets a *Site page* link back to its page.
- A relation to an id that no page has is dropped, with a build warning naming the page (`pivograph: content/projects/x.md: relation to "y" ignored`), so the app never refuses the file.
- Graphs shown on a site open read-only.
- Hugo lowercases front-matter keys; the component restores Pivograph's names (`imagefit` → `imageFit`). Hugo also sorts map keys, so `details` come out in alphabetical order.
- Node order is the section's page order (weight, date, then title).

### A graph from a data file

Use this for a graph made in the app. *Export → Graph data (JSON)* in Pivograph, save the file as `data/pivograph/<name>.json` (or write it as `.yaml` / `.toml`), and show it anywhere:

```text
{{< pivograph data="ecosystem" >}}
```

Export with *positions* ticked (JSON tab) and the picture drawn without JavaScript keeps the app's layout. Without positions, Hugo lays the graph out itself: the most connected node in the centre when it links to at least half of the others, the rest on rings around it.

### Parameters

The shortcode and the partial take the same parameters.

| Parameter | Default | Effect |
|---|---|---|
| `section` | the current section | Build the graph from another section: `section="/projects"`. |
| `data` | | Use `data/pivograph/<name>.*` instead of pages. |
| `app` | `params.pivograph.app`, else `https://ecrou-exact.github.io/project-graph/` | The Pivograph app that draws the interactive graph. |
| `height` | `75vh` | Height of the interactive graph. |
| `sidebar` | `false` | Show the app's side panel (node list, tags, types). |
| `tags` | `true` | Show the tag pills on the interactive graph. |
| `picture` | `true` | `false` leaves out the picture drawn by Hugo. |
| `image` | | A picture of your own (e.g. *Export → Picture* in the app) shown instead of Hugo's. |
| `level` | `3` | Heading level of the text's sections. |
| `text` | `true` | `false` leaves the text out. Not recommended: without JavaScript, only the picture would remain. |

Site-wide setting, in `hugo.toml`:

```toml
[params.pivograph]
  app = "https://ecrou-exact.github.io/project-graph/"
```

To host everything yourself, copy the app's build (`npm run build`, the `dist/` folder) into `static/pivograph/` and set `app = "/pivograph/"`.

To use the data in your own templates: `{{ $doc := partial "pivograph/document.html" (dict "page" . "section" "/projects") }}`, then `$doc.nodes`, `$doc.edges`… The picture alone: `{{ partial "pivograph/svg.html" (dict "doc" $doc) | safeHTML }}`.

### How it works

- **Build time (Hugo, no JavaScript).** `document.html` reads the pages or the data file and returns the document; `embed.html` publishes it as `/pivograph/<name>.json` with `resources.FromString`, then writes the picture (`svg.html`, laid out by `layout.html`), the text (`text.html`, sentences by `sentence.html`) and a caption with a link to the data.
- **In the browser (JavaScript).** Unless the address has `?pivograph=static`, the script (`assets/pivograph/pivograph.js`) hides the picture, folds the text, opens the app in an iframe, fetches the JSON from the site itself, embeds the site's images in it as data URLs, and hands it over with the [`pivograph:load` message](#embedding). The app never loads anything from the site, so no CORS setup is needed, an `https` app works with an `http` site, and the app's picture and PDF exports keep the logos.

### Checklist

- [ ] `hugo` builds with no `WARN` or `ERROR` from pivograph.
- [ ] `/pivograph/<name>.json` loads in the Pivograph app (*Graph → Open a file…*) with no error or warning.
- [ ] Without JavaScript (open the page with `?pivograph=static`, or turn JavaScript off: in Firefox, F12 → F1 → *Disable JavaScript*; in Chrome, F12 → Ctrl+Shift+P → *Disable JavaScript*): the picture shows every node and arrow, and the text lists every node and relationship.
- [ ] With JavaScript on: the interactive graph shows, with its logos, and *Read the graph as text* opens the text.
- [ ] Every relationship reads well as a sentence in the text (see [how a relationship becomes a sentence](#the-report-protocol)); reword labels that don't.

### Prompt for an AI agent

```text
Add a Pivograph graph to this Hugo site, following
https://ecrou-exact.github.io/project-graph/docs/guide.html#hugo exactly.

1. Copy hugo/pivograph from https://github.com/ecrou-exact/project-graph into
   themes/pivograph and add "pivograph" after the current theme in hugo.toml.
2. For every page of <section> that describes <what the nodes are>, add a
   `graph` map to its front matter: type, url, github, image when known, and
   `relations` to the other pages (to: <file or bundle name>, label: a
   lowercase verb phrase from this page's point of view).
3. In <section>/_index.md, declare nodeTypes and edgeTypes under `graph`
   and put {{< pivograph >}} where the graph should appear.
4. Run `hugo`: fix every "pivograph:" warning. Check that the page works with
   JavaScript on (interactive graph) and off (SVG picture and text).
Do not change the site's theme, layouts or other pages.
```

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| I can't see the picture drawn by Hugo | With JavaScript on, the interactive graph replaces it. Open the page with `?pivograph=static`, or turn JavaScript off, to see it. |
| `can't evaluate field Pi`, `math.Sin` not defined | Hugo is older than 0.130. Update Hugo (distribution packages are often older; use a [release](https://github.com/gohugoio/hugo/releases)). |
| `pivograph: … relation to "x" ignored` | No page has the graph id `x`. Use the target's file or bundle name, or set `graph.id` on it. |
| The interactive graph stays empty | The page's Content Security Policy blocks the iframe or the fetch: allow the app's origin in `frame-src`, and `connect-src 'self'`, `img-src 'self' data:`. |
| Logos missing in the picture | `graph.image` must be a page resource (next to `index.md`), a path under `static/` starting with `/`, or a full URL. |
| The picture is crowded | Lay the graph out in the app, export it with positions, and use it as a data file (or copy the `x`, `y` into `graph`). |
