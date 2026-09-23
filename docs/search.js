// Search box of the documentation and the app. The index (docs/search.json,
// one entry per section of the guide) is built with the docs and fetched on
// first focus. Plain script: loaded by the docs pages, imported by the app.
//   <form data-site-search data-index="search.json" data-base="guide.html" data-shortcut> … </form>
// Without JavaScript the form still leads to the guide.

;(() => {
  const MAX = 8
  for (const box of document.querySelectorAll('[data-site-search]')) setup(box)

  function setup(box) {
    const input = box.querySelector('input[type="search"]')
    const list = box.querySelector('.search-results')
    const base = box.dataset.base
    let entries = null
    let hits = []
    let active = -1

    const load = () => (entries ??= fetch(box.dataset.index).then((r) => (r.ok ? r.json() : [])).catch(() => []))

    input.addEventListener('focus', load)
    input.addEventListener('input', async () => show(search(await load(), input.value)))
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (!hits.length) return
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length
        mark()
      } else if (event.key === 'Escape') {
        input.value = ''
        show([])
        input.blur()
      }
    })
    // Enter opens the selected result, else the first one.
    box.addEventListener('submit', (event) => {
      const hit = hits[active] ?? hits[0]
      if (!hit) return
      event.preventDefault()
      go(hit)
    })
    list.addEventListener('mousedown', (event) => event.preventDefault()) // keep focus while clicking a result
    document.addEventListener('click', (event) => { if (!box.contains(event.target)) show([]) })

    // "/" jumps to the search box, where the page asks for it.
    if (box.hasAttribute('data-shortcut')) {
      document.addEventListener('keydown', (event) => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
        if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable) return
        event.preventDefault()
        input.focus()
      })
    }

    // Arriving with ?q= (the form sent without JavaScript, or a shared link): show the results.
    const q = new URLSearchParams(location.search).get('q')
    if (q && !input.value) {
      input.value = q
      load().then((all) => show(search(all, q)))
    }

    function go(hit) {
      show([])
      const url = `${base}#${hit.id}`
      if (new URL(url, location.href).pathname === location.pathname) {
        location.hash = hit.id
        input.blur()
      } else {
        location.href = url
      }
    }

    function show(results) {
      hits = results
      active = results.length ? 0 : -1
      list.replaceChildren()
      if (!input.value.trim()) {
        list.hidden = true
        input.setAttribute('aria-expanded', 'false')
        return
      }
      if (!results.length) {
        const empty = document.createElement('p')
        empty.className = 'search-empty'
        empty.textContent = `No section mentions “${input.value.trim()}”.`
        list.append(empty)
      }
      results.forEach((hit, i) => {
        const a = document.createElement('a')
        a.className = 'search-hit'
        a.href = `${base}#${hit.id}`
        a.id = `${list.id}-${i}`
        a.setAttribute('role', 'option')
        const title = document.createElement('span')
        title.className = 'search-hit-title'
        title.textContent = hit.parent ? `${hit.parent} › ${hit.title}` : hit.title
        const snippet = document.createElement('span')
        snippet.className = 'search-hit-snippet'
        snippet.innerHTML = hit.snippet // built from escaped text (see highlight)
        a.append(title, snippet)
        a.addEventListener('click', (event) => {
          event.preventDefault()
          go(hit)
        })
        list.append(a)
      })
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
      mark()
    }

    function mark() {
      list.querySelectorAll('.search-hit').forEach((a, i) => a.setAttribute('aria-selected', String(i === active)))
      const current = list.querySelector('[aria-selected="true"]')
      if (current) {
        input.setAttribute('aria-activedescendant', current.id)
        current.scrollIntoView({ block: 'nearest' })
      } else {
        input.removeAttribute('aria-activedescendant')
      }
    }
  }

  const fold = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  /** Sections that contain every word of the query, the best first. */
  function search(entries, query) {
    const terms = fold(query).split(/[^a-z0-9_.@#-]+/).filter((t) => t.length > 1 || /\d/.test(t))
    if (!terms.length) return []
    const scored = []
    for (const entry of entries) {
      const title = fold(entry.title)
      const parent = fold(entry.parent ?? '')
      const text = fold(entry.text)
      let score = 0
      let all = true
      for (const term of terms) {
        const inTitle = title.includes(term)
        const inText = text.includes(term)
        if (!inTitle && !inText && !parent.includes(term)) {
          all = false
          break
        }
        if (inTitle) score += title.startsWith(term) ? 14 : 10
        if (parent.includes(term)) score += 3
        if (inText) {
          // How often, and how densely: a short section about the word beats a long one mentioning it.
          const count = text.split(term).length - 1
          score += Math.min(8, count) + Math.min(8, Math.round((4000 * count) / Math.max(text.length, 400)))
        }
      }
      if (all) scored.push({ ...entry, score, snippet: highlight(entry.text, text, terms) })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, MAX)
  }

  /** A short extract around the first match, escaped, with the words marked. */
  function highlight(original, folded, terms) {
    const at = Math.min(...terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0), Infinity)
    const start = Number.isFinite(at) ? Math.max(0, at - 50) : 0
    let extract = original.slice(start, start + 170)
    if (start > 0) extract = `…${extract.replace(/^\S*\s/, '')}`
    if (start + 170 < original.length) extract = `${extract.replace(/\s\S*$/, '')}…`
    const escaped = extract.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return escaped.replace(pattern, '<mark>$1</mark>')
  }
})()
