// Compose: packs a page's classified visuals into a designed layout. Pure —
// returns new rects keyed by visual id; positions only. Eight packs in two
// families:
//
//   Dashboards            Pages
//   ── exec-hero          ── detail-master  (big table + side cards)
//   ── app-shell          ── report-list    (full-width table under a KPI strip)
//   ── kpi-focus          ── spotlight      (one dominant visual)
//   ── chart-grid         ── comparison     (two-column split)
//
// Rules of the road:
//   * swap partners get EXACTLY their leader's rect (one slot, stacked)
//   * companions keep their offset relative to their host
//   * decor/group/unknown visuals are not moved
//   * every movable visual is always placed, whole pixels, inside the page

import type { PageNode } from '../pbir/types.ts'
import type { Rect } from '../layout/geometry.ts'
import type { Classified } from './classify.ts'

export type PackId =
  | 'exec-hero'
  | 'app-shell'
  | 'kpi-focus'
  | 'chart-grid'
  | 'detail-master'
  | 'report-list'
  | 'spotlight'
  | 'comparison'

export interface PackMeta {
  id: PackId
  name: string
  blurb: string
  category: 'dashboard' | 'page'
}

export const PACKS: PackMeta[] = [
  { id: 'exec-hero', name: 'Executive Hero', blurb: 'KPI band on top, one hero chart, supporting charts beside it.', category: 'dashboard' },
  { id: 'app-shell', name: 'App Shell', blurb: 'Slicer rail on the left, KPI row, hero chart with a support column.', category: 'dashboard' },
  { id: 'kpi-focus', name: 'KPI Focus', blurb: 'Jumbo number cards first, charts in a tidy grid below.', category: 'dashboard' },
  { id: 'chart-grid', name: 'Chart Grid', blurb: 'Every chart in a uniform grid — for analysis-dense pages.', category: 'dashboard' },
  { id: 'detail-master', name: 'Detail Master', blurb: 'A big table with KPI cards and mini charts in a side column.', category: 'page' },
  { id: 'report-list', name: 'Report List', blurb: 'KPI strip on top, the table full-width below.', category: 'page' },
  { id: 'spotlight', name: 'Spotlight', blurb: 'One dominant visual owns the page; the rest tuck around it.', category: 'page' },
  { id: 'comparison', name: 'Comparison', blurb: 'Two equal columns, side by side — built to compare.', category: 'page' },
]

// ---------------------------------------------------------------------------
// Shared machinery
// ---------------------------------------------------------------------------

interface Metrics {
  M: number // page margin
  G: number // gutter
  title: number
  nav: number
  kpi: number
  kpiJumbo: number
  strip: number // compact slicer/KPI strip height
  railW: number
}

/** Small canvases (tooltip pages) get proportionally tighter chrome. */
const metricsFor = (page: PageNode): Metrics =>
  page.height < 420
    ? { M: 8, G: 8, title: 28, nav: 22, kpi: 60, kpiJumbo: 76, strip: 32, railW: 110 }
    : { M: 16, G: 12, title: 46, nav: 36, kpi: 104, kpiJumbo: 150, strip: 48, railW: 176 }

interface Groups {
  title?: Classified
  navs: Classified[]
  kpis: Classified[]
  slicers: Classified[]
  hero?: Classified
  charts: Classified[]
  tables: Classified[]
}

const rectOf = (c: Classified): Rect => ({
  x: c.v.position.x, y: c.v.position.y, w: c.v.position.width, h: c.v.position.height,
})

function collect(items: Classified[]): Groups {
  const byReading = (a: Classified, b: Classified) => rectOf(a).y - rectOf(b).y || rectOf(a).x - rectOf(b).x
  const movable = items.filter((i) => !i.swapWith && !i.companionOf)
  const pick = (role: string) => movable.filter((i) => i.role === role).sort(byReading)
  return {
    title: pick('title')[0],
    navs: pick('nav'),
    kpis: pick('kpi'),
    slicers: pick('slicer'),
    hero: pick('hero')[0],
    charts: pick('chart'),
    tables: pick('table'),
  }
}

interface Ctx {
  page: PageNode
  m: Metrics
  out: Map<string, Rect>
  left: number
  contentW: number
  y: number
}

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })

function row(ctx: Ctx, ids: string[], x: number, y: number, w: number, h: number): void {
  if (!ids.length) return
  const each = (w - (ids.length - 1) * ctx.m.G) / ids.length
  ids.forEach((id, i) => ctx.out.set(id, round({ x: x + i * (each + ctx.m.G), y, w: each, h })))
}

function column(ctx: Ctx, ids: string[], x: number, y: number, w: number, h: number): void {
  if (!ids.length) return
  const each = (h - (ids.length - 1) * ctx.m.G) / ids.length
  ids.forEach((id, i) => ctx.out.set(id, round({ x, y: y + i * (each + ctx.m.G), w, h: each })))
}

/** Equal-cell grid, row-major, last row left-aligned. */
function grid(ctx: Ctx, ids: string[], cols: number, x: number, y: number, w: number, h: number): void {
  if (!ids.length) return
  const rows = Math.ceil(ids.length / cols)
  const cw = (w - (cols - 1) * ctx.m.G) / cols
  const ch = (h - (rows - 1) * ctx.m.G) / rows
  ids.forEach((id, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    ctx.out.set(id, round({ x: x + c * (cw + ctx.m.G), y: y + r * (ch + ctx.m.G), w: cw, h: ch }))
  })
}

/** Left rail + title + nav preamble shared by every pack. */
function frame(page: PageNode, g: Groups, out: Map<string, Rect>, rail: 'always' | 'auto4' | 'never'): Ctx {
  const m = metricsFor(page)
  const useRail = g.slicers.length > 0 && (rail === 'always' || (rail === 'auto4' && g.slicers.length >= 4))
  const left = m.M + (useRail ? m.railW + m.G : 0)
  const ctx: Ctx = { page, m, out, left, contentW: page.width - left - m.M, y: m.M }

  if (useRail) column(ctx, g.slicers.map((s) => s.v.id), m.M, m.M, m.railW, page.height - 2 * m.M)
  if (g.title) {
    out.set(g.title.v.id, round({ x: left, y: ctx.y, w: ctx.contentW, h: m.title }))
    ctx.y += m.title + m.G
  }
  if (g.navs.length) {
    row(ctx, g.navs.map((n) => n.v.id), left, ctx.y, ctx.contentW, m.nav)
    ctx.y += m.nav + m.G
  }
  if (!useRail && g.slicers.length) {
    row(ctx, g.slicers.map((s) => s.v.id), left, ctx.y, ctx.contentW, m.strip)
    ctx.y += m.strip + m.G
  }
  return ctx
}

function kpiBand(ctx: Ctx, g: Groups, h: number, maxPerRow: number): void {
  if (!g.kpis.length) return
  // Grid, not per-row splits: a 3+2 band must keep ALL cards the same size
  // (the second row just ends early), or the band reads as sloppy.
  const rows = Math.ceil(g.kpis.length / maxPerRow)
  const cols = Math.ceil(g.kpis.length / rows)
  const total = rows * h + (rows - 1) * ctx.m.G
  grid(ctx, g.kpis.map((k) => k.v.id), cols, ctx.left, ctx.y, ctx.contentW, total)
  ctx.y += total + ctx.m.G
}

const remaining = (ctx: Ctx) => Math.max(120, ctx.page.height - ctx.m.M - ctx.y)

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

type PackFn = (ctx: Ctx, g: Groups) => void

/** Hero left + support column right; tables get a bottom band. */
const execHero: PackFn = (ctx, g) => {
  kpiBand(ctx, g, ctx.m.kpi, 6)
  const mainH = remaining(ctx)
  const tableBandH = g.tables.length ? Math.max(140, Math.round(mainH * 0.34)) : 0
  const chartsH = mainH - (tableBandH ? tableBandH + ctx.m.G : 0)
  if (g.hero) {
    const heroW = g.charts.length ? Math.round(ctx.contentW * 0.58) : ctx.contentW
    ctx.out.set(g.hero.v.id, round({ x: ctx.left, y: ctx.y, w: heroW, h: chartsH }))
    column(ctx, g.charts.map((c) => c.v.id), ctx.left + heroW + ctx.m.G, ctx.y, ctx.contentW - heroW - ctx.m.G, chartsH)
  } else {
    row(ctx, g.charts.map((c) => c.v.id), ctx.left, ctx.y, ctx.contentW, chartsH)
  }
  if (tableBandH) row(ctx, g.tables.map((t) => t.v.id), ctx.left, ctx.y + chartsH + ctx.m.G, ctx.contentW, tableBandH)
}

/** Same grammar as exec-hero, but the table shares the support column. */
const appShell: PackFn = (ctx, g) => {
  kpiBand(ctx, g, ctx.m.kpi, 6)
  const mainH = remaining(ctx)
  const heroW = g.hero ? Math.round(ctx.contentW * 0.58) : 0
  if (g.hero) ctx.out.set(g.hero.v.id, round({ x: ctx.left, y: ctx.y, w: heroW, h: mainH }))
  const sideX = ctx.left + (g.hero ? heroW + ctx.m.G : 0)
  const sideW = ctx.contentW - (g.hero ? heroW + ctx.m.G : 0)
  if (g.tables.length && g.charts.length) {
    const half = Math.round((mainH - ctx.m.G) / 2)
    column(ctx, g.charts.map((c) => c.v.id), sideX, ctx.y, sideW, half)
    row(ctx, g.tables.map((t) => t.v.id), sideX, ctx.y + half + ctx.m.G, sideW, mainH - half - ctx.m.G)
  } else {
    column(ctx, [...g.charts, ...g.tables].map((c) => c.v.id), sideX, ctx.y, sideW, mainH)
  }
}

/** Jumbo number cards, then everything else in a 2-column grid. */
const kpiFocus: PackFn = (ctx, g) => {
  kpiBand(ctx, g, ctx.m.kpiJumbo, 4)
  const rest = [...(g.hero ? [g.hero] : []), ...g.charts, ...g.tables].map((c) => c.v.id)
  grid(ctx, rest, rest.length > 1 ? 2 : 1, ctx.left, ctx.y, ctx.contentW, remaining(ctx))
}

/** Compact KPI strip, then a uniform chart grid (3 columns when dense). */
const chartGrid: PackFn = (ctx, g) => {
  if (g.kpis.length) {
    row(ctx, g.kpis.map((k) => k.v.id), ctx.left, ctx.y, ctx.contentW, Math.round(ctx.m.kpi * 0.75))
    ctx.y += Math.round(ctx.m.kpi * 0.75) + ctx.m.G
  }
  const cells = [...(g.hero ? [g.hero] : []), ...g.charts, ...g.tables].map((c) => c.v.id)
  const cols = cells.length <= 2 ? cells.length || 1 : cells.length <= 4 ? 2 : 3
  grid(ctx, cells, cols, ctx.left, ctx.y, ctx.contentW, remaining(ctx))
}

/** A dominant table with cards + mini charts stacked in a side column. */
const detailMaster: PackFn = (ctx, g) => {
  const mainH = remaining(ctx)
  const side = [...g.kpis, ...g.charts].map((c) => c.v.id)
  const main = [...g.tables, ...(g.hero ? [g.hero] : [])].map((c) => c.v.id)
  if (main.length === 0) {
    // No table, no hero: promote the charts to the main area.
    grid(ctx, side, side.length > 3 ? 2 : 1, ctx.left, ctx.y, ctx.contentW, mainH)
    return
  }
  const sideW = side.length ? Math.round(ctx.contentW * 0.26) : 0
  const mainW = ctx.contentW - (sideW ? sideW + ctx.m.G : 0)
  column(ctx, main, ctx.left, ctx.y, mainW, mainH)
  if (sideW) column(ctx, side, ctx.left + mainW + ctx.m.G, ctx.y, sideW, mainH)
}

/** KPI strip on top, table(s) full width below; charts share a right column. */
const reportList: PackFn = (ctx, g) => {
  kpiBand(ctx, g, Math.round(ctx.m.kpi * 0.85), 6)
  const mainH = remaining(ctx)
  const charts = [...(g.hero ? [g.hero] : []), ...g.charts].map((c) => c.v.id)
  const main = g.tables.length ? g.tables.map((t) => t.v.id) : charts
  const sideIds = g.tables.length ? charts : []
  const sideW = sideIds.length ? Math.round(ctx.contentW * 0.3) : 0
  column(ctx, main, ctx.left, ctx.y, ctx.contentW - (sideW ? sideW + ctx.m.G : 0), mainH)
  if (sideW) column(ctx, sideIds, ctx.left + ctx.contentW - sideW, ctx.y, sideW, mainH)
}

/** One dominant visual owns the page; the rest tuck into a narrow column. */
const spotlight: PackFn = (ctx, g) => {
  kpiBand(ctx, g, Math.round(ctx.m.kpi * 0.85), 6)
  const mainH = remaining(ctx)
  const star = g.hero ?? g.tables[0] ?? g.charts[0]
  const rest = [...g.charts, ...g.tables].filter((c) => c !== star).map((c) => c.v.id)
  if (!star) {
    grid(ctx, rest, rest.length > 2 ? 2 : 1, ctx.left, ctx.y, ctx.contentW, mainH)
    return
  }
  const sideW = rest.length ? Math.round(ctx.contentW * 0.25) : 0
  ctx.out.set(star.v.id, round({ x: ctx.left, y: ctx.y, w: ctx.contentW - (sideW ? sideW + ctx.m.G : 0), h: mainH }))
  if (sideW) column(ctx, rest, ctx.left + ctx.contentW - sideW, ctx.y, sideW, mainH)
}

/** Two equal columns, filled alternately — built to compare. */
const comparison: PackFn = (ctx, g) => {
  kpiBand(ctx, g, Math.round(ctx.m.kpi * 0.85), 6)
  const mainH = remaining(ctx)
  const seq = [...(g.hero ? [g.hero] : []), ...g.charts, ...g.tables].map((c) => c.v.id)
  const a: string[] = []
  const b: string[] = []
  seq.forEach((id, i) => (i % 2 === 0 ? a : b).push(id))
  const colW = Math.round((ctx.contentW - ctx.m.G) / 2)
  column(ctx, a, ctx.left, ctx.y, colW, mainH)
  column(ctx, b, ctx.left + colW + ctx.m.G, ctx.y, ctx.contentW - colW - ctx.m.G, mainH)
}

const PACK_FNS: Record<PackId, { fn: PackFn; rail: 'always' | 'auto4' | 'never' }> = {
  'exec-hero': { fn: execHero, rail: 'auto4' },
  'app-shell': { fn: appShell, rail: 'always' },
  'kpi-focus': { fn: kpiFocus, rail: 'auto4' },
  'chart-grid': { fn: chartGrid, rail: 'auto4' },
  'detail-master': { fn: detailMaster, rail: 'always' },
  'report-list': { fn: reportList, rail: 'auto4' },
  spotlight: { fn: spotlight, rail: 'auto4' },
  comparison: { fn: comparison, rail: 'auto4' },
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function composePage(page: PageNode, items: Classified[], pack: PackId): Record<string, Rect> {
  const out = new Map<string, Rect>()
  const g = collect(items)
  const { fn, rail } = PACK_FNS[pack]
  const ctx = frame(page, g, out, rail)
  fn(ctx, g)

  // Followers: swap partners mirror their leader; companions keep offset.
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
    // Proportional anchor: a control at the host's top-right stays at the
    // top-right even when the host lands in a narrower slot.
    const fx = ho.w > 0 ? (o.x - ho.x) / ho.w : 0
    const fy = ho.h > 0 ? (o.y - ho.y) / ho.h : 0
    out.set(item.v.id, round({ x: hostNew.x + fx * hostNew.w, y: hostNew.y + fy * hostNew.h, w: o.w, h: o.h }))
  }

  // Clamp everything inside the page.
  const result: Record<string, Rect> = {}
  for (const [id, r] of out) {
    result[id] = {
      x: Math.max(0, Math.min(r.x, page.width - r.w)),
      y: Math.max(0, Math.min(r.y, page.height - r.h)),
      w: Math.min(r.w, page.width),
      h: Math.min(r.h, page.height),
    }
  }
  return result
}
