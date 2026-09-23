/** Minimal hyperscript helper: h('div', { class: 'x', onclick }, child, 'text'). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value)
    else if (key === 'class') el.className = value
    else if (key === 'dataset') Object.assign(el.dataset, value)
    else if (key in el && typeof value !== 'string') el[key] = value
    else el.setAttribute(key, value === true ? '' : value)
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue
    el.append(child instanceof globalThis.Node ? child : String(child))
  }
  return el
}
