// Icons drawn with `imageFit: "icon"` are light glyphs meant to sit on the
// node's colour. Pivotick also shows the bare image in its tooltip, side panel
// and neighbour list, where a white glyph on a white background disappears.
// So such icons are handed to Pivotick already drawn on the node's colour, in
// the node's shape: invisible on the canvas (same colour, inside the node),
// readable everywhere else.

const sources = new Map() // image path -> Promise<string|null> (SVG markup, null when unusable)
const loaded = new Map() // image path -> string|null, once the promise settled

// Backgrounds in a 32×32 box, and where the glyph sits inside each one.
const BACKGROUNDS = {
  circle: { shape: '<circle cx="16" cy="16" r="16"/>', glyph: [4, 4, 24] },
  square: { shape: '<rect width="32" height="32" rx="4"/>', glyph: [4, 4, 24] },
  hexagon: { shape: '<polygon points="8,2 24,2 32,16 24,30 8,30 0,16"/>', glyph: [5, 5, 22] },
  triangle: { shape: '<polygon points="16,1 31,30 1,30"/>', glyph: [9, 12, 14] },
}

/**
 * The icon drawn on its background, as a data URL — or undefined when the SVG
 * source isn't loaded (yet), or the image isn't an SVG we can read.
 */
export function tintedIcon(path, color, shape) {
  const svg = loaded.get(path)
  if (!svg) return undefined
  const bg = BACKGROUNDS[shape] ?? BACKGROUNDS.circle
  const [x, y, size] = bg.glyph
  // Nest the icon's own <svg>, resized and placed over the background.
  const glyph = svg
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<svg\b[^>]*>/, (tag) => tag
      .replace(/\s(width|height)="[^"]*"/g, '')
      .replace('<svg', `<svg x="${x}" y="${y}" width="${size}" height="${size}"`))
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="${escapeAttr(color)}">${bg.shape}</g>${glyph}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

/** Fetches (once) the SVG source behind an image path. Resolves when settled. */
export function loadIcon(path) {
  if (!sources.has(path)) {
    const promise = readSvg(path)
      .catch(() => null)
      .then((svg) => {
        loaded.set(path, svg)
        return svg
      })
    sources.set(path, promise)
  }
  return sources.get(path)
}

export function isIconLoaded(path) {
  return loaded.has(path)
}

async function readSvg(path) {
  if (path.startsWith('data:')) {
    const [header, body] = path.split(',', 2)
    if (!header.startsWith('data:image/svg+xml')) return null
    return header.includes(';base64') ? atob(body) : decodeURIComponent(body)
  }
  if (!/\.svg(\?|#|$)/i.test(path)) return null
  const response = await fetch(path)
  if (!response.ok) return null
  const text = await response.text()
  return text.includes('<svg') ? text : null
}

function escapeAttr(value) {
  return String(value).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c])
}
