// Design Doctor — a design linter for PBIR reports. Pure rules over the model
// that surface findings, each carrying per-visual raw-JSON patches so a fix can
// be previewed on the mirror and written back on deploy.

import { readColor, readLiteral } from '../pbir/exprTree.ts'
import type { JsonObject, Json, PageNode, ReportModel, Theme, VisualNode } from '../pbir/types.ts'
import {
  isObj,
  roundPositionPatch,
  setColorLiteralPatch,
  setPositionPatch,
  setRadiusPatch,
  type PathSeg,
  type RawPatch,
} from './rawEdit.ts'

export type DoctorRule = 'subpixel' | 'misalign' | 'radius' | 'offpalette'

export interface Finding {
  id: string
  rule: DoctorRule
  title: string
  detail: string
  pageId: string
  pageName: string
  visualIds: string[]
  /** Per-visual patch to apply the fix. */
  patches: { visualId: string; patch: RawPatch }[]
}

export const RULE_LABELS: Record<DoctorRule, string> = {
  subpixel: 'Sub-pixel positions',
  misalign: 'Near-misalignments',
  radius: 'Inconsistent corner radii',
  offpalette: 'Off-palette colours',
}

const MISALIGN_PX = 4
const MISALIGN_MIN = 0.75 // ignore sub-pixel jitter (the subpixel rule owns that)
const EPS = 0.01
const COLOR_NEAR = 6 // RGB distance: only a *drifted* theme colour, not a distinct one

interface Rect { x: number; y: number; w: number; h: number }
const rectOf = (v: VisualNode): Rect => ({ x: v.position.x, y: v.position.y, w: v.position.width, h: v.position.height })
const editable = (v: VisualNode) => v.visualType !== 'visualGroup' && v.visualType !== 'unknown'
const fract = (n: number) => Math.abs(n - Math.round(n)) > EPS
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function colorDist(a: string, b: string): number {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return Infinity
  return Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2])
}
function palette(theme: Theme | null): string[] {
  if (!theme) return []
  const structural = [theme.background, theme.foreground, theme.tableAccent].filter((c): c is string => !!c)
  return [...theme.dataColors, ...structural].map((c) => c.toUpperCase())
}

/** Walk raw JSON collecting every solid-colour literal with the path to its Value. */
function scanColorLiterals(raw: Json, path: PathSeg[], out: { path: PathSeg[]; hex: string }[]): void {
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => scanColorLiterals(v, [...path, i], out))
    return
  }
  if (!isObj(raw)) return
  const color = readColor(raw)
  if (color?.kind === 'literal') {
    // The Value we would patch: raw.solid.color.expr.Literal.Value
    out.push({ path: [...path, 'solid', 'color', 'expr', 'Literal', 'Value'], hex: color.hex })
  }
  for (const [k, v] of Object.entries(raw)) scanColorLiterals(v, [...path, k], out)
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
function subpixelFindings(page: PageNode): Finding[] {
  const out: Finding[] = []
  for (const v of page.visuals) {
    if (!editable(v)) continue
    const r = rectOf(v)
    const offs = (['x', 'y', 'w', 'h'] as const).filter((k) => fract(r[k]))
    if (offs.length === 0) continue
    out.push({
      id: `subpixel:${v.id}`,
      rule: 'subpixel',
      title: `${v.visualType} sits on sub-pixel coordinates`,
      detail: `Position/size has fractional values (e.g. x=${r.x.toFixed(2)}). Rounds to a whole-pixel grid.`,
      pageId: page.id,
      pageName: page.displayName,
      visualIds: [v.id],
      patches: [{ visualId: v.id, patch: roundPositionPatch(1) }],
    })
  }
  return out
}

type EdgeKind = 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter'
const EDGE_AXIS: Record<EdgeKind, 'x' | 'y'> = { left: 'x', right: 'x', hcenter: 'x', top: 'y', bottom: 'y', vcenter: 'y' }
const edgeValue = (r: Rect, e: EdgeKind): number => {
  switch (e) {
    case 'left': return r.x
    case 'right': return r.x + r.w
    case 'hcenter': return r.x + r.w / 2
    case 'top': return r.y
    case 'bottom': return r.y + r.h
    case 'vcenter': return r.y + r.h / 2
  }
}
const EDGE_LABEL: Record<EdgeKind, string> = {
  left: 'left edges', right: 'right edges', hcenter: 'horizontal centres',
  top: 'top edges', bottom: 'bottom edges', vcenter: 'vertical centres',
}

function misalignFindings(page: PageNode): Finding[] {
  const out: Finding[] = []
  const vis = page.visuals.filter(editable)
  // Same visual + axis can align on several edges (top/bottom/vcenter all shift
  // together); report each group once per axis.
  const seen = new Set<string>()
  const edges: EdgeKind[] = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']
  for (const edge of edges) {
    const entries = vis.map((v) => ({ v, r: rectOf(v), val: edgeValue(rectOf(v), edge) }))
    entries.sort((a, b) => a.val - b.val)
    // Greedy clusters of values within MISALIGN_PX.
    let i = 0
    while (i < entries.length) {
      let j = i + 1
      while (j < entries.length && entries[j].val - entries[j - 1].val <= MISALIGN_PX) j++
      const group = entries.slice(i, j)
      const spread = group[group.length - 1].val - group[0].val
      const dedupeKey = `${EDGE_AXIS[edge]}:${group.map((g) => g.v.id).sort().join(',')}`
      if (group.length >= 2 && spread >= MISALIGN_MIN && !seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        const target = Math.round(median(group.map((g) => g.val)))
        const axis = EDGE_AXIS[edge]
        const patches = group
          .filter((g) => Math.abs(g.val - target) > EPS)
          .map((g) => {
            // Convert the desired edge value to an x/y for this visual.
            const coord =
              edge === 'left' || edge === 'top' ? target
              : edge === 'right' ? target - g.r.w
              : edge === 'bottom' ? target - g.r.h
              : edge === 'hcenter' ? target - g.r.w / 2
              : target - g.r.h / 2
            return { visualId: g.v.id, patch: axis === 'x' ? setPositionPatch(coord, undefined) : setPositionPatch(undefined, coord) }
          })
        if (patches.length) {
          out.push({
            id: `misalign:${edge}:${group.map((g) => g.v.id).join('-').slice(0, 40)}`,
            rule: 'misalign',
            title: `${group.length} visuals are ${Math.round(spread)}px from aligning`,
            detail: `Their ${EDGE_LABEL[edge]} are within ${MISALIGN_PX}px of each other. Snap them to a shared edge at ${target}.`,
            pageId: page.id,
            pageName: page.displayName,
            visualIds: group.map((g) => g.v.id),
            patches,
          })
        }
      }
      i = j
    }
  }
  return out
}

function radiusOf(v: VisualNode): number | null {
  const visual = isObj(v.raw.visual) ? v.raw.visual : {}
  const vco = isObj(visual.visualContainerObjects) ? visual.visualContainerObjects : {}
  const border = Array.isArray(vco.border) ? vco.border : null
  const props = border && isObj(border[0]) && isObj(border[0].properties) ? border[0].properties : null
  const radius = props ? readLiteral((props as JsonObject).radius) : undefined
  return typeof radius === 'number' ? radius : null
}

function radiusFindings(page: PageNode): Finding[] {
  const withRadius = page.visuals
    .filter(editable)
    .map((v) => ({ v, r: radiusOf(v) }))
    .filter((e): e is { v: VisualNode; r: number } => e.r !== null)

  // Compare like with like: cards vs cards, charts vs charts. Different visual
  // types legitimately use different radii.
  const byType = new Map<string, { v: VisualNode; r: number }[]>()
  for (const e of withRadius) {
    const arr = byType.get(e.v.visualType) ?? []
    arr.push(e)
    byType.set(e.v.visualType, arr)
  }

  const out: Finding[] = []
  for (const group of byType.values()) {
    if (group.length < 3) continue // need a clear majority to call an outlier
    const counts = new Map<number, number>()
    for (const e of group) counts.set(e.r, (counts.get(e.r) ?? 0) + 1)
    if (counts.size < 2) continue
    const [mode, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    if (modeCount < 2) continue // no real consensus to break
    for (const e of group) {
      if (e.r === mode) continue
      out.push({
        id: `radius:${e.v.id}`,
        rule: 'radius',
        title: `Corner radius ${e.r} breaks the set`,
        detail: `The other ${e.v.visualType} visuals use radius ${mode}. Match it for a consistent look.`,
        pageId: page.id,
        pageName: page.displayName,
        visualIds: [e.v.id],
        patches: [{ visualId: e.v.id, patch: setRadiusPatch(mode) }],
      })
    }
  }
  return out
}

function offPaletteFindings(page: PageNode, theme: Theme | null): Finding[] {
  const pal = palette(theme)
  if (pal.length === 0) return []
  const out: Finding[] = []
  for (const v of page.visuals) {
    if (!editable(v)) continue
    const found: { path: PathSeg[]; hex: string }[] = []
    scanColorLiterals(v.raw, [], found)
    for (const { path, hex } of found) {
      const up = hex.toUpperCase()
      if (pal.includes(up)) continue // exactly a theme colour — fine
      // Nearest theme colour; only flag a near-miss (likely a drifted theme colour).
      let best = pal[0]
      let bestD = Infinity
      for (const c of pal) {
        const d = colorDist(up, c)
        if (d < bestD) { bestD = d; best = c }
      }
      if (bestD > EPS && bestD <= COLOR_NEAR) {
        out.push({
          id: `offpalette:${v.id}:${path.join('.')}`,
          rule: 'offpalette',
          title: `${up} is almost a theme colour`,
          detail: `This colour is ${bestD.toFixed(1)} away from the theme colour ${best}. Snap it to the palette.`,
          pageId: page.id,
          pageName: page.displayName,
          visualIds: [v.id],
          patches: [{ visualId: v.id, patch: setColorLiteralPatch(path, best) }],
        })
      }
    }
  }
  return out
}

/** Run every rule over the report; findings ordered by rule then page. */
export function analyzeReport(report: ReportModel): Finding[] {
  const theme = report.theme
  const all: Finding[] = []
  for (const page of report.pages) {
    all.push(...subpixelFindings(page))
    all.push(...misalignFindings(page))
    all.push(...radiusFindings(page))
    all.push(...offPaletteFindings(page, theme))
  }
  const order: DoctorRule[] = ['misalign', 'radius', 'offpalette', 'subpixel']
  return all.sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule))
}
