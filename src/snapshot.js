// A PNG picture of the whole graph as drawn, for exports: Pivotick's SVG is
// cloned with the computed styles written inline (stylesheets don't follow the
// SVG into an image) and its images turned into data URLs (an SVG drawn as an
// image loads nothing), then drawn on a canvas.

// The properties that make the drawing: SVG paint, text, and the HTML labels
// inside <foreignObject>.
const PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'visibility', 'display', 'clip-path', 'paint-order', 'marker-start', 'marker-end',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'line-height', 'white-space', 'text-align',
  'color', 'background-color', 'border', 'border-radius', 'padding', 'box-shadow', 'box-sizing', 'transform', 'transform-origin', 'overflow', 'x', 'y',
]

// Pivotick's layers that are not part of the picture.
const SKIP = '.selection-box, .shadow-edges, .pvt-shadow-edge'

/**
 * The graph drawn in `container` as a PNG data URL (null when there is nothing
 * to draw). `scale` multiplies the resolution; the longest side stays under
 * `maxSide` pixels.
 */
export async function graphSnapshot(container, { scale = 2, maxSide = 4000, padding = 40 } = {}) {
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
  const ratio = Math.min(scale, maxSide / Math.max(view.width, view.height))
  const width = Math.round(view.width * ratio)
  const height = Math.round(view.height * ratio)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`)
  clone.setAttribute('width', width)
  clone.setAttribute('height', height)
  clone.removeAttribute('style')
  clone.style.background = background(container)
  await inlineImages(clone)

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
    for (const prop of PROPS) {
      const value = cs.getPropertyValue(prop)
      if (value !== '') out.style.setProperty(prop, value)
    }
  })
}

async function inlineImages(root) {
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
