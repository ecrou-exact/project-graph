# Pivograph for Hugo

A Hugo component that turns a site's pages into a graph. **Hugo builds the
Pivograph JSON** from front matter (or reads a data file), and every graph
works with and without JavaScript:

- **without JavaScript**: the graph drawn by Hugo as SVG, and written out as text;
- **with JavaScript**: the interactive Pivograph graph (zoom, search, filters).

Needs Hugo 0.130 or later (standard edition). To see a page as it is without
JavaScript, add `?pivograph=static` to its address.

Folders:

- `pivograph/`: the component (shortcode, partials, script, styles). Copy it into a site's `themes/`.
- `example/`: an example site: the Rulezet map as ten project pages, and the GitHub organisations of CIRCL as 22 pages.
  `npm run hugo:example` regenerates it from `examples/rulezet.json` and serves it.

Full guide, with the front-matter reference, parameters, a checklist and a
prompt for AI agents: [Hugo](https://ecrou-exact.github.io/project-graph/docs/guide.html#hugo).
Live example: <https://ecrou-exact.github.io/project-graph/hugo-example/projects/>

## In short

```toml
# hugo.toml
theme = ["my-theme", "pivograph"]
```

```yaml
# content/projects/rulezet/index.md (logo.png next to it)
---
title: Rulezet
graph:
  type: project
  github: rulezet/rulezet-core
  image: logo.png
  relations:
    - to: misp
      label: pushes rules as MISP events
---
```

```text
<!-- content/projects/_index.md -->
{{< pivograph >}}
```

Or, for a graph made in the app: save its JSON export as
`data/pivograph/ecosystem.json` and write `{{< pivograph data="ecosystem" >}}`.
