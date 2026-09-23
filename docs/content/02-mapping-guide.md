## Mapping an organization

This section is a procedure. It is written for an AI agent (or a person) asked to *"map organization X with Pivograph"*, and it ends with a document that loads without errors and reads well. Follow the steps in order.

### 1. Collect the sources

Gather facts before writing anything, and keep the URL of every fact you use.

1. **The organization's Open Contributions Descriptor**, if it publishes one: `https://<domain>/.well-known/open-contributions.json`. It lists projects, licenses, repositories, open data, standards and relationships in a structured form. If it exists, load it in the app with *Import well-known…* first: it gives you a correct skeleton in one step (see [Open Contributions Descriptor](#open-contributions-descriptor)).
2. **The code hosting organization**: `https://github.com/<org>` (or GitLab). List the repositories that are real projects: skip forks, archived experiments and tooling repositories unless they matter to the map. For each project, note the repository description, license, main language and topics. The GitHub API gives them without authentication (`https://api.github.com/repos/<owner>/<repo>`), at up to 60 requests per hour.
3. **The website and documentation** of the organization and of each project: what the project is for, who uses it, which other projects it talks to.
4. **The code itself**, for relationships: API clients, configuration files, import/export modules, webhooks, submodules, dependency manifests. A relationship you can point to in code is worth more than one inferred from a website.

### 2. Decide what is a node

A node is anything with its own identity that a reader would want to locate on the map:

- the organization itself and the teams or partner organizations that matter;
- software projects, platforms and services (usually the bulk of the map);
- datasets, feeds and published standards;
- important external things the projects depend on or serve (another organization's platform, a data source, a standards body).

Keep the map about **one level of granularity**: if one node is "MISP", its sub-modules are not separate nodes unless the map is about MISP's internals. When in doubt, a detail belongs in a node's `description`, `details` or `tags`, not in a new node.

### 3. Decide what is an edge

An edge says **how two nodes are related**, and its arrow says **which way the relationship goes**. Use one convention for the whole map and write it in `meta.description`. The most readable convention is *"the arrow goes from the one who acts to the one acted upon"*: A → B when A calls, uses, imports from, feeds or maintains B.

- Write the relationship as a short verb phrase in `label`: `uses`, `pulls rules from`, `exports events to`, `queries CVE data from`, `maintains`.
- Use `"direction": "both"` only for genuinely symmetric relationships (two-way sync), and `"none"` for associations without a direction (`affiliated with`).
- Explain the mechanism in the edge's `description` (which API, which job, which format), and put checkable facts in `details` (for example `{ "API": "/api/rule/search", "Auth": "API key" }`).
- An edge from a node to itself is allowed (for example two instances of the same platform federating).

### 4. Design the types and tags

Types carry the look, so the map stays consistent and the JSON stays short:

- 3 to 8 **node types** (`project`, `platform`, `dataset`, `organization`, `standard`…), each with a colour, a shape and optionally an image or a bundled icon;
- a few **edge types** for the relationships that repeat (`uses`, `feeds`, `develops`), each with a colour and a default label and direction;
- **tags** for cross-cutting facts that should be filterable: technology (`python`, `yara`), domain (`threat-intelligence`), status (`archived`). GitHub topics make good tags. Keep them lowercase with hyphens.

### 5. Write the document

Follow the [document format](#document-format) exactly. Rules that matter:

- **Ids** are short, stable and unique: lowercase with hyphens (`misp`, `vulnerability-lookup`). Edges refer to nodes by id.
- Every node gets a `label` and, whenever possible, a one-sentence `description` written for someone who does not know the project.
- Put the project's website in `url`, the repository in `github` (`owner/repo`), and other useful pages in `links`.
- Leave out anything you would only be guessing. A smaller correct map is better than a complete-looking wrong one.
- Put the sources you used in each node's `details` (for example `"Source": "https://…"`) when a fact is not obvious.
- Set `meta.title`, a `meta.description` that states the arrow convention and the date the facts were checked, and `meta.linkDistance` (200–350) if nodes are big or edge labels long.

### 6. Validate

Load the file in the app (*Open JSON…*, or paste it in the JSON tab and press *Apply*). The app reports **errors** (the file is refused: duplicate ids, edges pointing to unknown nodes, wrong top-level shapes) and **warnings** (the file loads, but something was ignored: an unknown shape or direction, a type that is not declared). Fix every error and every warning. You can also check the file against the [JSON schema](pivograph.schema.json).

Then read the map as a newcomer would: every node label is understandable, every arrow reads as a sentence (`Flowintel` → *uses* → `MISP`), nothing important floats unconnected.

### Checklist

- [ ] Every node has `id`, `label`, `description`; projects have `github` and/or `url`.
- [ ] Every edge has a `label` that is a verb phrase, and the arrow follows the convention in `meta.description`.
- [ ] Types are declared in `nodeTypes` / `edgeTypes` before being used.
- [ ] Tags are lowercase-with-hyphens and meaningful as filters.
- [ ] No duplicate ids; no edge to a missing node; the app shows no warning.
- [ ] Facts that are not obvious cite a source in `details`.

### Prompt template

Give an AI agent this prompt, with the organization filled in:

```text
Map the organization <NAME> (<website>, <code hosting URL>) with Pivograph.
Read https://ecrou-exact.github.io/project-graph/llms-full.txt first and follow
its "Mapping an organization" procedure and "Document format" exactly.
Check https://<domain>/.well-known/open-contributions.json and use it if present.
Map <scope: all active projects / the projects around X / …>.
Arrow convention: from the one who acts to the one acted upon.
Only include relationships you can support with code or documentation, and
cite the source in each edge's details. Output one JSON document, nothing else.
```
