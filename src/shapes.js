// Geometry of what is drawn by hand on the canvas (drawing.js): the outline
// of each shape kind in a box, and freehand strokes — simplified as they are
// drawn, then smoothed. Pure functions, in graph units.

/**
 * The outline of a shape of `kind` in a `w` × `h` box (top-left at 0, 0), as
 * an SVG path. Kinds without an outline (image, icon) give a plain rectangle.
 */
export function outlinePath(kind, w, h) {
  const r = (x, y) => `${round(x)},${round(y)}`
  switch (kind) {
    case 'rect':
      return `M0,0H${round(w)}V${round(h)}H0Z`
    case 'ellipse':
      return `M0,${round(h / 2)}A${round(w / 2)},${round(h / 2)} 0 1 0 ${r(w, h / 2)}A${round(w / 2)},${round(h / 2)} 0 1 0 ${r(0, h / 2)}Z`
    case 'diamond':
      return `M${r(w / 2, 0)}L${r(w, h / 2)}L${r(w / 2, h)}L${r(0, h / 2)}Z`
    case 'triangle':
      return `M${r(w / 2, 0)}L${r(w, h)}L${r(0, h)}Z`
    case 'hexagon': {
      const d = Math.min(w / 4, h / 2)
      return `M${r(d, 0)}L${r(w - d, 0)}L${r(w, h / 2)}L${r(w - d, h)}L${r(d, h)}L${r(0, h / 2)}Z`
    }
    case 'star': {
      const points = []
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const k = i % 2 ? 0.42 : 1
        points.push(r(w / 2 + Math.cos(angle) * (w / 2) * k, h * 0.53 + Math.sin(angle) * (h * 0.53) * k))
      }
      return `M${points.join('L')}Z`
    }
    case 'cloud': {
      // Bumps along an ellipse: a cloud at any proportions.
      const bumps = 9
      const cx = w / 2
      const cy = h / 2
      const rx = w / 2 * 0.86
      const ry = h / 2 * 0.78
      const at = (t) => [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]
      let d = ''
      for (let i = 0; i < bumps; i++) {
        const a = (2 * Math.PI * i) / bumps
        const b = (2 * Math.PI * (i + 1)) / bumps
        const [x1, y1] = at(a)
        const [x2, y2] = at(b)
        const mid = (a + b) / 2
        // The bump's top, pushed outwards from the centre.
        const cxp = cx + Math.cos(mid) * rx * 1.32
        const cyp = cy + Math.sin(mid) * ry * 1.32
        d += `${i === 0 ? `M${r(x1, y1)}` : ''}Q${r(cxp, cyp)} ${r(x2, y2)}`
      }
      return `${d}Z`
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.15, 22)
      return `M0,${round(ry)}A${round(w / 2)},${round(ry)} 0 0 1 ${r(w, ry)}V${round(h - ry)}A${round(w / 2)},${round(ry)} 0 0 1 ${r(0, h - ry)}Z`
        + `M0,${round(ry)}A${round(w / 2)},${round(ry)} 0 0 0 ${r(w, ry)}`
    }
    case 'callout': {
      // A speech bubble: the box takes the top 80 %, the tail points down-left.
      const b = h * 0.8
      const k = Math.min(12, w / 6, b / 3)
      return `M${r(k, 0)}H${round(w - k)}Q${r(w, 0)} ${r(w, k)}V${round(b - k)}Q${r(w, b)} ${r(w - k, b)}`
        + `H${round(w * 0.38)}L${r(w * 0.2, h)}L${r(w * 0.24, b)}H${round(k)}Q${r(0, b)} ${r(0, b - k)}V${round(k)}Q${r(0, 0)} ${r(k, 0)}Z`
    }
    case 'rounded':
    default: {
      const k = Math.min(16, w / 4, h / 4)
      return `M${r(k, 0)}H${round(w - k)}Q${r(w, 0)} ${r(w, k)}V${round(h - k)}Q${r(w, h)} ${r(w - k, h)}H${round(k)}Q${r(0, h)} ${r(0, h - k)}V${round(k)}Q${r(0, 0)} ${r(k, 0)}Z`
    }
  }
}

/** Where the text goes inside a shape of `kind` (the part of the box it fits in). */
export function textBox(kind, w, h) {
  const inset = {
    diamond: [0.22, 0.22], triangle: [0.25, 0.42], star: [0.3, 0.38], ellipse: [0.13, 0.13],
    cloud: [0.18, 0.2], hexagon: [0.18, 0.06],
  }[kind] ?? [0.04, 0.06]
  const top = kind === 'triangle' ? h * 0.42 : kind === 'cylinder' ? Math.min(h * 0.3, 44) : h * inset[1]
  const bottom = kind === 'callout' ? h * 0.2 + h * 0.04 : kind === 'triangle' ? h * 0.04 : h * inset[1]
  return { x: w * inset[0], y: top, width: Math.max(1, w * (1 - 2 * inset[0])), height: Math.max(1, h - top - bottom) }
}

/**
 * Fewer points along the same line (Ramer–Douglas–Peucker): a hand-drawn
 * stroke keeps its shape and loses its jitter.
 */
export function simplify(points, tolerance = 1.5) {
  if (points.length < 3) return points.slice()
  const [ax, ay] = points[0]
  const [bx, by] = points.at(-1)
  const length = Math.hypot(bx - ax, by - ay)
  let worst = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    const d = length
      ? Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / length
      : Math.hypot(px - ax, py - ay)
    if (d > worst) {
      worst = d
      index = i
    }
  }
  if (worst <= tolerance) return [points[0], points.at(-1)]
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
}

/** A smooth path through the points: curves through the midpoints, ends kept. */
export function smoothPath(points) {
  if (!points.length) return ''
  const p = (pt) => `${round(pt[0])},${round(pt[1])}`
  if (points.length < 3) return `M${points.map(p).join('L')}`
  let d = `M${p(points[0])}`
  for (let i = 1; i < points.length - 1; i++) {
    const mid = [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2]
    d += `Q${p(points[i])} ${p(i === points.length - 2 ? points.at(-1) : mid)}`
  }
  return d
}

function round(n) {
  return Math.round(n * 10) / 10
}
