import { h } from './dom.js'

/**
 * Opens a modal dialog around a form.
 * @param {object} options
 * @param {string} options.title
 * @param {(body: HTMLElement) => { values(): object, validate(): string|null, showError(m: string|null): void }} options.build
 * @param {string} [options.submitLabel]
 * @returns {Promise<object|null>} the form values, or null when cancelled
 */
export function openFormModal({ title, build, submitLabel = 'Save' }) {
  return new Promise((resolve) => {
    const body = h('div', { class: 'pg-form' })
    const form = build(body)
    const dialog = h('dialog', { class: 'pg-modal' },
      h('form', { method: 'dialog', onsubmit: submit },
        h('header', { class: 'pg-modal-header' },
          h('h2', {}, title),
          h('button', { type: 'button', class: 'pg-btn pg-btn-ghost', 'aria-label': 'Close', onclick: () => close(null) }, '✕')),
        body,
        h('footer', { class: 'pg-modal-footer' },
          h('button', { type: 'button', class: 'pg-btn', onclick: () => close(null) }, 'Cancel'),
          h('button', { type: 'submit', class: 'pg-btn pg-btn-primary' }, submitLabel))))

    let settled = false
    function close(result) {
      if (settled) return
      settled = true
      dialog.close()
      dialog.remove()
      resolve(result)
    }
    function submit(event) {
      event.preventDefault()
      const error = form.validate()
      form.showError(error)
      if (!error) close(form.values())
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close(null)
    })

    document.body.append(dialog)
    dialog.showModal()
    body.querySelector('input:not([readonly]):not([type=checkbox]), select, textarea')?.focus()
  })
}

export function confirmModal(message, { confirmLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'pg-modal pg-modal-small' },
      h('div', { class: 'pg-form' }, h('p', {}, message)),
      h('footer', { class: 'pg-modal-footer' },
        h('button', { type: 'button', class: 'pg-btn', onclick: () => done(false) }, 'Cancel'),
        h('button', { type: 'button', class: `pg-btn ${danger ? 'pg-btn-danger' : 'pg-btn-primary'}`, onclick: () => done(true) }, confirmLabel)))
    function done(result) {
      dialog.close()
      dialog.remove()
      resolve(result)
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      done(false)
    })
    document.body.append(dialog)
    dialog.showModal()
  })
}

export function toast(message, kind = 'info') {
  const el = h('div', { class: `pg-toast pg-toast-${kind}`, role: 'status' }, message)
  document.body.append(el)
  setTimeout(() => el.classList.add('pg-toast-out'), 3200)
  setTimeout(() => el.remove(), 3600)
}
