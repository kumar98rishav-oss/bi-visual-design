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
  // KPI band is uniform.
  const kpiRects = byRole('kpi').map((k) => rects[k.v.id])
  check(
    `${pack.id}: KPI band uniform + aligned`,
    kpiRects.every((r) => Math.abs(r.h - kpiRects[0].h) <= 1 && Math.abs(r.y - kpiRects[0].y) <= 1) &&
      Math.max(...kpiRects.map((r) => r.w)) - Math.min(...kpiRects.map((r) => r.w)) <= 2,
  )
  // Swap partner mirrors its leader exactly.
  const sw = swaps[0]
  if (sw) {
    const a = rects[sw.v.id]
    const b = rects[sw.swapWith!]
    check(`${pack.id}: swap partner shares the slot`, !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)
  }
  // Companion keeps its offset to the host.
  const comp = companions[0]
  if (comp) {
    const host = items.find((i) => i.v.id === comp.companionOf)!
    const oldOff = comp.v.position.x - host.v.position.x
    const newOff = rects[comp.v.id].x - rects[comp.companionOf!].x
    check(`${pack.id}: companion keeps host offset`, Math.abs(oldOff - newOff) <= 1, `${oldOff.toFixed(1)} vs ${newOff.toFixed(1)}`)
  }
}
check('app-shell uses the left slicer rail', (() => {
  const rects = composePage(exec, items, 'app-shell')
  const slicerXs = byRole('slicer').map((s) => rects[s.v.id].x)
  return slicerXs.every((x) => x <= 20)
})())

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
