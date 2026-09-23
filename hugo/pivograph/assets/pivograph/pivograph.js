// Progressive enhancement of {{< pivograph >}}: without JavaScript the page
// shows the graph as text; with it, the interactive graph comes first and the
// text stays one click away. The graph's JSON, built by Hugo on the same site,
// is fetched here and handed to the Pivograph app in an iframe (postMessage),
// so the app never needs to reach the site itself (no CORS).

// The script is included once per graph; each figure is enhanced once.
// ?pivograph=static keeps the page as it is without JavaScript (the picture
// drawn by Hugo and the text), to check or show that version. The choice holds
// for the tab, and the site's links keep it, until ?pivograph=interactive.
if (staticMode()) {
  for (const figure of document.querySelectorAll('figure[data-pivograph]:not(.pivograph-static)')) showStatic(figure)
} else {
  for (const figure of document.querySelectorAll('figure[data-pivograph]:not(.pivograph-enhanced)')) enhance(figure)
}

function staticMode() {
  const mode = new URLSearchParams(location.search).get('pivograph')
  try {
    if (mode === 'static') sessionStorage.setItem('pivograph', 'static')
    if (mode === 'interactive') sessionStorage.removeItem('pivograph')
    return mode === 'static' || (mode !== 'interactive' && sessionStorage.getItem('pivograph') === 'static')
  } catch {
    return mode === 'static' // storage unavailable: only the address says so
  }
}

/** The version without JavaScript, said as such, with the way back to the interactive graph. */
function showStatic(figure) {
  figure.classList.add('pivograph-static')
  const note = document.createElement('p')
  note.className = 'pivograph-static-note'
  const back = new URL(location.href)
  back.searchParams.set('pivograph', 'interactive')
  note.append('You are seeing the version without JavaScript: the picture drawn by Hugo, then the text. ')
  const link = document.createElement('a')
  link.href = back.href
  link.textContent = 'Show the interactive graph'
  note.append(link)
  figure.prepend(note)
  // The site's links keep the mode, so it survives a page without a graph too.
  const base = new URL(figure.dataset.base || '/', location.href)
  const root = new URL(base.pathname, location.origin)
  for (const a of document.querySelectorAll('a[href]')) {
    if (a === link) continue
    const url = new URL(a.getAttribute('href'), location.href)
    const local = url.origin === location.origin || url.href.startsWith(base.href)
    if (!local || !(url.pathname.startsWith(root.pathname) || url.href.startsWith(base.href)) || url.hash && url.pathname === location.pathname) continue
    url.searchParams.set('pivograph', 'static')
    a.setAttribute('href', url.origin === location.origin ? url.pathname + url.search + url.hash : url.href)
  }
}

function enhance(figure) {
  const { src, app, height, sidebar, tags, title, base } = figure.dataset
  const appUrl = new URL(app, location.href)
  const params = new URLSearchParams({ embed: '1' })
  if (sidebar !== '1') params.set('sidebar', '0')
  if (tags === '0') params.set('tags', '0')

  const frame = document.createElement('iframe')
  frame.className = 'pivograph-frame'
  frame.title = title
  frame.src = `${appUrl.href}?${params}`
  frame.allow = 'fullscreen'
  frame.loading = 'lazy'
  frame.style.height = height

  const bar = document.createElement('div')
  bar.className = 'pivograph-bar'
  const status = document.createElement('span')
  status.className = 'pivograph-status'
  status.setAttribute('role', 'status')
  status.textContent = 'Loading the graph…'
  const full = document.createElement('button')
  full.type = 'button'
  full.className = 'pivograph-button'
  full.textContent = 'Full screen'
  full.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : figure.requestFullscreen?.()))
  bar.append(status, full)

  // The text moves into a disclosure under the graph: still there for screen
  // readers, search engines and anyone who prefers reading.
  const text = figure.querySelector('.pivograph-text')
  let details = null
  if (text) {
    details = document.createElement('details')
    details.className = 'pivograph-text-toggle'
    const summary = document.createElement('summary')
    summary.textContent = 'Read the graph as text'
    text.replaceWith(details)
    details.append(summary, text)
  }
  // The picture drawn by Hugo gives way to the interactive graph; it comes
  // back if the app can't show the graph.
  const picture = figure.querySelector('.pivograph-picture')
  if (picture) picture.hidden = true
  figure.prepend(bar, frame)
  figure.classList.add('pivograph-enhanced')

  const data = fetch(src).then((r) => {
    if (!r.ok) throw new Error(`${src} answered ${r.status}`)
    return r.json()
  }).then((doc) => embedImages(doc, base))

  window.addEventListener('message', async (event) => {
    if (event.source !== frame.contentWindow || event.origin !== appUrl.origin) return
    const message = event.data ?? {}
    if (message.type === 'pivograph:ready') {
      try {
        frame.contentWindow.postMessage({ type: 'pivograph:load', data: await data, name: title }, appUrl.origin)
      } catch (error) {
        fail(`The graph data could not be loaded (${error.message}).`)
      }
    } else if (message.type === 'pivograph:loaded') {
      status.textContent = `${message.nodes} nodes, ${message.edges} relationships`
    } else if (message.type === 'pivograph:error') {
      fail(`The graph could not be shown: ${message.message}`)
    }
  })

  function fail(reason) {
    status.textContent = reason
    figure.classList.add('pivograph-failed')
    frame.hidden = true
    if (picture) picture.hidden = false
    if (details) details.open = true
  }
}

/**
 * Node pictures from this site, embedded as data URLs: the app then never
 * loads them itself, so an https app works with an http site (no mixed
 * content), any origin works, and the app's picture and PDF exports keep them.
 * Pictures that can't be read stay as links.
 */
async function embedImages(doc, base) {
  // Pictures of this site are written with the site's base URL
  // (http://localhost:1313/…, https://example.org/…); read them from the
  // address the page is actually served at (127.0.0.1, www., a preview…).
  const root = new URL(new URL(base || '/', location.href).pathname, location.origin)
  const local = (url) => {
    if (base && url.startsWith(base)) return new URL(url.slice(base.length), root).href
    return new URL(url, location.href).origin === location.origin ? url : null
  }
  const cache = new Map()
  const inline = (url) => {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })))
    }
    return cache.get(url)
  }
  await Promise.all((doc.nodes ?? []).map(async (node) => {
    const url = node.image && /^https?:/.test(node.image) ? local(node.image) : null
    if (!url) return
    try {
      node.image = await inline(url)
    } catch {
      // unreadable: the app shows the node without it or loads the link itself
    }
  }))
  return doc
}
