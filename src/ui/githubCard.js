// A GitHub repository summary, for the details panel, tooltip and node form.
import { badgeIconSvg } from '../badgeIcons.js'
import { compactNumber, timeAgo } from '../github.js'
import { h } from './dom.js'

function icon(name) {
  const span = h('span', { class: 'pg-gh-icon' })
  span.innerHTML = badgeIconSvg(name, 'currentColor') // bundled, trusted markup
  return span
}

export function link(url, text = url) {
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text)
}

/** @param {object} repo from fetchRepo() @param {{ description?: boolean }} options */
export function repoCard(repo, { description = true } = {}) {
  const stats = [
    h('span', { title: 'Stars' }, icon('star'), compactNumber(repo.stars)),
    h('span', { title: 'Forks' }, icon('code'), compactNumber(repo.forks)),
    h('span', { title: 'Open issues' }, icon('circle-info'), compactNumber(repo.issues)),
    repo.language ? h('span', { title: 'Main language' }, icon('terminal'), repo.language) : null,
    repo.license ? h('span', { title: 'License' }, icon('scale-balanced'), repo.license) : null,
  ]
  return h('div', { class: 'pg-gh' },
    h('div', { class: 'pg-gh-title' }, icon('github'), link(repo.url, repo.fullName),
      repo.archived ? h('span', { class: 'pg-gh-archived' }, 'archived') : null),
    description && repo.description ? h('div', { class: 'pg-gh-desc' }, repo.description) : null,
    h('div', { class: 'pg-gh-stats' }, stats),
    repo.topics?.length ? h('div', { class: 'pg-gh-topics' }, repo.topics.slice(0, 8).map((t) => h('span', {}, t))) : null,
    h('div', { class: 'pg-gh-meta' },
      repo.pushedAt ? `Updated ${timeAgo(repo.pushedAt)}` : null,
      repo.fetchedAt ? ` · fetched ${new Date(repo.fetchedAt).toLocaleDateString()}` : null,
      repo.homepage ? [' · ', link(repo.homepage, new URL(repo.homepage, 'https://x').hostname)] : null))
}

export function repoError(slug, message) {
  return h('div', { class: 'pg-gh pg-gh-error' }, h('div', { class: 'pg-gh-title' }, icon('github'), slug), message)
}

/** Links as a compact list: the label, or the URL's host. */
export function linkList(links) {
  return h('div', { class: 'pg-links' }, links.map(({ label, url }) => {
    let text = label
    if (!text) {
      try {
        text = new URL(url).hostname
      } catch {
        text = url
      }
    }
    return link(url, text)
  }))
}

/** A repository known only by name (no saved details): a plain link, no API call. */
export function repoLink(slug) {
  return h('div', { class: 'pg-gh-title' }, icon('github'), link(`https://github.com/${slug}`, slug))
}
