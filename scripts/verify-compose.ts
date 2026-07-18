// Verifies the Compose classifier + packer against the REAL report.
//   node --experimental-strip-types scripts/verify-compose.ts

import { loadReport } from '../src/pbir/report.ts'
import { classifyPage } from '../src/designer/classify.ts'
import { composePage, PACKS } from '../src/designer/compose.ts'
import { createNodeProvider } from './nodeProvider.ts'
import type { Rect } from '../src/layout/geometry.ts'

const ROOT = process.argv[2] ?? 'E:/Data Analyst/POWER BI/Medical_Legal_BI_Project'
let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

const model = await loadReport(createNodeProvider(ROOT), 'Medical_Legal_Project')
const exec = model.pages.find((p) => p.displayName === 'The Executive Dashboard')!

console.log('\nClassifier on the real Executive Dashboard')
const items = classifyPage(exec)
const byRole = (r: string) => items.filter((i) => i.role === r)
console.log(
  '  roles →',
  ['title', 'nav', 'kpi', 'slicer', 'hero', 'chart', 'table', 'decor'].map((r) => `${r}:${byRole(r).length}`).join(' '),
)
check('finds the 5 KPI cards', byRole('kpi').length === 5, `${byRole('kpi').length}`)
check('finds the 6 slicers', byRole('slicer').length === 6, `${byRole('slicer').length}`)
check('exactly one hero', byRole('hero').length === 1, byRole('hero')[0]?.v.visualType)
check('hero is the line chart', byRole('hero')[0]?.v.visualType === 'lineChart')
check('finds the title textbox', byRole('title').length === 1)
check('nav buttons present', byRole('nav').length >= 2, `${byRole('nav').length}`)

const companions = items.filter((i) => i.companionOf)
check('bookmark dots ride as companions', companions.length >= 2, `${companions.length} companions`)
const swaps = items.filter((i) => i.swapWith)
check('swap group detected (stacked toggle visuals)', swaps.length >= 1, swaps.map((s) => `${s.v.visualType}→${s.swapWith?.slice(0, 6)}`).join(', '))
const hiddenSwap = swaps.find((s) => s.v.isHidden)
check('hidden partner follows the visible leader', !!hiddenSwap)

console.log('\nPacker invariants (both packs, real page)')
const overlapArea = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
for (const pack of PACKS) {
  const rects = composePage(exec, items, pack.id)
  const ids = Object.keys(rects)
  console.log(`  — ${pack.name}: placed ${ids.length} visuals`)
  check(`${pack.id}: places every movable role`, ids.length >= 15, `${ids.length}`)
  check(
    `${pack.id}: everything inside the page`,
    ids.every((id) => {
      const r = rects[id]
      return r.x >= 0 && r.y >= 0 && r.x + r.w <= exec.width + 0.5 && r.y + r.h <= exec.height + 0.5 && r.w > 0 && r.h > 0
    }),
  )
  // Slot exclusivity: no two placed non-follower visuals overlap.
  const followers = new Set(items.filter((i) => i.swapWith || i.companionOf).map((i) => i.v.id))
  const solid = ids.filter((id) => !followers.has(id))
  let collisions = 0
  for (let a = 0; a < solid.length; a++)
    for (let b = a + 1; b < solid.length; b++)
      if (overlapArea(rects[solid[a]], rects[solid[b]]) > 1) collisions++
  check(`${pack.id}: no slot collisions`, collisions === 0, `${collisions} overlaps`)
  // KPI cards are uniformly sized (alignment shape varies per pack: band,
  // multi-row band, or side column — sizing consistency is the invariant).
  const kpiRects = byRole('kpi').map((k) => rects[k.v.id])
  check(
    `${pack.id}: KPI cards uniformly sized`,
    Math.max(...kpiRects.map((r) => r.w)) - Math.min(...kpiRects.map((r) => r.w)) <= 2 &&
      Math.max(...kpiRects.map((r) => r.h)) - Math.min(...kpiRects.map((r) => r.h)) <= 2,
  )
  // Swap partner mirrors its leader exactly.
  const sw = swaps[0]
  if (sw) {
    const a = rects[sw.v.id]
    const b = rects[sw.swapWith!]
    check(`${pack.id}: swap partner shares the slot`, !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)
  }
  // Companion keeps its PROPORTIONAL anchor on the host (top-right stays
  // top-right even when the host lands in a narrower slot).
  const comp = companions[0]
  if (comp) {
    const host = items.find((i) => i.v.id === comp.companionOf)!
    const oldFrac = (comp.v.position.x - host.v.position.x) / host.v.position.width
    const hostNew = rects[comp.companionOf!]
    const newFrac = (rects[comp.v.id].x - hostNew.x) / hostNew.w
    check(`${pack.id}: companion keeps host anchor`, Math.abs(oldFrac - newFrac) <= 0.03, `${oldFrac.toFixed(3)} vs ${newFrac.toFixed(3)}`)
  }
}
check('app-shell uses the left slicer rail', (() => {
  const rects = composePage(exec, items, 'app-shell')
  const slicerXs = byRole('slicer').map((s) => rects[s.v.id].x)
  return slicerXs.every((x) => x <= 20)
})())

// ---------------------------------------------------------------------------
// Full matrix: every pack × several real pages, generic invariants.
// ---------------------------------------------------------------------------
console.log('\nMatrix: every pack × real pages')
const MATRIX_PAGES = ['The Executive Dashboard', 'Case Detail', 'Claim Detail', 'Insurance Claims Analysis', 'Tooltip']
for (const pageName of MATRIX_PAGES) {
  const page = model.pages.find((p) => p.displayName === pageName)
  if (!page) {
    check(`page exists: ${pageName}`, false)
    continue
  }
  const cls = classifyPage(page)
  const movable = cls.filter((i) => !['decor', 'group'].includes(i.role) || i.swapWith || i.companionOf)
  const followers = new Set(cls.filter((i) => i.swapWith || i.companionOf).map((i) => i.v.id))
  let pageOk = true
  const problems: string[] = []
  for (const pack of PACKS) {
    const rects = composePage(page, cls, pack.id)
    const ids = Object.keys(rects)
    // Every movable, non-follower visual must be placed.
    const expected = cls.filter((i) => !['decor', 'group'].includes(i.role) && !i.swapWith && !i.companionOf)
    const missing = expected.filter((i) => !rects[i.v.id])
    if (missing.length) {
      pageOk = false
      problems.push(`${pack.id}: ${missing.length} unplaced`)
    }
    // In-bounds.
    if (!ids.every((id) => {
      const r = rects[id]
      return r.x >= 0 && r.y >= 0 && r.x + r.w <= page.width + 0.5 && r.y + r.h <= page.height + 0.5 && r.w > 0 && r.h > 0
    })) {
      pageOk = false
      problems.push(`${pack.id}: out of bounds`)
    }
    // No collisions among solid (non-follower) placed visuals — skip the tiny
    // tooltip canvas where bands legitimately compress.
    if (page.height >= 420) {
      const solid = ids.filter((id) => !followers.has(id))
      for (let a = 0; a < solid.length; a++) {
        for (let b = a + 1; b < solid.length; b++) {
          if (overlapArea(rects[solid[a]], rects[solid[b]]) > 1) {
            pageOk = false
            problems.push(`${pack.id}: ${solid[a].slice(0, 6)}×${solid[b].slice(0, 6)} collide`)
            a = solid.length // bail this pack
            break
          }
        }
      }
    }
  }
  check(`${pageName} (${page.visuals.length} visuals): all 8 packs clean`, pageOk, problems.slice(0, 3).join('; '))
  void movable
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
