## Embedding

Pivograph can be shown inside another site with an `<iframe>`, without its top bar, displaying a map you choose.

| URL parameter | Effect |
|---|---|
| `embed=1` | Hides the top bar (logo and menus). Starts empty and read-only. Never reads or overwrites the visitor's saved map. |
| `src=<url>` | Loads this JSON at start: a Pivograph document or an OCD file. The server must allow CORS. |
| `example=<name>` | Opens a bundled example: `rulezet`, `circl` or `ngsoti`, e.g. [`?example=ngsoti`](https://ecrou-exact.github.io/project-graph/?example=ngsoti). Works without `embed` too: the address follows the example shown, so it can be shared. |
| `sidebar=0` | Hides the side panel. |
| `mode=viewer` | Only the graph: pan, zoom and drag, no panels (Pivotick's `viewer` mode). Pair with `sidebar=0`. |
| `theme=light` / `theme=dark` | Follow the host page's theme instead of the visitor's system setting. |
| `bg=<colour>` | Background of the page and the graph (`#rrggbb` or `rgb(…)`), e.g. the host page's own background. |
| `toolbar=1` | With `embed=1`: keeps the top bar (Graph and Add menus), for a host page that lets its users edit the map (see `pivograph:changed` below). |
| `tags=1` | Starts with the tag pills shown on the graph. They are hidden by default; the *# Tags* button shows them. |

The map below is the app embedded in this page, loading the example with `?embed=1&sidebar=0&src=…`:

<iframe class="demo" src="../?embed=1&amp;sidebar=0&amp;src=docs/examples/rulezet.json" title="Live example: projects linked to Rulezet" loading="lazy" allow="fullscreen"></iframe>

```html
<iframe
  src="https://ecrou-exact.github.io/project-graph/?embed=1&src=https://example.org/.well-known/open-contributions.json"
  title="Map of our projects"
  style="width: 100%; height: 80vh; border: 0"
  allow="fullscreen"></iframe>
```

The host page can also send the data itself, which works for files that have no URL (for example a file the visitor opened):

```js
const frame = document.querySelector('iframe')

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return
  if (event.data?.type === 'pivograph:ready') {
    frame.contentWindow.postMessage(
      { type: 'pivograph:load', data: documentOrOcd, name: 'open-contributions.json' },
      'https://ecrou-exact.github.io',
    )
  }
})
```

| Message | Direction | Meaning |
|---|---|---|
| `{ type: 'pivograph:ready' }` | app → host | The app is ready to receive data. Sent once at start. |
| `{ type: 'pivograph:load', data, name }` | host → app | Load `data` (a Pivograph document or an OCD file). Only the embedding page can send it. |
| `{ type: 'pivograph:loaded', nodes, edges }` | app → host | Loaded, with the number of nodes and edges. |
| `{ type: 'pivograph:error', message }` | app → host | The data was refused; `message` says why. |
| `{ type: 'pivograph:changed', data }` | app → host | An editable map (loaded with `meta.readOnly: false`) was changed; `data` is the whole document, positions included. Never sent for read-only maps. |
| `{ type: 'pivograph:get' }` | host → app | Ask for the current document. |
| `{ type: 'pivograph:snapshot' }` | host → app | Ask for a PNG of the graph as drawn. |
| `{ type: 'pivograph:snapshot', image }` | app → host | The answer: a `data:image/png` URL, or `null` when the picture could not be made. |
| `{ type: 'pivograph:export', format }` | host → app | Run one of the app's exports in the frame: `json`, `pivotick`, `png`, `md` or `pdf` (the report). |
| `{ type: 'pivograph:theme', scheme, background }` | host → app | Switch to `light` / `dark` and/or a background colour, live (when the host page changes theme). |
| `{ type: 'pivograph:document', data }` | app → host | The answer: the whole document, positions included. |

[OCD Viewer](https://github.com/ossbase-org/ocd-viewer) uses this for its *Graph* view.
