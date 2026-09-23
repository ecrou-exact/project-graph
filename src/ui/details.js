// Free-form `details` as properties-panel entries, rendered recursively like
// OCD Viewer: a URL becomes a link, a list becomes chips, an object becomes a
// block of labelled sub-fields. Labels are the keys with "_" turned into spaces.
import { h } from './dom.js'
import { link } from './githubCard.js'

export function detailLabel(key) {
  return String(key).replace(/_/g, ' ')
}

function scalar(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const text = String(value)
  if (/^https?:\/\/\S+$/i.test(text)) return link(text)
  if (/^mailto:\S+$/i.test(text)) return link(text, text.slice(7))
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(text)) return link(`mailto:${text}`, text)
  return text
}

function valueElement(value) {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return h('span', { class: 'pg-detail-list' }, value.map((v) => h('span', {}, scalar(v))))
    }
    return h('div', { class: 'pg-detail-stack' }, value.map((v) => valueElement(v)))
  }
  if (value && typeof value === 'object') {
    return h('div', { class: 'pg-detail-group' }, Object.entries(value).map(([key, v]) => h('div', { class: 'pg-detail-row' },
      h('span', { class: 'pg-detail-key' }, detailLabel(key)),
      h('span', { class: 'pg-detail-value' }, valueElement(v)))))
  }
  return scalar(value)
}

/** { status: "active", repository: { url, … } } -> [{ name, value }] for Pivotick. */
export function detailEntries(details) {
  return Object.entries(details ?? {}).map(([key, value]) => {
    const el = valueElement(value)
    return { name: detailLabel(key), value: typeof el === 'string' ? el : h('span', {}, el) }
  })
}
