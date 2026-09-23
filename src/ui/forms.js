// Declarative forms for nodes, edges and types.
import { h } from './dom.js'
import {
  DEFAULT_EDGE, DEFAULT_NODE, DIRECTIONS, IMAGE_FITS, LABEL_FONTS, SHAPES,
  parseDetails, parseGithub, parseLinks, parseTags, resolveEdge, resolveNode, slugify, tagLook, uniqueId,
} from '../model.js'
import { fetchRepo } from '../github.js'
import { repoCard, repoError } from './githubCard.js'
import { tagPill } from './pills.js'
import { BADGE_ICONS, badgeIconSvg } from '../badgeIcons.js'

export const BUNDLED_ICONS = ['project', 'platform', 'tool', 'data', 'organization', 'format', 'rule', 'code']
  .map((name) => `icons/${name}.svg`)

const SHAPE_LABELS = { circle: 'Circle', square: 'Square', triangle: 'Triangle', hexagon: 'Hexagon' }
const FIT_LABELS = { cover: 'Cover', contain: 'Contain', icon: 'Icon', frame: 'Frame' }

// --- field widgets -----------------------------------------------------------

function textInput(field, value) {
  const input = field.multiline
    ? h('textarea', { rows: 3, placeholder: field.placeholder })
    : h('input', { type: field.inputType ?? 'text', placeholder: field.placeholder, readonly: field.readonly })
  input.value = value ?? ''
  return { el: input, input, get: () => input.value.trim() || undefined, set: (v) => (input.value = v ?? '') }
}

function numberInput(field, value) {
  const input = h('input', { type: 'number', min: field.min, max: field.max, step: field.step ?? 1, placeholder: field.placeholder })
  input.value = value ?? ''
  return { el: input, input, get: () => (input.value === '' ? undefined : Number(input.value)) }
}

function selectInput(field, value) {
  const input = h('select', { disabled: field.readonly },
    field.options.map(([v, label]) => h('option', { value: v }, label)))
  input.value = value ?? ''
  return { el: input, input, get: () => input.value || undefined, set: (v) => (input.value = v ?? '') }
}

/** A colour that is either inherited (unchecked) or explicitly set. */
function colorInput(field, value) {
  const toggle = h('input', { type: 'checkbox', checked: Boolean(value), title: 'Custom colour' })
  const input = h('input', { type: 'color', disabled: !value })
  input.value = value ?? field.inherited ?? '#888888'
  toggle.addEventListener('change', () => (input.disabled = !toggle.checked))
  let inherited = field.inherited
  const note = h('span', { class: 'pg-muted' })
  const refresh = () => (note.textContent = toggle.checked ? '' : `inherited${inherited ? ` (${inherited})` : ''}`)
  toggle.addEventListener('change', refresh)
  refresh()
  const el = h('div', { class: 'pg-color' }, toggle, input, note)
  return {
    el,
    input,
    get: () => (toggle.checked ? input.value : undefined),
    // Shows another inherited colour, e.g. after the node's type changed.
    setInherited(color) {
      inherited = color
      if (!toggle.checked) input.value = color
      refresh()
    },
  }
}

/** A colour that can also be explicitly "none" (e.g. no label background). */
function colorChoiceInput(field, value) {
  const mode = h('select', {},
    h('option', { value: '' }, field.inheritedLabel ?? 'inherited'),
    h('option', { value: 'none' }, 'None'),
    h('option', { value: 'custom' }, 'Colour'))
  const input = h('input', { type: 'color' })
  input.value = value && value !== 'none' ? value : field.fallback ?? '#ffffff'
  mode.value = !value ? '' : value === 'none' ? 'none' : 'custom'
  const sync = () => (input.hidden = mode.value !== 'custom')
  mode.addEventListener('change', sync)
  sync()
  return {
    el: h('div', { class: 'pg-color' }, mode, input),
    input: mode,
    get: () => (mode.value === 'custom' ? input.value : mode.value || undefined),
    setInherited(text) {
      mode.options[0].textContent = text
    },
  }
}

/** Local, trusted SVG markup (bundled icons, generated badges) as an element. */
export function svgElement(markup, className = 'pg-svg') {
  const span = h('span', { class: className })
  span.innerHTML = markup ?? ''
  return span
}


/** Button opening a grid of the bundled Font Awesome icons. */
function iconPicker(value, onChange) {
  let current = value
  const button = h('button', { type: 'button', class: 'pg-btn pg-icon-pick', title: 'Choose an icon' })
  const grid = h('div', { class: 'pg-icon-grid', hidden: true })
  const render = () => button.replaceChildren(
    current ? svgElement(badgeIconSvg(current, 'currentColor')) : h('span', { class: 'pg-muted' }, 'No icon'),
    h('span', { class: 'pg-muted' }, ' ▾'))
  const pick = (name) => {
    current = name
    close()
    render()
    onChange?.(name)
  }
  grid.append(
    h('button', { type: 'button', class: 'pg-icon-cell pg-icon-none', title: 'No icon', onclick: () => pick(undefined) }, '∅'),
    ...Object.keys(BADGE_ICONS).map((name) => h('button', {
      type: 'button', class: 'pg-icon-cell', title: name, onclick: () => pick(name),
    }, svgElement(badgeIconSvg(name, 'currentColor')))))
  // A floating panel over the modal (position: fixed), placed under the button,
  // or above it when there isn't room. It stays inside the <dialog>: anything
  // outside a modal dialog is inert and drawn behind it.
  const place = () => {
    const box = button.getBoundingClientRect()
    const width = Math.min(320, innerWidth - 16)
    const height = Math.min(260, innerHeight - 16)
    const below = innerHeight - box.bottom - 8 >= height
    grid.style.width = `${width}px`
    grid.style.maxHeight = `${height}px`
    grid.style.left = `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`
    grid.style.top = `${below ? box.bottom + 4 : Math.max(8, box.top - height - 4)}px`
  }
  const close = (event) => {
    if (event && (grid.contains(event.target) || button.contains(event.target))) return
    grid.hidden = true
    document.removeEventListener('pointerdown', close, true)
  }
  button.addEventListener('click', () => {
    if (!grid.hidden) return close()
    grid.hidden = false
    place()
    document.addEventListener('pointerdown', close, true)
  })
  render()
  return { el: h('div', { class: 'pg-icon-picker' }, button, grid), get: () => current }
}

function iconInput(field, value) {
  const picker = iconPicker(value, field.onChange)
  return { el: picker.el, get: picker.get }
}

/**
 * "#security #cve" text field, with one row per tag to set its badge colour and
 * icon. Those settings are shared by every node with the tag: they are edited
 * in `field.tagDefs`, a draft of the document's tag registry.
 */
function tagsInput(field, value) {
  const defs = field.tagDefs
  const input = h('input', { type: 'text', placeholder: '#security #open-source' })
  input.value = (value ?? []).map((t) => `#${t}`).join(' ')
  const rows = h('div', { class: 'pg-tag-rows' })
  const row = (name) => {
    const def = defs[name] ?? (defs[name] = {})
    const preview = h('span')
    const refresh = () => preview.replaceChildren(tagPill(name, defs))
    const color = h('input', { type: 'color', title: 'Badge colour' })
    color.value = tagLook(name, defs).color
    color.addEventListener('input', () => {
      def.color = color.value
      refresh()
    })
    const icon = iconPicker(def.icon, (n) => {
      if (n) def.icon = n
      else delete def.icon
      refresh()
    })
    refresh()
    return h('div', { class: 'pg-tag-row' }, preview, color, icon.el)
  }
  // Tags already used elsewhere, one click away.
  const suggestions = h('div', { class: 'pg-tag-suggestions' })
  const addTag = (name) => {
    input.value = `${input.value.trim()} #${name}`.trim()
    renderRows()
  }
  const renderSuggestions = () => {
    const current = new Set(parseTags(input.value))
    const free = (field.knownTags ?? []).filter((t) => !current.has(t))
    suggestions.hidden = free.length === 0
    suggestions.replaceChildren(h('span', { class: 'pg-muted' }, 'Existing tags:'),
      ...free.map((name) => h('button', {
        type: 'button', class: 'pg-tag-chip', title: `Add #${name}`, onclick: () => addTag(name),
      }, '+ ', tagPill(name, defs))))
  }
  const renderRows = () => {
    rows.replaceChildren(...parseTags(input.value).map(row))
    renderSuggestions()
  }
  input.addEventListener('input', renderSuggestions)
  input.addEventListener('change', renderRows)
  input.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === ',' || e.key === 'Enter') renderRows()
  })
  renderRows()
  return {
    el: h('div', { class: 'pg-tags-field' }, input, suggestions, rows),
    input,
    get: () => {
      const tags = parseTags(input.value)
      return tags.length ? tags : undefined
    },
  }
}

/**
 * "owner/repo" or a GitHub URL. The only place the GitHub API is called: when
 * the repository is entered or changed, or on Refresh. The summary it returns
 * is saved with the node (`githubInfo`), and shown from there afterwards.
 */
function githubInput(field, value) {
  const input = h('input', { type: 'text', placeholder: 'owner/repo or https://github.com/owner/repo' })
  input.value = value ?? ''
  const status = h('div', { class: 'pg-gh-status' })
  const sameRepo = (repo, slug) => repo?.fullName && slug && repo.fullName.toLowerCase() === slug.toLowerCase()
  let repo = sameRepo(field.info, parseGithub(value)) ? field.info : null
  let timer
  let seq = 0

  const refreshButton = (label = '↻ Refresh from GitHub') => h('button', {
    type: 'button', class: 'pg-btn pg-btn-ghost pg-gh-refresh', title: 'Fetch the latest details from GitHub (one API call)',
    onclick: () => check(true),
  }, label)

  const show = () => {
    const slug = parseGithub(input.value)
    if (!input.value.trim()) return status.replaceChildren()
    if (!slug) return status.replaceChildren(h('small', { class: 'pg-warning' }, 'Not a GitHub repository: use owner/repo or a github.com URL.'))
    if (sameRepo(repo, slug)) return status.replaceChildren(repoCard(repo), refreshButton())
    status.replaceChildren(h('small', { class: 'pg-muted' }, 'No GitHub details saved for this repository yet.'), refreshButton('↓ Fetch details from GitHub'))
  }

  const check = (force = false) => {
    const slug = parseGithub(input.value)
    if (!slug) return show()
    const mine = ++seq
    status.replaceChildren(h('small', { class: 'pg-muted' }, `Looking up ${slug} on GitHub…`))
    fetchRepo(slug, { force })
      .then((result) => {
        if (mine !== seq) return
        repo = result
        show()
      })
      .catch((error) => mine === seq && status.replaceChildren(repoError(slug, error.message), refreshButton()))
  }

  input.addEventListener('input', () => {
    clearTimeout(timer)
    const slug = parseGithub(input.value)
    // A changed repository is looked up; the saved one is just shown again.
    timer = setTimeout(() => (slug && !sameRepo(repo, slug) ? check() : show()), 600)
  })
  show()
  return {
    el: h('div', { class: 'pg-gh-field' }, input, status),
    input,
    get: () => (input.value.trim() ? parseGithub(input.value) ?? input.value.trim() : undefined),
    /** The summary to save with the node, if it matches the repository entered. */
    info: () => (sameRepo(repo, parseGithub(input.value)) ? repo : undefined),
  }
}

/** Editable list of { label, url } links. */
function linksInput(field, value) {
  const list = h('div', { class: 'pg-links-edit' })
  const addRow = (link = {}) => {
    const label = h('input', { type: 'text', placeholder: 'Label (optional)' })
    const url = h('input', { type: 'url', placeholder: 'https://…' })
    label.value = link.label ?? ''
    url.value = link.url ?? ''
    const row = h('div', { class: 'pg-link-row' }, label, url,
      h('button', { type: 'button', class: 'pg-icon-btn pg-icon-danger', title: 'Remove', onclick: () => row.remove() }, '✕'))
    list.append(row)
    return row
  }
  for (const link of value ?? []) addRow(link)
  const add = h('button', { type: 'button', class: 'pg-btn', onclick: () => addRow().querySelector('input[type=url]').focus() }, '+ Add link')
  return {
    el: h('div', { class: 'pg-links-field' }, list, add),
    get: () => {
      const links = parseLinks([...list.children].map((row) => {
        const [label, url] = row.querySelectorAll('input')
        return { label: label.value, url: url.value }
      }))
      return links.length ? links : undefined
    },
  }
}

/**
 * Free-form details as path / value rows. Nested fields are edited as paths
 * ("repository.url", "contributions.0.title") and rebuilt on save; a list of
 * simple values is edited as "a, b, c".
 */
function detailsInput(field, value) {
  const list = h('div', { class: 'pg-links-edit' })
  const addRow = (path = '', val = '', isList = false) => {
    const k = h('input', { type: 'text', placeholder: 'Field (e.g. license, repository.url)' })
    const v = h('input', { type: 'text', placeholder: isList ? 'a, b, c' : 'Value' })
    k.value = path
    v.value = isList ? val.join(', ') : String(val)
    const row = h('div', { class: 'pg-link-row', dataset: { list: isList ? '1' : '' } }, k, v,
      h('button', { type: 'button', class: 'pg-icon-btn pg-icon-danger', title: 'Remove', onclick: () => row.remove() }, '✕'))
    list.append(row)
    return row
  }
  for (const [path, val, isList] of flattenDetails(value ?? {})) addRow(path, val, isList)
  const add = h('button', { type: 'button', class: 'pg-btn', onclick: () => addRow().querySelector('input').focus() }, '+ Add field')
  return {
    el: h('div', { class: 'pg-links-field' }, list, add),
    get: () => {
      const rows = [...list.children].map((row) => {
        const [k, v] = row.querySelectorAll('input')
        const text = v.value.trim()
        return [k.value.trim(), row.dataset.list ? text.split(',').map((x) => x.trim()).filter(Boolean) : text]
      })
      const details = parseDetails(unflattenDetails(rows))
      return Object.keys(details).length ? details : undefined
    },
  }
}

/** { a: { b: 1 }, l: [{ x: 2 }], t: ['p', 'q'] } -> [['a.b', 1, false], ['l.0.x', 2, false], ['t', ['p', 'q'], true]] */
export function flattenDetails(value, prefix = '') {
  const rows = []
  for (const [key, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')) rows.push([path, v, true])
    else if (v && typeof v === 'object') rows.push(...flattenDetails(v, path))
    else rows.push([path, v, false])
  }
  return rows
}

/** The inverse of flattenDetails: numeric path segments become array indexes. */
export function unflattenDetails(rows) {
  const root = {}
  for (const [path, value] of rows) {
    const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
    if (!parts.length) continue
    let node = root
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = value
        return
      }
      node[part] ??= /^\d+$/.test(parts[i + 1]) ? [] : {}
      node = node[part]
    })
  }
  return root
}

/** Image as URL / relative path / embedded data URL, with preview and bundled icons. */
function imageInput(field, value) {
  const listId = `pg-icons-${Math.random().toString(36).slice(2)}`
  const input = h('input', { type: 'text', list: listId, placeholder: field.placeholder ?? 'https://… or icons/project.svg' })
  input.value = value ?? ''
  const preview = h('img', { class: 'pg-image-preview', alt: '' })
  const warning = h('small', { class: 'pg-warning', hidden: true },
    'This image could not be loaded: use a direct image URL (ending in .png, .svg…), a path like icons/tool.svg, or File….')
  preview.addEventListener('load', () => (warning.hidden = true))
  preview.addEventListener('error', () => {
    preview.hidden = true
    warning.hidden = !input.value.trim()
  })
  const refresh = () => {
    warning.hidden = true
    preview.src = input.value.trim()
    preview.hidden = !input.value.trim()
  }
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true })
  file.addEventListener('change', () => {
    const f = file.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      input.value = reader.result
      refresh()
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    reader.readAsDataURL(f)
  })
  input.addEventListener('input', refresh)
  refresh()
  const el = h('div', { class: 'pg-image' },
    h('div', { class: 'pg-row' },
      input,
      h('button', { type: 'button', class: 'pg-btn', onclick: () => file.click() }, 'File…'),
      h('button', { type: 'button', class: 'pg-btn pg-btn-ghost', title: 'Remove', onclick: () => { input.value = ''; refresh() } }, '✕')),
    file,
    preview,
    warning,
    h('datalist', { id: listId }, BUNDLED_ICONS.map((path) => h('option', { value: path }))))
  return { el, input, get: () => input.value.trim() || undefined }
}

/** Radio group styled as a segmented control. */
function segmentedInput(field, value) {
  const name = `pg-seg-${Math.random().toString(36).slice(2)}`
  const el = h('div', { class: 'pg-segmented', role: 'radiogroup' },
    field.options.map(([v, label, title]) => h('label', { title },
      h('input', { type: 'radio', name, value: v, checked: (value ?? '') === v }),
      h('span', {}, label))))
  return {
    el,
    get: () => el.querySelector('input:checked')?.value || undefined,
  }
}

const WIDGETS = {
  text: textInput, number: numberInput, select: selectInput, color: colorInput,
  colorChoice: colorChoiceInput, image: imageInput, segmented: segmentedInput,
  icon: iconInput, tags: tagsInput, github: githubInput, links: linksInput, details: detailsInput,
}

/**
 * Renders a list of field specs into `container`.
 * A spec is either { section: 'Title' } or { key, label, type, required?, hint?, ... }.
 * Each section becomes a tab; fields before the first section go in a first tab
 * named `firstTab`.
 */
export function renderFields(container, specs, values = {}, { firstTab = 'General' } = {}) {
  const widgets = {}
  const panelOf = {} // field key -> tab index
  const errorBox = h('div', { class: 'pg-form-error', role: 'alert', hidden: true })
  const tabBar = h('div', { class: 'pg-form-tabs', role: 'tablist' })
  const panels = []
  const tabs = []
  const addPanel = (title) => {
    const index = panels.length
    const tab = h('button', { type: 'button', class: 'pg-form-tab', role: 'tab', onclick: () => select(index) }, title)
    const panel = h('div', { class: 'pg-form-panel', role: 'tabpanel' })
    tabs.push(tab)
    panels.push(panel)
    tabBar.append(tab)
    return panel
  }
  const select = (index) => panels.forEach((panel, i) => {
    panel.hidden = i !== index
    tabs[i].classList.toggle('is-active', i === index)
    tabs[i].setAttribute('aria-selected', String(i === index))
  })

  let panel = specs[0]?.section ? null : addPanel(firstTab)
  for (const spec of specs) {
    if (spec.section) {
      panel = addPanel(spec.section)
      continue
    }
    const widget = WIDGETS[spec.type](spec, values[spec.key])
    widgets[spec.key] = widget
    panelOf[spec.key] = panels.length - 1
    panel.append(h('div', { class: `pg-field${spec.wide ? ' pg-field-wide' : ''}` },
      h('label', {}, spec.label, spec.required ? h('span', { class: 'pg-required' }, ' *') : null),
      widget.el,
      spec.hint ? h('small', { class: 'pg-muted' }, spec.hint) : null))
  }
  container.append(errorBox)
  if (panels.length > 1) container.append(tabBar)
  container.append(...panels)
  select(0)
  return {
    widgets,
    values() {
      const out = {}
      for (const [key, w] of Object.entries(widgets)) out[key] = w.get()
      return out
    },
    showError(message) {
      errorBox.textContent = message ?? ''
      errorBox.hidden = !message
    },
    missingRequired() {
      const missing = specs.find((s) => s.required && widgets[s.key]?.get() === undefined)
      if (!missing) return null
      select(panelOf[missing.key])
      return `"${missing.label}" is required.`
    },
  }
}

// --- node look: border and label ------------------------------------------------

const DEFAULT_BORDER = { color: '#ffffff', width: 2 }
const DEFAULT_LABEL_TEXT = '#1c2230'

/** Border and label fields, shared by the node form and the node type form. */
function nodeLookSpecs(inherited, word = 'inherited', currentFont, tagsSpec) {
  return [
    { section: 'Border' },
    {
      key: 'borderWidth', label: 'Width', type: 'number', min: 0, max: 12,
      placeholder: `${word} (${inherited.borderWidth ?? DEFAULT_BORDER.width})`, hint: '0 = no border',
    },
    { key: 'borderColor', label: 'Colour', type: 'color', inherited: inherited.borderColor ?? DEFAULT_BORDER.color },
    { section: 'Label' },
    {
      key: 'hideLabel', label: 'Show label', type: 'select',
      options: [['', `${word} (${isHidden(inherited) ? 'hidden' : 'shown'})`], ['false', 'Show'], ['true', 'Hide']],
      hint: 'Hide it when the image already shows the name.',
    },
    { key: 'labelSize', label: 'Text size', type: 'number', min: 6, max: 48, placeholder: `${word} (${inherited.labelSize ?? 'auto'})` },
    {
      key: 'labelFont', label: 'Font', type: 'select',
      options: fontOptions(inherited.labelFont, word, currentFont),
    },
    { key: 'labelColor', label: 'Text colour', type: 'color', inherited: inherited.labelColor ?? DEFAULT_LABEL_TEXT },
    {
      key: 'labelBackground', label: 'Background', type: 'colorChoice',
      inheritedLabel: `${word} (${inherited.labelBackground ?? 'default'})`, fallback: '#ffffff',
    },
    { section: 'Badges' },
    ...(tagsSpec ? [tagsSpec] : []),
    {
      key: 'hideBadges', label: 'Show badges', type: 'select',
      options: [['', `${word} (${isTrue(inherited.hideBadges) ? 'hidden' : 'shown'})`], ['false', 'Show'], ['true', 'Hide']],
    },
  ]
}

/** Updates the border/label fields' inherited hints after the type changed. */
function refreshLookHints(widgets, inherited) {
  widgets.borderWidth.input.placeholder = `inherited (${inherited.borderWidth ?? DEFAULT_BORDER.width})`
  widgets.borderColor.setInherited(inherited.borderColor ?? DEFAULT_BORDER.color)
  widgets.hideLabel.input.options[0].textContent = `inherited (${isHidden(inherited) ? 'hidden' : 'shown'})`
  widgets.labelSize.input.placeholder = `inherited (${inherited.labelSize ?? 'auto'})`
  widgets.labelFont.input.options[0].textContent = fontOptions(inherited.labelFont, 'inherited')[0][1]
  widgets.labelColor.setInherited(inherited.labelColor ?? DEFAULT_LABEL_TEXT)
  widgets.labelBackground.setInherited(`inherited (${inherited.labelBackground ?? 'default'})`)
  widgets.hideBadges.input.options[0].textContent = `inherited (${isTrue(inherited.hideBadges) ? 'hidden' : 'shown'})`
}

/** Font choices; a custom font-family from the JSON is kept as an option. */
function fontOptions(inheritedFont, word, current) {
  const name = (f) => LABEL_FONTS[f]?.label ?? f
  const options = [['', `${word} (${inheritedFont ? name(inheritedFont) : 'default'})`],
    ...Object.entries(LABEL_FONTS).map(([key, f]) => [key, f.label])]
  if (current && !LABEL_FONTS[current]) options.push([current, current])
  return options
}

function isHidden(attrs) {
  return isTrue(attrs.hideLabel)
}

function isTrue(v) {
  return v === true || v === 'true'
}

/** Form values -> document values: tri-state selects become booleans. */
function lookValues(v) {
  for (const key of ['hideLabel', 'hideBadges']) if (v[key] !== undefined) v[key] = v[key] === 'true'
  return v
}

/** Tri-state selects are rendered from strings. */
function lookInitial(values) {
  const str = (v) => (v === undefined ? '' : String(v))
  return { hideLabel: str(values.hideLabel), hideBadges: str(values.hideBadges) }
}

// --- node form -----------------------------------------------------------------

export function nodeFields(container, init, ctx) {
  const values = init.values ?? {}
  // Draft of the tag registry, edited from the Badges tab.
  const tagDefs = structuredClone(ctx.tags ?? {})
  const editing = init.mode === 'edit'
  const inherited = resolveNode({ type: values.type }, ctx.nodeTypes)
  const typeOptions = [['', '(none)'], ...Object.entries(ctx.nodeTypes).map(([k, t]) => [k, t.label || k])]

  const form = renderFields(container, [
    { key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. Rulezet' },
    {
      key: 'id', label: 'Id', type: 'text', required: true, readonly: editing,
      hint: editing ? 'The id cannot change after creation.' : 'Generated from the label, editable.',
    },
    {
      key: 'type', label: 'Type', type: 'select', options: typeOptions,
      hint: Object.keys(ctx.nodeTypes).length ? 'The type provides default colour, shape, size and image.' : 'No node types yet: add some in the Types tab.',
    },
    { key: 'description', label: 'Description', type: 'text', multiline: true, wide: true },
    { section: 'Links' },
    { key: 'url', label: 'Website', type: 'text', inputType: 'url', placeholder: 'https://…', wide: true },
    {
      key: 'github', label: 'GitHub repository', type: 'github', wide: true, info: values.githubInfo,
      hint: 'Its description, stars, language, licence and last update are fetched once and saved with the node.',
    },
    { key: 'links', label: 'Other links', type: 'links', wide: true },
    { section: 'Details' },
    {
      key: 'details', label: 'Extra fields', type: 'details', wide: true,
      hint: 'Anything else worth showing in the node details: license, status, maintainers…',
    },
    { section: 'Appearance' },
    { key: 'color', label: 'Colour', type: 'color', inherited: inherited.color },
    {
      key: 'shape', label: 'Shape', type: 'select',
      options: [['', `inherited (${SHAPE_LABELS[inherited.shape] ?? inherited.shape})`], ...SHAPES.map((s) => [s, SHAPE_LABELS[s]])],
    },
    { key: 'size', label: 'Size', type: 'number', min: 4, max: 120, placeholder: `inherited (${inherited.size ?? DEFAULT_NODE.size})` },
    { key: 'image', label: 'Image', type: 'image', wide: true, placeholder: inherited.image ? `inherited: ${inherited.image}` : undefined },
    { key: 'imageFit', label: 'Image fit', type: 'select', options: [['', 'inherited'], ...IMAGE_FITS.map((f) => [f, FIT_LABELS[f]])] },
    ...nodeLookSpecs(inherited, 'inherited', values.labelFont, {
      key: 'tags', label: 'Tags', type: 'tags', wide: true, tagDefs, knownTags: ctx.knownTags ?? [],
      hint: 'Each #tag becomes a badge on the node. A tag’s colour and icon are shared by every node with that tag.',
    }),
  ], { ...values, ...lookInitial(values) }, { firstTab: 'Content' })

  // Inherited values follow the chosen type.
  form.widgets.type.input.addEventListener('change', () => {
    const next = resolveNode({ type: form.widgets.type.get() }, ctx.nodeTypes)
    form.widgets.color.setInherited(next.color)
    form.widgets.shape.input.options[0].textContent = `inherited (${SHAPE_LABELS[next.shape] ?? next.shape})`
    form.widgets.size.input.placeholder = `inherited (${next.size ?? DEFAULT_NODE.size})`
    form.widgets.image.input.placeholder = next.image ? `inherited: ${next.image}` : 'https://… or icons/project.svg'
    refreshLookHints(form.widgets, next)
  })

  if (!editing) {
    // The id follows the label until the user types an id of their own.
    const idInput = form.widgets.id.input
    const labelInput = form.widgets.label.input
    let manual = Boolean(values.id)
    idInput.addEventListener('input', () => (manual = idInput.value.trim() !== ''))
    labelInput.addEventListener('input', () => {
      if (!manual) idInput.value = uniqueId(labelInput.value, ctx.takenIds)
    })
  }

  return {
    ...form,
    // `_tagDefs`: the edited tag registry, applied by the caller.
    values: () => ({ ...lookValues(form.values()), githubInfo: form.widgets.github.info(), _tagDefs: tagDefs }),
    validate() {
      const missing = form.missingRequired()
      if (missing) return missing
      const v = form.values()
      if (!editing && ctx.takenIds.has(v.id)) return `The id "${v.id}" already exists.`
      if (v.github && !parseGithub(v.github)) return `"${v.github}" is not a GitHub repository (owner/repo).`
      return null
    },
  }
}

// --- edge form -----------------------------------------------------------------

export function edgeFields(container, init, ctx) {
  const values = { direction: '', ...init.values }
  if (!values.from && ctx.nodes.length) values.from = ctx.nodes[0].id
  const editing = init.mode === 'edit'
  const inherited = resolveEdge({ type: values.type }, ctx.edgeTypes)
  const nodeOptions = ctx.nodes.map((n) => [n.id, n.label === n.id ? n.id : `${n.label} (${n.id})`])
  const typeOptions = [['', '(none)'], ...Object.entries(ctx.edgeTypes).map(([k, t]) => [k, t.label || k])]
  const inheritedDir = DIRECTIONS[inherited.direction] ?? DIRECTIONS[DEFAULT_EDGE.direction]

  const form = renderFields(container, [
    { key: 'from', label: 'Source', type: 'select', options: nodeOptions, required: true, readonly: init.lockEnds },
    { key: 'to', label: 'Target', type: 'select', options: nodeOptions, required: true, readonly: init.lockEnds },
    { key: 'label', label: 'Label', type: 'text', placeholder: inherited.label ? `inherited: ${inherited.label}` : 'e.g. uses, exports to…' },
    {
      key: 'type', label: 'Type', type: 'select', options: typeOptions,
      hint: Object.keys(ctx.edgeTypes).length ? undefined : 'No edge types yet: add some in the Types tab.',
    },
    {
      key: 'direction', label: 'Arrow direction', type: 'segmented', wide: true,
      options: [
        ['', `inherited ${inheritedDir.symbol}`, 'Direction set by the type'],
        ...Object.entries(DIRECTIONS).map(([k, d]) => [k, d.symbol, d.label]),
      ],
    },
    { section: 'Appearance' },
    { key: 'color', label: 'Colour', type: 'color', inherited: inherited.color },
    { key: 'width', label: 'Width', type: 'number', min: 1, max: 12, placeholder: `inherited (${inherited.width})` },
    {
      key: 'dashed', label: 'Line', type: 'select',
      options: [['', `inherited (${inherited.dashed ? 'dashed' : 'solid'})`], ['false', 'Solid'], ['true', 'Dashed']],
    },
    { section: 'Details' },
    { key: 'description', label: 'Description', type: 'text', multiline: true, wide: true },
    { key: 'details', label: 'Extra fields', type: 'details', wide: true },
  ], { ...values, dashed: values.dashed === undefined ? '' : String(values.dashed) }, { firstTab: 'Content' })

  if (!editing && !values.to && ctx.nodes.length > 1) {
    form.widgets.to.input.selectedIndex = 1
  }

  // Inherited values follow the chosen type.
  form.widgets.type.input.addEventListener('change', () => {
    const next = resolveEdge({ type: form.widgets.type.get() }, ctx.edgeTypes)
    const dir = DIRECTIONS[next.direction] ?? DIRECTIONS[DEFAULT_EDGE.direction]
    form.widgets.label.input.placeholder = next.label ? `inherited: ${next.label}` : 'e.g. uses, exports to…'
    form.widgets.direction.el.querySelector('span').textContent = `inherited ${dir.symbol}`
    form.widgets.color.setInherited(next.color)
    form.widgets.width.input.placeholder = `inherited (${next.width})`
    form.widgets.dashed.input.options[0].textContent = `inherited (${next.dashed ? 'dashed' : 'solid'})`
  })

  return {
    ...form,
    values() {
      const v = form.values()
      if (v.dashed !== undefined) v.dashed = v.dashed === 'true'
      v.id = values.id
      return v
    },
    validate() {
      return form.missingRequired()
    },
  }
}

// --- type forms ------------------------------------------------------------------

export function typeFields(container, init, ctx) {
  const { kind, name, def = {} } = init
  const isNode = kind === 'node'
  const specs = [
    {
      key: '_name', label: 'Name (JSON key)', type: 'text', required: true, readonly: Boolean(name),
      hint: name ? 'To rename a type, create a new one.' : 'e.g. project, tool, uses…',
    },
    { key: 'label', label: 'Display label', type: 'text' },
    { key: 'color', label: 'Colour', type: 'color', inherited: isNode ? DEFAULT_NODE.color : DEFAULT_EDGE.color },
  ]
  if (isNode) {
    specs.push(
      { key: 'shape', label: 'Shape', type: 'select', options: [['', 'default (circle)'], ...SHAPES.map((s) => [s, SHAPE_LABELS[s]])] },
      { key: 'size', label: 'Size', type: 'number', min: 4, max: 120, placeholder: String(DEFAULT_NODE.size) },
      { key: 'image', label: 'Image', type: 'image', wide: true },
      { key: 'imageFit', label: 'Image fit', type: 'select', options: [['', 'default'], ...IMAGE_FITS.map((f) => [f, FIT_LABELS[f]])] },
      ...nodeLookSpecs({}, 'default', def.labelFont),
    )
  } else {
    specs.push(
      { key: 'label', label: 'Default label', type: 'text', hint: 'Shown on the edge when it has no label of its own.' },
      { key: 'width', label: 'Width', type: 'number', min: 1, max: 12, placeholder: String(DEFAULT_EDGE.width) },
      { key: 'dashed', label: 'Line', type: 'select', options: [['', 'Solid'], ['true', 'Dashed']] },
      {
        key: 'direction', label: 'Default direction', type: 'segmented', wide: true,
        options: Object.entries(DIRECTIONS).map(([k, d]) => [k, d.symbol, d.label]),
      },
    )
    // An edge type's label *is* the default edge label, so drop the generic one.
    specs.splice(1, 1)
  }
  const form = renderFields(container, specs, {
    ...def, _name: name, dashed: def.dashed ? 'true' : '', direction: def.direction ?? (isNode ? undefined : 'forward'),
    ...lookInitial(def),
  })
  return {
    ...form,
    values() {
      const { _name, ...rest } = lookValues(form.values())
      if (rest.dashed !== undefined) rest.dashed = rest.dashed === 'true'
      return { name: slugify(_name) || _name, def: rest }
    },
    validate() {
      const missing = form.missingRequired()
      if (missing) return missing
      const { name: newName } = this.values()
      if (!name && ctx.takenNames.has(newName)) return `The type "${newName}" already exists.`
      return null
    },
  }
}

// --- tag form --------------------------------------------------------------------

export function tagFields(container, init, ctx) {
  const { name, def = {} } = init
  const auto = tagLook(name ?? '', {})
  const preview = h('div', { class: 'pg-field pg-field-wide pg-tag-preview-field' })
  const form = renderFields(container, [
    {
      key: 'name', label: 'Tag', type: 'text', required: true, readonly: Boolean(name), placeholder: '#security',
      hint: name ? 'To rename a tag, create a new one.' : 'Written #name on nodes.',
    },
    { key: 'color', label: 'Badge colour', type: 'color', inherited: auto.color },
    { key: 'icon', label: 'Icon', type: 'icon', onChange: () => refresh() },
  ], { ...def, name: name ? `#${name}` : '' })
  container.append(preview)
  const current = () => {
    const v = form.values()
    return { name: parseTags(v.name)[0] ?? '', def: { color: v.color, icon: v.icon } }
  }
  function refresh() {
    const { name: tag, def: next } = current()
    preview.replaceChildren(h('label', {}, 'Preview'), tag ? tagPill(tag, { [tag]: next }) : h('span', { class: 'pg-muted' }, '—'))
  }
  container.addEventListener('input', refresh)
  container.addEventListener('change', refresh)
  refresh()
  return {
    ...form,
    values: current,
    validate() {
      const missing = form.missingRequired()
      if (missing) return missing
      const { name: tag } = current()
      if (!tag) return 'The tag needs a name.'
      if (!name && ctx.takenNames.has(tag)) return `The tag #${tag} already exists.`
      return null
    },
  }
}
