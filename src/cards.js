// Card nodes (`shape: "card"`): a rounded box with the image and the label
// inside, like the boxes of a drawn diagram. Pivotick draws them through its
// `html` channel with no shape behind (`shape: 'none'`): it measures the card,
// and edges land on its border.
import { cardLook } from './model.js'

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
  card.className = `pg-card pg-card-${a.imagePosition}`
  Object.assign(card.style, {
    background: a.color,
    border: Number(a.borderWidth) > 0 && a.borderColor !== 'none' ? `${Number(a.borderWidth)}px solid ${a.borderColor}` : 'none',
    padding: `${Number(a.padding)}px`,
    color: a.textColor,
    fontSize: `${Number(a.labelSize)}px`,
  })
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
  return card
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
