## Embedding

Pivograph can be shown inside another site with an `<iframe>`, without its top bar, displaying a map you choose.

| URL parameter | Effect |
|---|---|
| `embed=1` | Hides the top bar (logo and menus). Starts empty and read-only. Never reads or overwrites the visitor's saved map. |
| `src=<url>` | Loads this JSON at start: a Pivograph document or an OCD file. The server must allow CORS. |
| `sidebar=0` | Hides the side panel. |
| `tags=0` | Starts with the tag pills hidden. |

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

[OCD Viewer](https://github.com/ossbase-org/ocd-viewer) uses this for its *Graph* view.
