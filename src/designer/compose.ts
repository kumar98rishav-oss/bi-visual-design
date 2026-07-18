// Compose: packs a page's classified visuals into a designed layout. Pure —
// returns new rects keyed by visual id; positions only (M5.2). The two packs
// mirror the user's reference dashboards:
//
//   exec-hero  — headline, nav row, KPI band, hero chart left + support column
//   app-shell  — left slicer rail, headline/nav/KPI rows, hero + support grid
//
// Rules of the road:
//   * swap partners get EXACTLY their leader's rect (one slot, stacked)
//   * companions keep their offset relative to their host
//   * decor/group/unknown visuals are not moved
//   * everything lands on whole pixels inside the page margins

import type { PageNode } from '../pbir/types.ts'
import type { Rect } from '../layout/geometry.ts'
import type { Classified } from './classify.ts'

export type PackId = 'exec-hero' | 'app-shell'

export const PACKS: { id: PackId; name: string; blurb: string }[] = [
  { id: 'exec-hero', name: 'Executive Hero', blurb: 'KPI band on top, one hero chart, supporting charts beside it.' },
  { id: 'app-shell', name: 'App Shell', blurb: 'Slicer rail on the left, KPI row, hero chart with a support column.' },
]

const M = 16 // page margin
const G = 12 // gutter

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })
const rectOf = (c: Classified): Rect => ({
  x: c.v.position.x, y: c.v.position.y, w: c.v.position.width, h: c.v.position.height,
})

/** Lay `n` items in one row across [x, x+w) with equal widths. */
function row(out: Map<string, Rect>, ids: string[], x: number, y: number, w: number, h: number): void {
  if (!ids.length) return
  const each = (w - (ids.length - 1) * G) / ids.length
  ids.forEach((id, i) => out.set(id, round({ x: x + i * (each + G), y, w: each, h })))
}

/** Stack items vertically in [y, y+h) with equal heights. */
function column(out: Map<string, Rect>, ids: string[], x: number, y: number, w: number, h: number): void {
  if (!ids.length) return
  const each = (h - (ids.length - 1) * G) / ids.length
  ids.forEach((id, i) => out.set(id, round({ x, y: y + i * (each + G), w, h: each })))
}

export function composePage(page: PageNode, items: Classified[], pack: PackId): Record<string, Rect> {
  const out = new Map<string, Rect>()

  // Reading order keeps slot assignment deterministic and predictable.
  const byReading = (a: Classified, b: Classified) =>
    rectOf(a).y - rectOf(b).y || rectOf(a).x - rectOf(b).x

  const movable = items.filter((i) => !i.swapWith && !i.companionOf)
  const pick = (role: string) => movable.filter((i) => i.role === role).sort(byReading)

  const title = pick('title')[0]
  const navs = pick('nav')
  const kpis = pick('kpi')
  const slicers = pick('slicer')
  const hero = pick('hero')[0]
  const charts = pick('chart')
  const tables = pick('table')

  const W = page.width
  const H = page.height

  // ---- Left rail (App Shell always when slicers exist; Exec Hero at 4+) ----
  const useRail = slicers.length > 0 && (pack === 'app-shell' || slicers.length >= 4)
  const railW = useRail ? 176 : 0
  const left = M + (useRail ? railW + G : 0)
  const contentW = W - left - M

  if (useRail) {
    column(out, slicers.map((s) => s.v.id), M, M, railW, H - 2 * M)
  }

  // ---- Top bands ----
  let y = M
  if (title) {
    out.set(title.v.id, round({ x: left, y, w: contentW, h: 46 }))
    y += 46 + G
  }
  if (navs.length) {
    row(out, navs.map((n) => n.v.id), left, y, contentW, 36)
    y += 36 + G
  }
  if (!useRail && slicers.length) {
    // Few slicers, Exec Hero: a compact strip under the nav.
    row(out, slicers.map((s) => s.v.id), left, y, contentW, 48)
    y += 48 + G
  }
  if (kpis.length) {
    const kpiRows = kpis.length > 6 ? 2 : 1
    const perRow = Math.ceil(kpis.length / kpiRows)
    for (let r = 0; r < kpiRows; r++) {
      row(out, kpis.slice(r * perRow, (r + 1) * perRow).map((k) => k.v.id), left, y, contentW, 104)
      y += 104 + G
    }
  }

  // ---- Main area: hero + support column (+ table band) ----
  const mainH = H - M - y
  if (mainH > 80) {
    const sideCharts = charts // hero excluded already
    const tableBandH = tables.length && pack === 'exec-hero' ? Math.max(140, Math.round(mainH * 0.34)) : 0
    const chartsH = mainH - (tableBandH ? tableBandH + G : 0)

    if (hero) {
      const heroW = sideCharts.length ? Math.round(contentW * 0.58) : contentW
      out.set(hero.v.id, round({ x: left, y, w: heroW, h: chartsH }))
      column(out, sideCharts.map((c) => c.v.id), left + heroW + G, y, contentW - heroW - G, chartsH)
    } else if (sideCharts.length) {
      row(out, sideCharts.map((c) => c.v.id), left, y, contentW, chartsH)
    }

    if (tableBandH) {
      row(out, tables.map((t) => t.v.id), left, y + chartsH + G, contentW, tableBandH)
    } else if (tables.length) {
      // App Shell: the table shares the support column's lower half.
      const heroW = hero ? Math.round(contentW * 0.58) : 0
      const sideX = left + (hero ? heroW + G : 0)
      const sideW = contentW - (hero ? heroW + G : 0)
      if (sideCharts.length) {
        // Re-stack side charts into the top half, table below.
        const half = Math.round((chartsH - G) / 2)
        column(out, sideCharts.map((c) => c.v.id), sideX, y, sideW, half)
        row(out, tables.map((t) => t.v.id), sideX, y + half + G, sideW, chartsH - half - G)
      } else {
        row(out, tables.map((t) => t.v.id), sideX, y, sideW, chartsH)
      }
    }
  }

  // ---- Followers: swap partners mirror their leader; companions keep offset.
  for (const item of items) {
    if (item.swapWith) {
      const lead = out.get(item.swapWith)
      if (lead) out.set(item.v.id, { ...lead })
    }
  }
  for (const item of items) {
    if (!item.companionOf) continue
    const hostOld = items.find((i) => i.v.id === item.companionOf)
    const hostNew = out.get(item.companionOf)
    if (!hostOld || !hostNew) continue
    const o = rectOf(item)
    const ho = rectOf(hostOld)
    out.set(item.v.id, round({ x: hostNew.x + (o.x - ho.x), y: hostNew.y + (o.y - ho.y), w: o.w, h: o.h }))
  }

  // Clamp everything inside the page.
  const result: Record<string, Rect> = {}
  for (const [id, r] of out) {
    result[id] = {
      x: Math.max(0, Math.min(r.x, W - r.w)),
      y: Math.max(0, Math.min(r.y, H - r.h)),
      w: Math.min(r.w, W),
      h: Math.min(r.h, H),
    }
  }
  return result
}
