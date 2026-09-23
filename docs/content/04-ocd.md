## Open Contributions Descriptor

The [Open Contributions Descriptor](https://github.com/ossbase-org/Open-Contributions-Descriptor) (OCD) is a JSON file in which an organization describes its open source projects, open data, participation in open standards and relationships with other organizations. It is published at `https://<domain>/.well-known/open-contributions.json`. [OCD Viewer](https://github.com/ossbase-org/ocd-viewer) shows it as cards and, through Pivograph, as a graph.

Pivograph recognizes an OCD file wherever a JSON file is accepted (*Open JSON…*, drag and drop, the JSON tab, *Import well-known…*, `?src=`, `postMessage`) and turns it into a map:

| OCD | Map |
|---|---|
| `organization` | The central *Organization* node. Its fields (`domain`, `country`, `links`…), the document's `contacts`, `policies`, `spec_version`, `generated_at`, `extensions` and any unknown top-level section go to the node's `details`. |
| `projects[]` | One *Project* node each, linked from the organization (edge type `maintains`, no label). `name` → `label`, `description` → `description`, `tags` → `tags`, `repository.url` → `github` when it is a GitHub repository. Everything else (`status`, `repository`, `links`, `participate`, `governance`, `release`, custom fields) is kept as-is in `details`, in its original order. `status: archived` / `disabled` also becomes a tag. |
| `open_data[]` | *Open data* nodes (edge `publishes`); fields in `details`. |
| `open_standards[]` | *Open standard* nodes, one per `body` (edge `participates in`, labelled with the contribution types); fields in `details`. |
| `relationships[]` | *External organization* or *External project* nodes, one per `target`, linked from the organization with the relationship type as label: `maintains`, `co-maintains` (both ways), `supports`, `contributes to`, `sponsors`, `upstream` (arrow towards the organization), `downstream`, `member of`, `affiliated with`. `since`, `until`, `evidence`, `contacts` and `tags` go to the edge's `details`. |

Because each item keeps its OCD structure in `details`, the details panel reads section by section like OCD Viewer, and nothing is lost — unknown or future fields included.

An imported descriptor opens **read-only**: no creation, editing or deletion (Pivotick's *Create* tools, context-menu entries, double-click, the app's buttons and the JSON editor are off). Browsing, filtering and exporting still work. *Enable editing* in the header lifts it.

*Import well-known…* accepts a local file, a domain (`misp-project.org` becomes `https://misp-project.org/.well-known/open-contributions.json`), or a URL, and offers the official samples (MISP, AIL, flowintel). A remote file must be served with CORS headers; otherwise download it and open it.

To go further than the descriptor, enable editing and add what it does not say: relationships between the organization's own projects, logos, tags with colours and icons.
