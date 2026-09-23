// The PDF report: the report model (report.js) laid out for A4 paper, printed
// from a hidden frame so the browser's "Save as PDF" makes the file (real
// text, fonts and page breaks). The graph's own colours carry the design:
// node colour bars, tag pills, relationship line samples.
import { badgeIconSvg } from './badgeIcons.js'
import { capitalize, detailKey, formatDate, lowerFirst, plural, reportModel, article } from './report.js'

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap'

const CSS = `
/* No page margin: the browser then prints no header or footer of its own
   (address, date, page title). The margins are the table's repeated head and
   foot rows below, and the body's side padding. */
@page { size: A4; margin: 0; }
:root {
  color-scheme: light;
  --ink: #18202e; --muted: #5d6679; --faint: #8a93a6; --rule: #e3e6ee; --wash: #f5f7fb; --accent: #3b63f3;
  --display: "Bricolage Grotesque", system-ui, "Segoe UI", sans-serif;
  --text: "Source Serif 4", Georgia, "Times New Roman", serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 0 17mm; font: 10pt/1.55 var(--text); color: var(--ink); }
a { color: inherit; text-decoration: none; }
.frame { width: 100%; border-collapse: collapse; }
.frame td { padding: 0; }
.running { height: 20mm; vertical-align: bottom; }
.running div { display: flex; justify-content: space-between; gap: 12pt; padding-bottom: 5pt; margin-bottom: 8mm; border-bottom: 0.6pt solid var(--rule); font: 7.5pt var(--mono); color: var(--faint); }
.bottom { height: 14mm; }

/* First page */
.cover h1 { font: 800 27pt/1.08 var(--display); letter-spacing: -0.02em; margin: 2mm 0 5mm; max-width: 150mm; }
.cover .lede { font-size: 11.5pt; line-height: 1.5; color: #333b4c; max-width: 150mm; margin: 0 0 6mm; }
.legend { display: flex; flex-wrap: wrap; gap: 3pt 14pt; margin: 0 0 5mm; font: 8.5pt var(--display); color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 5pt; }
.legend b { color: var(--ink); font-weight: 600; }
.dot { width: 8pt; height: 8pt; border-radius: 50%; flex: none; }
.figure { margin: 0 0 6mm; }
.figure img { display: block; width: 100%; max-height: 165mm; object-fit: contain; background: #f6f7f9; border: 0.6pt solid var(--rule); border-radius: 5pt; }
.figure figcaption { margin-top: 4pt; font: 8pt var(--mono); color: var(--faint); }
.overview { font-size: 10.5pt; max-width: 160mm; }

/* Sections */
h2 { font: 700 17pt/1.2 var(--display); letter-spacing: -0.01em; margin: 0 0 5mm; break-after: avoid; }
.section { break-before: page; }
.group-head { display: flex; align-items: baseline; gap: 8pt; margin: 7mm 0 3mm; padding-bottom: 3pt; border-bottom: 1.2pt solid var(--group); break-after: avoid; }
.group-head h3 { font: 700 12.5pt var(--display); margin: 0; color: var(--ink); }
.group-head .swatch { width: 9pt; height: 9pt; border-radius: 2pt; background: var(--group); align-self: center; }
.group-head .count { font: 8pt var(--mono); color: var(--faint); margin-left: auto; }

/* A node */
.node { position: relative; padding: 0 0 0 11pt; margin: 0 0 6mm; }
.node::before { content: ""; position: absolute; left: 0; top: 1pt; bottom: 1pt; width: 2.6pt; border-radius: 2pt; background: var(--node); }
.node-head { display: flex; align-items: center; gap: 9pt; margin-bottom: 3pt; break-after: avoid; }
.logo { width: 30pt; height: 30pt; object-fit: contain; flex: none; }
.node-head h4 { font: 700 12pt/1.2 var(--display); margin: 0; }
.chip { display: inline-block; margin-top: 1.5pt; padding: 0.5pt 6pt; border: 0.7pt solid var(--node); border-radius: 20pt; font: 500 7.5pt var(--display); color: var(--node); }
.node p { margin: 0 0 4pt; }
.facts { display: grid; grid-template-columns: 22mm 1fr; gap: 1.5pt 8pt; margin: 4pt 0; font-size: 9pt; }
.facts dt { font: 500 8pt/1.9 var(--display); color: var(--muted); }
.facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.facts .url { font: 8pt/1.9 var(--mono); color: #2447c8; }
.repo-desc { font-style: italic; color: #333b4c; }
.stats { display: flex; flex-wrap: wrap; gap: 1pt 10pt; font: 7.8pt var(--mono); color: var(--muted); margin-top: 1pt; }
.stats b { color: var(--ink); font-weight: 600; }
.pills { display: flex; flex-wrap: wrap; gap: 3pt; margin: 5pt 0; }
.pill { display: inline-flex; align-items: center; gap: 3pt; padding: 1pt 6.5pt; border-radius: 20pt; font: 600 7.5pt/1.5 var(--display); white-space: nowrap; }
.pill svg { width: 7pt; height: 7pt; }
.label { font: 600 8pt var(--display); color: var(--muted); margin: 6pt 0 2pt; break-after: avoid; }
.details { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin: 2pt 0 4pt; }
.details th, .details td { text-align: left; vertical-align: top; padding: 2.5pt 6pt 2.5pt 0; border-top: 0.5pt solid var(--rule); }
.details th { width: 28mm; font: 500 8pt var(--display); color: var(--muted); }
.details .details th { width: 22mm; }
.details .details tr:first-child > * { border-top: 0; }
.details ul { margin: 0; padding-left: 11pt; }
.relations { list-style: none; margin: 2pt 0 0; padding: 0; font-size: 9.2pt; }
.relations li { position: relative; padding-left: 12pt; margin: 1.5pt 0; }
.relations li::before { content: "→"; position: absolute; left: 0; color: var(--node, var(--faint)); font-family: var(--display); }
strong { font-family: var(--display); font-weight: 600; font-size: 0.95em; }

/* Relationships */
.rel-head svg { flex: none; align-self: center; }
.rel { margin: 0 0 4mm; break-inside: avoid-page; }
.rel > p:first-child { margin: 0 0 2pt; font-size: 10pt; }
.rel .desc { color: #333b4c; font-size: 9.4pt; margin: 0 0 2pt; }
.plain { margin: 0 0 4mm; }

/* Tags */
.tag-index { columns: 2; column-gap: 9mm; font-size: 9pt; }
.tag-index div { break-inside: avoid; margin: 0 0 4pt; }
.tag-index .pill { margin-right: 4pt; }
.colophon { margin-top: 10mm; padding-top: 4pt; border-top: 0.6pt solid var(--rule); font: 7.5pt var(--mono); color: var(--faint); }
`

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u ?? '') ? u : null)

function linkHtml(url, text = url, cls = 'url') {
  const href = safeUrl(url)
  const shown = esc(String(text).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))
  return href ? `<a class="${cls}" href="${esc(href)}">${shown}</a>` : esc(text)
}

function pillHtml(p, text = `#${p.tag}`) {
  const icon = p.icon ? badgeIconSvg(p.icon, p.fg) ?? '' : ''
  return `<span class="pill" style="background:${esc(p.color)};color:${esc(p.fg)}">${icon}${esc(text)}</span>`
}

function segmentsHtml(segments) {
  return segments.map((s) => {
    if (typeof s === 'string') return esc(s)
    if (s.node !== undefined) return `<strong>${esc(s.name)}</strong>`
    if (s.tag !== undefined) return pillHtml(s)
    return ''
  }).join('')
}

function lineSample(color, dashed) {
  return `<svg width="26" height="8" viewBox="0 0 26 8"><line x1="1" y1="4" x2="19" y2="4" stroke="${esc(color)}" stroke-width="2" ${dashed ? 'stroke-dasharray="4 3"' : ''}/><path d="M18,0.5 L25,4 L18,7.5 Z" fill="${esc(color)}"/></svg>`
}

function paragraphs(text, cls = '') {
  return String(text).trim().split(/\n\s*\n/).map((p) => `<p${cls ? ` class="${cls}"` : ''}>${esc(p)}</p>`).join('')
}

function valueHtml(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) return value.map(valueHtml).join(', ')
    return `<ul>${value.map((v) => `<li>${valueHtml(v)}</li>`).join('')}</ul>`
  }
  if (value && typeof value === 'object') return detailsHtml(value)
  const text = String(value)
  return safeUrl(text) && /^\S+$/.test(text) ? linkHtml(text) : esc(text)
}

function detailsHtml(details) {
  return `<table class="details">${Object.entries(details).map(([k, v]) => `<tr><th>${esc(detailKey(k))}</th><td>${valueHtml(v)}</td></tr>`).join('')}</table>`
}

function githubHtml({ slug, url, info, topics }) {
  let html = linkHtml(url, slug)
  if (!info) return html
  if (info.description) html += `<div class="repo-desc">${esc(info.description)}</div>`
  const stats = []
  if (Number.isFinite(info.stars)) stats.push(`<span>★ <b>${info.stars}</b></span>`)
  if (Number.isFinite(info.forks)) stats.push(`<span><b>${info.forks}</b> ${plural(info.forks, 'fork')}</span>`)
  if (Number.isFinite(info.issues)) stats.push(`<span><b>${info.issues}</b> open ${plural(info.issues, 'issue')}</span>`)
  if (info.language) stats.push(`<span>${esc(info.language)}</span>`)
  if (info.license) stats.push(`<span>${esc(info.license)}</span>`)
  if (info.pushedAt) stats.push(`<span>updated ${esc(formatDate(info.pushedAt))}</span>`)
  if (info.archived) stats.push('<span><b>archived</b></span>')
  if (stats.length) html += `<div class="stats">${stats.join('')}</div>`
  if (topics.length) html += `<div class="stats">Topics: ${topics.map(esc).join(', ')}</div>`
  return html
}

function nodeHtml(node, image) {
  const facts = []
  if (node.url) facts.push(['Website', linkHtml(node.url)])
  if (node.github) facts.push(['Source code', githubHtml(node.github)])
  for (const l of node.links) facts.push([esc(l.label || 'Link'), linkHtml(l.url)])
  const intro = node.typeLabel && !node.description ? `<p>${esc(node.name)} is ${article(node.typeLabel)} ${esc(lowerFirst(node.typeLabel))}.</p>` : ''
  return `<article class="node" style="--node:${esc(node.color)}">
  <div class="node-head">${image ? `<img class="logo" src="${esc(image)}" alt="">` : ''}<div><h4>${esc(node.name)}</h4>${node.typeLabel ? `<span class="chip">${esc(node.typeLabel)}</span>` : ''}</div></div>
  ${intro}${node.description ? paragraphs(node.description) : ''}
  ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
  ${node.tags.length ? `<div class="pills">${node.tags.map((t) => pillHtml(t)).join('')}</div>` : ''}
  ${node.details ? `<div class="label">Details</div>${detailsHtml(node.details)}` : ''}
  ${node.relations.length ? `<div class="label">Relationships</div><ul class="relations">${node.relations.map((s) => `<li>${segmentsHtml(s)}</li>`).join('')}</ul>` : ''}
</article>`
}

/**
 * The report as a standalone HTML page. Options:
 *   image    picture of the graph (data URL)
 *   images   Map node id -> picture drawn on the node (logo or tinted icon)
 *   baseUrl  base for relative image paths
 *   date     Date shown in the colophon
 */
export function reportHtml(doc, { image, images = new Map(), baseUrl, date = new Date() } = {}) {
  const m = reportModel(doc)
  const when = formatDate(date)
  const legend = [
    ...m.groups.filter((g) => g.key).map((g) => `<span><i class="dot" style="background:${esc(g.color)}"></i><b>${g.nodes.length}</b> ${esc(lowerFirst(plural(g.nodes.length, g.label)))}</span>`),
    ...m.relations.filter((r) => r.key).map((r) => `<span>${lineSample(r.color, r.dashed)}<b>${r.count}</b> × ${esc(r.label)}</span>`),
  ]
  const cover = `<section class="cover">
  <h1>${esc(m.title)}</h1>
  ${m.description ? paragraphs(m.description, 'lede') : ''}
  ${legend.length ? `<div class="legend">${legend.join('')}</div>` : ''}
  ${image ? `<figure class="figure"><img src="${esc(image)}" alt="Graph of ${esc(m.title)}"><figcaption>The graph as drawn on ${esc(when)}: ${m.counts.nodes} ${plural(m.counts.nodes, 'node')}, ${m.counts.edges} ${plural(m.counts.edges, 'relationship')}.</figcaption></figure>` : ''}
  <div class="overview"><p>${segmentsHtml(m.overview)}</p></div>
</section>`

  const nodes = m.counts.nodes ? `<section class="section"><h2>Nodes</h2>${m.groups.map((g) => `
  ${m.grouped ? `<div class="group-head" style="--group:${esc(g.color)}"><span class="swatch"></span><h3>${esc(g.heading)}</h3><span class="count">${g.nodes.length}</span></div>` : ''}
  ${g.nodes.map((n) => nodeHtml(n, images.get(n.id) ?? n.image)).join('')}`).join('')}</section>` : ''

  const relations = m.counts.edges ? `<section class="section"><h2>Relationships</h2>${m.relations.map((r) => `
  ${m.relationsGrouped ? `<div class="group-head rel-head" style="--group:${esc(r.color)}">${lineSample(r.color, r.dashed)}<h3>${esc(capitalize(r.label))}</h3><span class="count">${r.count}</span></div>` : ''}
  ${r.plain.length ? `<ul class="relations plain" style="--node:${esc(r.color)}">${r.plain.map((s) => `<li>${segmentsHtml(s)}</li>`).join('')}</ul>` : ''}
  ${r.rich.map((x) => `<div class="rel"><ul class="relations" style="--node:${esc(r.color)}"><li>${segmentsHtml(x.sentence)}</li></ul>${x.description ? paragraphs(x.description, 'desc') : ''}${x.details ? detailsHtml(x.details) : ''}</div>`).join('')}`).join('')}</section>` : ''

  const tags = m.tags.length ? `<section><h2 style="margin-top:10mm">Tags</h2><div class="tag-index">${m.tags.map((t) => `<div>${pillHtml(t)}${esc(t.nodes.map((n) => n.name).join(', '))}</div>`).join('')}</div></section>` : ''

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
${baseUrl ? `<base href="${esc(baseUrl)}">` : ''}
<title>${esc(m.title)}</title>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style></head><body>
<table class="frame">
<thead><tr><td class="running"><div><span>${esc(m.title)}</span><span>Pivograph report · ${esc(when)}</span></div></td></tr></thead>
<tfoot><tr><td class="bottom"></td></tr></tfoot>
<tbody><tr><td>
${cover}${nodes}${relations}${tags}
<p class="colophon">Generated by Pivograph on ${esc(when)} from the graph's data. The text follows the report protocol described in the Pivograph guide.</p>
</td></tr></tbody></table>
</body></html>`
}

/** Opens the print dialog on the given page, without leaving the app. */
export function printHtml(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden'
    frame.addEventListener('load', async () => {
      const win = frame.contentWindow
      // Wait for the web fonts (at most 3 s; offline, the fallbacks are used).
      await Promise.race([win.document.fonts?.ready, new Promise((r) => setTimeout(r, 3000))])
      win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), { once: true })
      try {
        win.focus()
        win.print()
        resolve()
      } catch (error) {
        frame.remove()
        reject(error)
      }
      // Browsers without afterprint in frames: clean up later anyway.
      setTimeout(() => frame.isConnected && frame.remove(), 5 * 60 * 1000)
    }, { once: true })
    frame.srcdoc = html // "load" fires once the page and its images are ready
    document.body.append(frame)
  })
}
