// Card nodes (`shape: "card"`): a rounded box with the image and the label
// inside, like the boxes of a drawn diagram. Pivotick draws them through its
// `html` channel with no shape behind (`shape: 'none'`): it measures the card,
// and edges land on its border.
//
// The other card shapes (model.js CARD_SHAPES) are the same box drawn as a
// pill, an ellipse, or — as an SVG background stretched over the box — a
// diamond, a cylinder, a document or a parallelogram. A background image (a
// data: URL) rather than an <svg> child keeps the PNG export simple.
import { cardLook } from './model.js'

// Shapes drawn as an SVG background, in a 100 × 100 box stretched to the card.
const OUTLINES = {
  diamond: 'M50,1 L99,50 L50,99 L1,50 Z',
  parallelogram: 'M18,1 L99,1 L82,99 L1,99 Z',
  document: 'M1,1 L99,1 L99,86 C75,74 60,104 36,94 C22,88 12,86 1,90 Z',
  // body, then the front rim of the top (drawn again over the fill)
  cylinder: 'M1,10 C1,-2 99,-2 99,10 L99,90 C99,102 1,102 1,90 Z M1,10 C1,22 99,22 99,10',
}

// Room the content needs inside the shape: a diamond's text must fit in its
// middle, an ellipse's within the curve (the box grows by this factor).
const GROW = { diamond: 1.75, ellipse: 1.35 }
// Extra inner space on each side [top, right, bottom, left], in pixels.
const EXTRA = { cylinder: [14, 0, 6, 0], document: [0, 0, 12, 0], parallelogram: [0, 18, 0, 18], pill: [0, 12, 0, 12] }

// Images whose size is known: until then a card can't be measured right.
const ready = new Set()
const pending = new Map() // path -> Promise

/**
 * The card's element for a node. `onImage` is called once when an image that
 * wasn't loaded yet arrives (the card must then be measured again).
 */
export function cardElement(data, nodeTypes, onImage) {
  const a = cardLook(data, nodeTypes)
  const card = document.createElement('div')
  card.className = `pg-card pg-card-${a.imagePosition} pg-card-shape-${a.shape}`
  const stroke = Number(a.borderWidth) > 0 && a.borderColor !== 'none' ? Number(a.borderWidth) : 0
  const pad = Number(a.padding)
  const extra = EXTRA[a.shape] ?? [0, 0, 0, 0]
  Object.assign(card.style, {
    padding: extra.map((e) => `${pad + e}px`).join(' '),
    color: a.textColor,
    fontSize: `${Number(a.labelSize)}px`,
  })
  if (OUTLINES[a.shape]) {
    card.style.backgroundImage = `url("${outline(a.shape, a.color, stroke ? a.borderColor : 'none', stroke)}")`
  } else {
    card.style.background = a.color
    card.style.border = stroke ? `${stroke}px solid ${a.borderColor}` : 'none'
  }
  if (a.font) card.style.fontFamily = a.font
  if (Number(a.width) > 0) card.style.width = `${Number(a.width)}px`
  if (Number(a.height) > 0) card.style.height = `${Number(a.height)}px`

  const main = document.createElement('div')
  main.className = 'pg-card-main'
  if (a.image) {
    const img = document.createElement('img')
    img.className = 'pg-card-image'
    img.alt = ''
    img.src = a.image
    img.style.height = `${Number(a.imageSize)}px`
    main.append(img)
    if (!ready.has(a.image)) preload(a.image).then(onImage)
  }
  if (!a.hideLabel && a.label) main.append(textBlock('pg-card-label', a.label))
  card.append(main)
  if (a.subtitle) card.append(textBlock('pg-card-subtitle', a.subtitle))
  if (GROW[a.shape] && !(Number(a.width) > 0 && Number(a.height) > 0)) grow(card, GROW[a.shape], a)
  return card
}

/** The shape's outline as an SVG data: URL, its stroke kept even when stretched. */
function outline(shape, fill, stroke, width) {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 102 102" preserveAspectRatio="none">`
    + `<path d="${OUTLINES[shape]}" fill="${attr(fill)}" stroke="${attr(stroke)}" stroke-width="${width}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function attr(value) {
  return String(value).replace(/["<>&]/g, '')
}

/**
 * Makes room around the content of a diamond or an ellipse: the card is
 * measured off-screen as it is, then given that size times `factor` (a size
 * set on the node is kept).
 */
function grow(card, factor, a) {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden'
  probe.append(card)
  document.body.append(probe)
  const { width, height } = card.getBoundingClientRect()
  probe.remove()
  if (!width || !height) return
  if (!(Number(a.width) > 0)) card.style.width = `${Math.ceil(width * factor)}px`
  if (!(Number(a.height) > 0)) card.style.height = `${Math.ceil(height * factor)}px`
}

/** Text with its line breaks ("\n") kept. */
function textBlock(className, text) {
  const span = document.createElement('span')
  span.className = className
  span.textContent = text
  return span
}

function preload(path) {
  if (!pending.has(path)) {
    pending.set(path, new Promise((resolve) => {
      const img = new Image()
      img.onload = img.onerror = () => {
        ready.add(path)
        resolve()
      }
      img.src = path
    }))
  }
  return pending.get(path)
}
