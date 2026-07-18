// Visual classifier for Compose: assigns every visual on a page a layout ROLE,
// detects swap groups (visuals stacked on one spot, toggled by bookmarks) and
// anchored companions (small buttons that must travel with a host visual).
// Deterministic, derived only from the PBIR files.

import type { PageNode, VisualNode } from '../pbir/types.ts'
import type { Rect } from '../layout/geometry.ts'

export type Role =
  | 'title' // the page headline textbox
  | 'nav' // page navigation / big action buttons
  | 'kpi' // number cards
  | 'slicer'
  | 'hero' // THE chart (largest)
  | 'chart'
  | 'table'
  | 'decor' // shapes, images, other textboxes — compose leaves them alone
  | 'group'

export interface Classified {
  v: VisualNode
  role: Role
  /** Travels with this host visual, keeping its relative offset. */
  companionOf?: string
  /** Shares its slot with this visual (bookmark swap partner). */
  swapWith?: string
}

const CHART_RE = /chart|donut|pie|funnel|waterfall|treemap|scatter|ribbon|gauge|decomposition|map|kpi$/i
const rectOf = (v: VisualNode): Rect => ({ x: v.position.x, y: v.position.y, w: v.position.width, h: v.position.height })
const area = (r: Rect) => r.w * r.h

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (area(a) + area(b) - inter) // IoU
}

function baseRole(v: VisualNode, page: PageNode): Role {
  const t = v.visualType
  if (t === 'visualGroup') return 'group'
  if (t === 'shape' || t === 'basicShape' || t === 'image') return 'decor'
  if (t.toLowerCase().includes('slicer')) return 'slicer'
  if (t === 'tableEx' || t === 'pivotTable' || t === 'matrix') return 'table'
  if (t === 'card' || t === 'cardVisual' || t === 'multiRowCard') return 'kpi'
  if (t === 'actionButton' || t === 'pageNavigator' || t === 'bookmarkNavigator') return 'nav'
  if (t === 'textbox') {
    const r = rectOf(v)
    // The headline: wide, short, near the top.
    return r.y < page.height * 0.2 && r.w > page.width * 0.4 && r.h < page.height * 0.15 ? 'title' : 'decor'
  }
  if (CHART_RE.test(t)) return 'chart'
  return 'decor' // unknown/custom visuals: leave where they are
}

/** Small controls (your bookmark dots) that must ride with a host visual. */
function isCompanionSized(r: Rect): boolean {
  return r.w <= 90 && r.h <= 90 && area(r) <= 90 * 90
}

export function classifyPage(page: PageNode): Classified[] {
  const items: Classified[] = page.visuals.map((v) => ({ v, role: baseRole(v, page) }))

  // Hero: the largest chart by area.
  const charts = items.filter((i) => i.role === 'chart')
  if (charts.length) {
    const hero = charts.reduce((a, b) => (area(rectOf(a.v)) >= area(rectOf(b.v)) ? a : b))
    hero.role = 'hero'
  }

  // Swap groups: two sizeable visuals stacked on (nearly) the same spot are a
  // bookmark toggle pair — ONE slot, never two. The later one (or hidden one)
  // becomes the follower.
  const big = items.filter((i) => ['hero', 'chart', 'table', 'kpi'].includes(i.role))
  for (let a = 0; a < big.length; a++) {
    for (let b = a + 1; b < big.length; b++) {
      if (big[a].swapWith || big[b].swapWith) continue
      if (overlap(rectOf(big[a].v), rectOf(big[b].v)) > 0.5) {
        const [leader, follower] =
          big[a].v.isHidden && !big[b].v.isHidden ? [big[b], big[a]] : [big[a], big[b]]
        follower.swapWith = leader.v.id
      }
    }
  }

  // Companions: small nav/decor controls whose centre sits inside (or within
  // 40px of) a big visual attach to it and keep their offset.
  const hosts = items.filter((i) => ['hero', 'chart', 'table'].includes(i.role) && !i.swapWith)
  for (const item of items) {
    if (!['nav', 'decor'].includes(item.role)) continue
    const r = rectOf(item.v)
    if (!isCompanionSized(r)) continue
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    let best: { host: Classified; d: number } | null = null
    for (const host of hosts) {
      const h = rectOf(host.v)
      const pad = 40
      if (cx >= h.x - pad && cx <= h.x + h.w + pad && cy >= h.y - pad && cy <= h.y + h.h + pad) {
        const d = Math.hypot(cx - (h.x + h.w / 2), cy - (h.y + h.h / 2))
        if (!best || d < best.d) best = { host, d }
      }
    }
    if (best) item.companionOf = best.host.v.id
  }

  return items
}
