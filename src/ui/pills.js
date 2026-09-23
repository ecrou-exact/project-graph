// Tag pills as HTML, matching the ones drawn under nodes on the graph.
import { badgeIconSvg } from '../badgeIcons.js'
import { readableOn, tagLook } from '../model.js'
import { h } from './dom.js'

export function tagPill(name, tags, { small = false } = {}) {
  const look = tagLook(name, tags)
  const fg = readableOn(look.color)
  const pill = h('span', { class: `pg-pill${small ? ' pg-pill-small' : ''}`, title: `#${name}` })
  pill.style.background = look.color
  pill.style.color = fg
  const icon = badgeIconSvg(look.icon, fg)
  if (icon) {
    const holder = h('span', { class: 'pg-pill-icon' })
    holder.innerHTML = icon // bundled, trusted markup
    pill.append(holder)
  }
  pill.append(name)
  return pill
}

export function tagPills(names, tags, options) {
  return h('span', { class: 'pg-pills-html' }, (names ?? []).map((name) => tagPill(name, tags, options)))
}
