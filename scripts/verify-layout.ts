// Unit checks for the Layout Lab geometry engine and position-deploy payload.
//   node --experimental-strip-types scripts/verify-layout.ts

import {
  alignRects,
  distributeRects,
  matchSize,
  computeMoveSnap,
  resizeRect,
  bounds,
  type Rect,
} from '../src/layout/geometry.ts'
import { applyPositionEdit } from '../src/layout/deploy.ts'
import type { VisualNode } from '../src/pbir/types.ts'

let failures = 0
function check(label: string, cond: boolean, detail = ''): void {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

console.log('\nAlign')
{
  const rects = [r(10, 10, 100, 40), r(50, 80, 60, 40), r(200, 200, 80, 40)]
  const left = alignRects(rects, 'left')
  check('align left → all x = bbox min x', left.every((q) => q.x === 10))
  const right = alignRects(rects, 'right')
  const bb = bounds(rects)
  check('align right → all right edges = bbox right', right.every((q) => approx(q.x + q.w, bb.x + bb.w)))
  const hc = alignRects(rects, 'hcenter')
  const cx = bb.x + bb.w / 2
  check('align hcenter → centres line up', hc.every((q) => approx(q.x + q.w / 2, cx)))
  check('align top → all y equal', alignRects(rects, 'top').every((q) => q.y === 10))
  check('sizes unchanged by align', left.every((q, i) => q.w === rects[i].w && q.h === rects[i].h))
}

console.log('\nDistribute')
{
  // Three boxes; distribute h should give equal gaps between edges.
  const rects = [r(0, 0, 20, 10), r(30, 0, 20, 10), r(100, 0, 20, 10)]
  const out = distributeRects(rects, 'h')
  const sorted = out.slice().sort((a, b) => a.x - b.x)
  const gap1 = sorted[1].x - (sorted[0].x + sorted[0].w)
  const gap2 = sorted[2].x - (sorted[1].x + sorted[1].w)
  check('distribute h → equal gaps', approx(gap1, gap2), `${gap1.toFixed(2)} vs ${gap2.toFixed(2)}`)
  check('distribute keeps the extremes fixed', sorted[0].x === 0 && approx(sorted[2].x, 100))
}

console.log('\nMatch size')
{
  const rects = [r(0, 0, 120, 60), r(10, 100, 40, 30), r(10, 200, 80, 90)]
  const m = matchSize(rects, 0, 'both')
  check('match both → others adopt ref w/h', m[1].w === 120 && m[1].h === 60 && m[2].w === 120 && m[2].h === 60)
  check('match keeps reference intact', m[0].w === 120 && m[0].h === 60)
  const mw = matchSize(rects, 0, 'width')
  check('match width → heights unchanged', mw[1].w === 120 && mw[1].h === 30)
}

console.log('\nSnap while moving')
{
  const moving = r(103, 50, 100, 40) // left edge 3px off a neighbour at x=100
  const others = [r(100, 200, 80, 40), r(400, 50, 60, 40)]
  const { dx, guides } = computeMoveSnap(moving, others, 8, 6)
  check('snaps left edge to neighbour (dx = -3)', approx(dx, -3), `dx=${dx}`)
  check('produces a vertical guide at x=100', guides.some((g) => g.axis === 'x' && approx(g.at, 100)))
  // No neighbour in range on an axis → grid fallback.
  const far = r(37, 500, 50, 20)
  const { dx: gx } = computeMoveSnap(far, [], 8, 6)
  check('grid fallback snaps x=37 → 40 (dx=3)', approx(gx, 3), `dx=${gx}`)
}

console.log('\nResize')
{
  const start = r(100, 100, 200, 100)
  const se = resizeRect(start, 'se', 40, 20, null)
  check('SE handle grows w/h, keeps x/y', se.x === 100 && se.y === 100 && se.w === 240 && se.h === 120)
  const nw = resizeRect(start, 'nw', 20, 10, null)
  check('NW handle moves x/y, shrinks w/h', nw.x === 120 && nw.y === 110 && nw.w === 180 && nw.h === 90)
  const tiny = resizeRect(start, 'e', -500, 0, null)
  check('min size enforced, no flip', tiny.w === 8 && tiny.x === 100)
  const gridded = resizeRect(start, 'se', 43, 0, 8)
  check('grid snaps the resized edge (right edge on grid)', (gridded.x + gridded.w) % 8 === 0, `right=${gridded.x + gridded.w}`)
}

console.log('\nDeploy payload (position only, rest preserved)')
{
  const visual = {
    id: 'v1',
    pageId: 'p1',
    file: 'x/visual.json',
    name: 'v1',
    position: { x: 1, y: 2, z: 5, height: 40, width: 100, tabOrder: 3 },
    visualType: 'card',
    projections: [],
    raw: {
      $schema: 'schema',
      name: 'v1',
      position: { x: 1, y: 2, z: 5, height: 40, width: 100, tabOrder: 3 },
      visual: { visualType: 'card', extra: 'keep-me' },
    },
  } as unknown as VisualNode
  const out = applyPositionEdit(visual, r(10, 20, 300, 80)) as Record<string, unknown>
  const pos = out.position as Record<string, unknown>
  check('x/y/width/height updated', pos.x === 10 && pos.y === 20 && pos.width === 300 && pos.height === 80)
  check('z and tabOrder preserved', pos.z === 5 && pos.tabOrder === 3)
  check('visual body untouched', JSON.stringify(out.visual) === JSON.stringify(visual.raw.visual))
  check('original not mutated', (visual.raw.position as Record<string, unknown>).x === 1)
  check('serializes to valid JSON', (() => { try { JSON.parse(JSON.stringify(out)); return true } catch { return false } })())
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
