// A button that opens a list of actions (WAI-ARIA menu button pattern):
// click, Enter, Space or ↓ opens it; ↑/↓ move, Enter runs, Escape closes.
import { h } from './dom.js'

/**
 * items: [{ label, hint?, onclick, disabled?: () => boolean } | 'separator' | { heading }]
 * Returns the wrapper element; its `button` property is the menu button.
 */
export function menuButton({ label, items, primary = false, id, align = 'start' }) {
  const list = h('div', { class: `pg-menu pg-menu-${align}`, role: 'menu', hidden: true })
  const button = h('button', {
    id,
    class: `pg-btn pg-menu-btn${primary ? ' pg-btn-primary' : ''}`,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  }, label, h('span', { class: 'pg-menu-caret', 'aria-hidden': 'true' }))
  const wrap = h('div', { class: 'pg-menu-wrap' }, button, list)
  wrap.button = button

  const entries = () => [...list.querySelectorAll('[role="menuitem"]:not([disabled])')]

  function render() {
    list.replaceChildren(...items.map((item) => {
      if (item === 'separator') return h('div', { class: 'pg-menu-sep', role: 'separator' })
      if (item.heading) return h('div', { class: 'pg-menu-heading', role: 'presentation' }, item.heading)
      return h('button', {
        class: 'pg-menu-item',
        role: 'menuitem',
        tabindex: '-1',
        disabled: item.disabled?.() ?? false,
        onclick: () => {
          close()
          item.onclick()
        },
      }, h('span', { class: 'pg-menu-label' }, item.label), item.hint ? h('span', { class: 'pg-menu-hint' }, item.hint) : null)
    }))
  }

  function open(focus = 'first') {
    render()
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outside, true)
    const all = entries()
    ;(focus === 'last' ? all.at(-1) : all[0])?.focus()
  }

  function close({ refocus = false } = {}) {
    if (list.hidden) return
    list.hidden = true
    button.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (refocus) button.focus()
  }

  function outside(event) {
    if (!wrap.contains(event.target)) close()
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()))
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      open(event.key === 'ArrowUp' ? 'last' : 'first')
    }
  })
  list.addEventListener('keydown', (event) => {
    const all = entries()
    const index = all.indexOf(document.activeElement)
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key]
    if (move) {
      event.preventDefault()
      all[(index + move + all.length) % all.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      ;(event.key === 'Home' ? all[0] : all.at(-1))?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close({ refocus: true })
    } else if (event.key === 'Tab') {
      close()
    }
  })
  return wrap
}
