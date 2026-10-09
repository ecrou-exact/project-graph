// A PNG or SVG picture of the whole graph as drawn, for exports: Pivotick's SVG is
// cloned with the computed styles written inline (stylesheets don't follow the
// SVG into an image) and its images turned into data URLs (an SVG drawn as an
// image loads nothing), then drawn on a canvas.
import { BUNDLED_FONTS } from './fonts.js'

// The properties that make the drawing: SVG paint, text, and the HTML labels
// inside <foreignObject>.
const PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'visibility', 'display', 'clip-path', 'paint-order', 'marker-start', 'marker-end',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'line-height', 'white-space', 'text-align',
  'color', 'background-color', 'border', 'border-radius', 'padding', 'box-shadow', 'box-sizing', 'transform', 'transform-origin', 'overflow', 'x', 'y',
]

// Layout of the HTML inside <foreignObject> (card nodes): read only on HTML elements.
const HTML_PROPS = ['flex-direction', 'align-items', 'justify-content', 'gap', 'width', 'height', 'max-width', 'object-fit', 'opacity',
  'background-image', 'background-size', 'background-repeat', 'background-position', 'font-weight', 'list-style', 'margin', 'display']
const XHTML = 'http://www.w3.org/1999/xhtml'

// Pivotick's layers that are not part of the picture.
const SKIP = '.selection-box, .shadow-edges, .pvt-shadow-edge, .pg-arrow-hit, .pg-arrow-handle, .pg-section-grip, .pg-section-handle, .pg-note-handle, .pg-shape-handle, .pg-stroke-hit, .pg-connect-preview, .pg-connect-from, .pg-stroke-preview'

/**
 * The graph drawn in `container` as a PNG data URL (null when there is nothing
 * to draw). `scale` multiplies the resolution; the longest side stays under
 * `maxSide` pixels.
 */
export async function graphSnapshot(container, { scale = 2, maxSide = 4000, padding = 40 } = {}) {
  const drawn = await drawnSvg(container, padding)
  if (!drawn) return null
  const { clone, view } = drawn
  const ratio = Math.min(scale, maxSide / Math.max(view.width, view.height))
  const width = Math.round(view.width * ratio)
  const height = Math.round(view.height * ratio)
  clone.setAttribute('width', width)
  clone.setAttribute('height', height)

  // A data URL, not a blob URL: Chrome taints the canvas for a blob SVG holding <foreignObject>.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`
  const img = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  g.fillStyle = background(container)
  g.fillRect(0, 0, width, height)
  g.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

/**
 * The graph drawn in `container` as a standalone SVG file (text), at its
 * natural size: styles, images and fonts inside, so it opens anywhere —
 * a browser, Inkscape, a slide. Null when there is nothing to draw.
 */
export async function graphSvg(container, { padding = 40 } = {}) {
  const drawn = await drawnSvg(container, padding)
  if (!drawn) return null
  const { clone, view } = drawn
  clone.setAttribute('width', Math.round(view.width))
  clone.setAttribute('height', Math.round(view.height))
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

/** A self-contained copy of Pivotick's SVG framing the whole graph, and its viewBox. */
async function drawnSvg(container, padding) {
  const svg = mainSvg(container)
  const layer = svg?.querySelector('.zoom-layer')
  if (!layer || !layer.querySelector('.pvt-node')) return null

  const box = layer.getBBox()
  const clone = svg.cloneNode(true)
  inlineStyles(svg, clone)
  clone.querySelectorAll(SKIP).forEach((el) => el.remove())
  // The whole graph, whatever the zoom: drop the zoom and frame the content.
  const zoom = clone.querySelector('.zoom-layer')
  zoom.removeAttribute('transform')
  zoom.style.removeProperty('transform')
  const view = { x: box.x - padding, y: box.y - padding, width: box.width + 2 * padding, height: box.height + 2 * padding }
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`)
  clone.removeAttribute('style')
  clone.style.background = background(container)
  await inlineImages(clone)
  await embedFonts(clone)
  return { clone, view }
}

/** Pivotick's canvas: the largest top-level <svg> (the neighbour preview and the minimap are smaller). */
function mainSvg(container) {
  const area = (el) => el.getBoundingClientRect().width * el.getBoundingClientRect().height
  return [...container.querySelectorAll('svg.pvt-canvas-element')].sort((a, b) => area(b) - area(a))[0]
    ?? [...container.querySelectorAll('svg')].filter((s) => !s.parentElement.closest('svg')).sort((a, b) => area(b) - area(a))[0]
}

function background(container) {
  let el = container
  while (el) {
    const color = getComputedStyle(el).backgroundColor
    if (color && color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color)) return color
    el = el.parentElement
  }
  return '#ffffff'
}

function inlineStyles(source, target) {
  const sources = [source, ...source.querySelectorAll('*')]
  const targets = [target, ...target.querySelectorAll('*')]
  sources.forEach((el, i) => {
    const out = targets[i]
    if (!out?.style) return
    const cs = getComputedStyle(el)
    for (const prop of el.namespaceURI === XHTML ? [...PROPS, ...HTML_PROPS] : PROPS) {
      const value = cs.getPropertyValue(prop)
      if (value !== '') out.style.setProperty(prop, value)
    }
  })
}

async function inlineImages(root) {
  // <img> inside the HTML of card nodes: an SVG drawn as an image loads nothing either.
  await Promise.all([...root.querySelectorAll('img')].map(async (img) => {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) return
    try {
      img.setAttribute('src', await toDataUrl(new URL(src, document.baseURI).href))
    } catch {
      img.remove()
    }
  }))
  const images = [...root.querySelectorAll('image')]
  await Promise.all(images.map(async (img) => {
    const href = img.getAttribute('href') ?? img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (!href || href.startsWith('data:')) return
    try {
      const data = await toDataUrl(new URL(href, document.baseURI).href)
      // d3 writes xlink:href without a prefix, so setAttribute('href') would reuse that attribute: remove it first.
      img.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
      img.setAttribute('href', data)
    } catch {
      img.remove() // unreachable or cross-origin without CORS: leave the node without its picture
    }
  }))
}

/** Bundled fonts the drawing uses, embedded: an SVG drawn as an image can't load them. */
async function embedFonts(root) {
  const markup = new XMLSerializer().serializeToString(root)
  const rules = []
  for (const [family, path] of Object.entries(BUNDLED_FONTS)) {
    if (!markup.includes(family)) continue
    try {
      rules.push(`@font-face { font-family: ${family}; src: url(${await toDataUrl(new URL(path, document.baseURI).href)}); }`)
    } catch {
      // unavailable: the text falls back to the next font of its list
    }
  }
  if (!rules.length) return
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = rules.join('\n')
  root.prepend(style)
}

const dataUrls = new Map()

/** The file at `url` as a data URL (cached per URL). */
export function toDataUrl(url) {
  if (!dataUrls.has(url)) {
    dataUrls.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(r.status)
      return r.blob()
    }).then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })))
    dataUrls.get(url).catch(() => dataUrls.delete(url))
  }
  return dataUrls.get(url)
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The graph could not be drawn as an image.'))
    img.src = url
  })
}
