// Placements computed once, for a fixed layout (meta.fixedLayout): the
// Arrange menu and the Mermaid import use them. Pure functions: they take
// node ids, edges and sizes, and return each node's centre.
//
// - layered: a tree / flowchart, ranks along the edges' direction
//   (top → bottom, left → right…), crossings reduced by barycentres;
// - grid: rows and columns, in the given order;
// - circle: a ring, the most connected node in the middle when it is a hub.

const DEFAULT_SIZE = { width: 120, height: 60 }

/**
 * @param {string[]} ids
 * @param {{ from: string, to: string }[]} edges
 * @param {object} [options]
 * @param {'TB'|'BT'|'LR'|'RL'} [options.direction] where the edges point
 * @param {Map<string, {width, height}>} [options.sizes] each node's box
 * @param {number} [options.rankGap] space between ranks
 * @param {number} [options.nodeGap] space between nodes of a rank
 * @param {(id: string) => string|undefined} [options.group] nodes of a group stay side by side
 * @returns {Map<string, {x: number, y: number}>}
 */
export function layeredLayout(ids, edges, { direction = 'TB', sizes = new Map(), rankGap = 90, nodeGap = 40, group } = {}) {
  const known = new Set(ids)
  const links = edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to)
  const horizontal = direction === 'LR' || direction === 'RL'
  const size = (id) => sizes.get(id) ?? DEFAULT_SIZE
  // Along the ranks / across them, whatever the direction.
  const along = (id) => (horizontal ? size(id).width : size(id).height)
  const across = (id) => (horizontal ? size(id).height : size(id).width)

  const dag = acyclic(ids, links)
  const rank = ranks(ids, dag)
  const layers = []
  for (const id of ids) (layers[rank.get(id)] ??= []).push(id)
  for (let r = 0; r < layers.length; r++) layers[r] ??= []

  const preds = new Map(ids.map((id) => [id, []]))
  const succs = new Map(ids.map((id) => [id, []]))
  for (const { from, to } of dag) {
    succs.get(from).push(to)
    preds.get(to).push(from)
  }

  // Order within ranks: barycentres of the neighbours, sweeping down and up.
  const index = new Map()
  const reindex = () => layers.forEach((layer) => layer.forEach((id, i) => index.set(id, i / Math.max(1, layer.length - 1))))
  reindex()
  const reorder = (layer, neighbours) => {
    const bary = new Map(layer.map((id) => {
      const near = neighbours.get(id)
      return [id, near.length ? near.reduce((sum, n) => sum + index.get(n), 0) / near.length : index.get(id)]
    }))
    // A group sits where its members are on average.
    const groupBary = new Map()
    if (group) {
      for (const id of layer) {
        const key = group(id)
        if (key === undefined) continue
        const entry = groupBary.get(key) ?? { sum: 0, n: 0 }
        entry.sum += bary.get(id)
        entry.n++
        groupBary.set(key, entry)
      }
    }
    const key = (id) => {
      const g = group?.(id)
      return g === undefined ? bary.get(id) : groupBary.get(g).sum / groupBary.get(g).n
    }
    // Ties between groups: the group seen first stays first, so members are never interleaved.
    const firstSeen = new Map()
    layer.forEach((id, i) => {
      const g = group?.(id) ?? `\u0000${id}`
      if (!firstSeen.has(g)) firstSeen.set(g, i)
    })
    const rank = (id) => firstSeen.get(group?.(id) ?? `\u0000${id}`)
    layer.sort((a, b) => key(a) - key(b) || rank(a) - rank(b) || bary.get(a) - bary.get(b))
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let r = 1; r < layers.length; r++) {
      reorder(layers[r], preds)
      reindex()
    }
    for (let r = layers.length - 2; r >= 0; r--) {
      reorder(layers[r], succs)
      reindex()
    }
  }

  // Across: side by side, then pulled towards the neighbours, never overlapping.
  const cross = new Map()
  for (const layer of layers) {
    const total = layer.reduce((sum, id) => sum + across(id), 0) + nodeGap * (layer.length - 1)
    let c = -total / 2
    for (const id of layer) {
      cross.set(id, c + across(id) / 2)
      c += across(id) + nodeGap
    }
  }
  const align = (layer, neighbours) => {
    if (!layer.length) return
    const wanted = layer.map((id) => {
      const near = neighbours.get(id)
      return near.length ? near.reduce((sum, n) => sum + cross.get(n), 0) / near.length : cross.get(id)
    })
    const placed = [...wanted]
    for (let i = 1; i < layer.length; i++) {
      const min = placed[i - 1] + (across(layer[i - 1]) + across(layer[i])) / 2 + nodeGap
      placed[i] = Math.max(placed[i], min)
    }
    const shift = wanted.reduce((sum, w, i) => sum + w - placed[i], 0) / layer.length
    layer.forEach((id, i) => cross.set(id, placed[i] + shift))
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 1; r < layers.length; r++) align(layers[r], preds)
    for (let r = layers.length - 2; r >= 0; r--) align(layers[r], succs)
  }

  // Along: one band per rank, as thick as its biggest node.
  const positions = new Map()
  let offset = 0
  for (const layer of layers) {
    const thickness = Math.max(0, ...layer.map(along))
    for (const id of layer) {
      const main = offset + thickness / 2
      const flip = direction === 'BT' || direction === 'RL' ? -1 : 1
      const p = horizontal ? { x: main * flip, y: cross.get(id) } : { x: cross.get(id), y: main * flip }
      positions.set(id, { x: Math.round(p.x), y: Math.round(p.y) })
    }
    offset += thickness + rankGap
  }
  return positions
}

/** The edges without the ones closing a cycle (found by a depth-first walk in the given order). */
function acyclic(ids, links) {
  const out = new Map(ids.map((id) => [id, []]))
  for (const link of links) out.get(link.from).push(link)
  const state = new Map() // 1: on the path, 2: done
  const kept = []
  const visit = (id) => {
    state.set(id, 1)
    for (const link of out.get(id)) {
      const s = state.get(link.to)
      if (s === 1) continue // back to the path: a cycle
      kept.push(link)
      if (!s) visit(link.to)
    }
    state.set(id, 2)
  }
  // Roots first (no incoming edge), so cycles are broken where they close.
  const incoming = new Set(links.map((l) => l.to))
  for (const id of [...ids.filter((i) => !incoming.has(i)), ...ids]) if (!state.get(id)) visit(id)
  return kept
}

/** Longest path from the roots: each node one rank after its furthest predecessor. */
function ranks(ids, dag) {
  const rank = new Map(ids.map((id) => [id, 0]))
  const indegree = new Map(ids.map((id) => [id, 0]))
  const out = new Map(ids.map((id) => [id, []]))
  for (const { from, to } of dag) {
    out.get(from).push(to)
    indegree.set(to, indegree.get(to) + 1)
  }
  const queue = ids.filter((id) => indegree.get(id) === 0)
  while (queue.length) {
    const id = queue.shift()
    for (const to of out.get(id)) {
      rank.set(to, Math.max(rank.get(to), rank.get(id) + 1))
      indegree.set(to, indegree.get(to) - 1)
      if (indegree.get(to) === 0) queue.push(to)
    }
  }
  return rank
}

/** Rows and columns (about square), each cell as big as the biggest node. */
export function gridLayout(ids, { sizes = new Map(), gap = 50, columns } = {}) {
  const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const size = (id) => sizes.get(id) ?? DEFAULT_SIZE
  const cell = {
    width: Math.max(0, ...ids.map((id) => size(id).width)) + gap,
    height: Math.max(0, ...ids.map((id) => size(id).height)) + gap,
  }
  return new Map(ids.map((id, i) => [id, { x: (i % cols) * cell.width, y: Math.floor(i / cols) * cell.height }]))
}

/**
 * A ring, big enough for the nodes side by side. A hub (linked to at least
 * half of the others) goes in the middle.
 */
export function circleLayout(ids, edges = [], { sizes = new Map(), gap = 40 } = {}) {
  const size = (id) => sizes.get(id) ?? DEFAULT_SIZE
  const degree = new Map(ids.map((id) => [id, 0]))
  for (const { from, to } of edges) {
    if (degree.has(from)) degree.set(from, degree.get(from) + 1)
    if (degree.has(to)) degree.set(to, degree.get(to) + 1)
  }
  const hub = ids.length > 3 ? [...ids].sort((a, b) => degree.get(b) - degree.get(a))[0] : undefined
  const center = hub !== undefined && degree.get(hub) >= (ids.length - 1) / 2 ? hub : undefined
  const ring = ids.filter((id) => id !== center)
  const span = ring.reduce((sum, id) => sum + Math.max(size(id).width, size(id).height) + gap, 0)
  const centerSize = center === undefined ? 0 : Math.max(size(center).width, size(center).height)
  const radius = Math.max(span / (2 * Math.PI), centerSize + 80, 120)
  const positions = new Map(ring.map((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / ring.length
    return [id, { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) }]
  }))
  if (center !== undefined) positions.set(center, { x: 0, y: 0 })
  return positions
}

/** Every position rounded to the nearest point of a grid. */
export function snapToGrid(positions, step = 20) {
  return new Map([...positions].map(([id, p]) => [id, { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }]))
}

/** The box around boxes: { x, y, width, height }, or null for none. */
export function boundingBox(boxes) {
  if (!boxes.length) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return {
    x, y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  }
}
