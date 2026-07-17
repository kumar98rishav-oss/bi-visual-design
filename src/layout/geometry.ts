// Pure geometry for Layout Lab: align, distribute, match-size, grid snapping,
// and smart alignment guides. All coordinates are in report space (the same
// sub-pixel units PBIR stores in `position`). No DOM, no React — easy to test.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const rectRight = (r: Rect) => r.x + r.w
export const rectBottom = (r: Rect) => r.y + r.h
export const rectCX = (r: Rect) => r.x + r.w / 2
export const rectCY = (r: Rect) => r.y + r.h / 2

/** Bounding box that contains every rect. */
export function bounds(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const r = Math.max(...rects.map(rectRight))
  const b = Math.max(...rects.map(rectBottom))
  return { x, y, w: r - x, h: b - y }
}

// ---------------------------------------------------------------------------
// Align — snap every rect to the selection's bounding box on one edge/axis.
// ---------------------------------------------------------------------------
export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export function alignRects(rects: Rect[], edge: AlignEdge): Rect[] {
  if (rects.length < 2) return rects
  const b = bounds(rects)
  return rects.map((r) => {
    switch (edge) {
      case 'left':
        return { ...r, x: b.x }
      case 'right':
        return { ...r, x: b.x + b.w - r.w }
      case 'hcenter':
        return { ...r, x: b.x + b.w / 2 - r.w / 2 }
      case 'top':
        return { ...r, y: b.y }
      case 'bottom':
        return { ...r, y: b.y + b.h - r.h }
      case 'vcenter':
        return { ...r, y: b.y + b.h / 2 - r.h / 2 }
    }
  })
}

// ---------------------------------------------------------------------------
// Distribute — equal gaps between adjacent edges; the two extremes stay put.
// ---------------------------------------------------------------------------
export type DistAxis = 'h' | 'v'

export function distributeRects(rects: Rect[], axis: DistAxis): Rect[] {
  if (rects.length < 3) return rects
  // Work on indices so we can return in the original order.
  const idx = rects.map((_, i) => i)
  const pos = (i: number) => (axis === 'h' ? rects[i].x : rects[i].y)
  const size = (i: number) => (axis === 'h' ? rects[i].w : rects[i].h)
  idx.sort((a, b) => pos(a) - pos(b))

  const first = idx[0]
  const last = idx[idx.length - 1]
  const span = pos(last) + size(last) - pos(first)
  const totalSize = idx.reduce((s, i) => s + size(i), 0)
  const gap = (span - totalSize) / (idx.length - 1)

  const out = rects.slice()
  let cursor = pos(first)
  for (const i of idx) {
    const p = cursor
    out[i] = axis === 'h' ? { ...rects[i], x: p } : { ...rects[i], y: p }
    cursor = p + size(i) + gap
  }
  return out
}

// ---------------------------------------------------------------------------
// Match size — set every rect's width/height to a reference rect's.
// ---------------------------------------------------------------------------
export type MatchDim = 'width' | 'height' | 'both'

export function matchSize(rects: Rect[], refIndex: number, dim: MatchDim): Rect[] {
  const ref = rects[refIndex]
  if (!ref) return rects
  return rects.map((r, i) => {
    if (i === refIndex) return r
    return {
      ...r,
      w: dim === 'height' ? r.w : ref.w,
      h: dim === 'width' ? r.h : ref.h,
    }
  })
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export function snapToGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid
}

/** A guide line to draw while moving/resizing (report coordinates). */
export interface Guide {
  axis: 'x' | 'y' // a vertical guide sits at a fixed x; horizontal at a fixed y
  at: number
  from: number // span start (the other coordinate)
  to: number // span end
}

/**
 * Given a moving box and the static rects around it, compute the nudge (dx, dy)
 * that snaps its edges/centres to nearby rects (within `threshold`), plus the
 * guide lines to render. Falls back to grid snapping on any axis with no
 * alignment match. Everything is in report units.
 */
export function computeMoveSnap(
  box: Rect,
  others: Rect[],
  grid: number | null,
  threshold: number,
): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = []

  const xAnchors = [box.x, rectCX(box), rectRight(box)]
  const yAnchors = [box.y, rectCY(box), rectBottom(box)]

  let bestDx: number | null = null
  let bestDxDist = threshold
  let bestDy: number | null = null
  let bestDyDist = threshold

  for (const o of others) {
    const oxs = [o.x, rectCX(o), rectRight(o)]
    const oys = [o.y, rectCY(o), rectBottom(o)]
    for (const a of xAnchors) {
      for (const ox of oxs) {
        const d = ox - a
        if (Math.abs(d) < bestDxDist) {
          bestDxDist = Math.abs(d)
          bestDx = d
        }
      }
    }
    for (const a of yAnchors) {
      for (const oy of oys) {
        const d = oy - a
        if (Math.abs(d) < bestDyDist) {
          bestDyDist = Math.abs(d)
          bestDy = d
        }
      }
    }
  }

  let dx = bestDx ?? 0
  let dy = bestDy ?? 0

  // Grid fallback on any axis with no alignment snap.
  if (bestDx === null && grid) dx = snapToGrid(box.x, grid) - box.x
  if (bestDy === null && grid) dy = snapToGrid(box.y, grid) - box.y

  // Build guides for the axes that snapped to a neighbour.
  const snapped = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h }
  if (bestDx !== null) {
    // Draw a vertical guide at whichever snapped x anchor matches a neighbour.
    for (const o of others) {
      for (const ox of [o.x, rectCX(o), rectRight(o)]) {
        if ([snapped.x, rectCX(snapped), rectRight(snapped)].some((a) => Math.abs(a - ox) < 0.5)) {
          guides.push({ axis: 'x', at: ox, from: Math.min(snapped.y, o.y), to: Math.max(rectBottom(snapped), rectBottom(o)) })
        }
      }
    }
  }
  if (bestDy !== null) {
    for (const o of others) {
      for (const oy of [o.y, rectCY(o), rectBottom(o)]) {
        if ([snapped.y, rectCY(snapped), rectBottom(snapped)].some((a) => Math.abs(a - oy) < 0.5)) {
          guides.push({ axis: 'y', at: oy, from: Math.min(snapped.x, o.x), to: Math.max(rectRight(snapped), rectRight(o)) })
        }
      }
    }
  }

  return { dx, dy, guides }
}

// ---------------------------------------------------------------------------
// Resize — apply a handle drag to a rect, keeping a minimum size.
// ---------------------------------------------------------------------------
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const MIN = 8

export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  grid: number | null,
): Rect {
  let { x, y, w, h } = start
  const right = start.x + start.w
  const bottom = start.y + start.h

  if (handle.includes('w')) {
    x = grid ? snapToGrid(start.x + dx, grid) : start.x + dx
    w = right - x
  }
  if (handle.includes('e')) {
    const r = grid ? snapToGrid(right + dx, grid) : right + dx
    w = r - x
  }
  if (handle.includes('n')) {
    y = grid ? snapToGrid(start.y + dy, grid) : start.y + dy
    h = bottom - y
  }
  if (handle.includes('s')) {
    const b = grid ? snapToGrid(bottom + dy, grid) : bottom + dy
    h = b - y
  }

  // Enforce a minimum size without flipping the box.
  if (w < MIN) {
    if (handle.includes('w')) x = right - MIN
    w = MIN
  }
  if (h < MIN) {
    if (handle.includes('n')) y = bottom - MIN
    h = MIN
  }
  return { x, y, w, h }
}
