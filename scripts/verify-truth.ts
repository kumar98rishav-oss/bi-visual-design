// Verifies the canvas auto-detector against synthetic "Desktop window" frames.
//   node --experimental-strip-types scripts/verify-truth.ts

import { detectCanvasRect, type FrameData } from '../src/truth/detect.ts'

let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

interface Spec {
  W: number
  H: number
  ws: [number, number, number] // workspace grey
  page: [number, number, number] // page background
  canvas: { x: number; y: number; w: number; h: number }
  ribbon?: boolean
  paneRight?: number // width of a light pane glued to the right edge
}

/** Paint a synthetic Desktop window: workspace + ribbon + canvas + visuals. */
function synthFrame(s: Spec): FrameData {
  const data = new Uint8ClampedArray(s.W * s.H * 4)
  const put = (x: number, y: number, c: [number, number, number]) => {
    const i = (y * s.W + x) * 4
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255
  }
  const rect = (x: number, y: number, w: number, h: number, c: [number, number, number]) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx >= 0 && yy >= 0 && xx < s.W && yy < s.H) put(xx, yy, c)
    }
  }
  rect(0, 0, s.W, s.H, s.ws)
  if (s.ribbon) rect(0, 0, s.W, Math.floor(s.H * 0.09), [205, 90, 70]) // colourful ribbon band
  if (s.paneRight) rect(s.W - s.paneRight, Math.floor(s.H * 0.09), s.paneRight, s.H, [243, 242, 241])
  const c = s.canvas
  rect(c.x, c.y, c.w, c.h, s.page)
  // Visuals on the canvas: white cards + a dark chart block.
  rect(c.x + 20, c.y + 14, Math.floor(c.w * 0.28), Math.floor(c.h * 0.16), [255, 255, 255])
  rect(c.x + Math.floor(c.w * 0.36), c.y + 14, Math.floor(c.w * 0.28), Math.floor(c.h * 0.16), [255, 255, 255])
  rect(c.x + 20, c.y + Math.floor(c.h * 0.3), Math.floor(c.w * 0.55), Math.floor(c.h * 0.6), [66, 104, 113])
  return { data, width: s.W, height: s.H }
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

console.log('\nLight Desktop, Frontier-cream page (the real report case)')
{
  const canvas = { x: 120, y: 78, w: 704, h: 396 } // 16:9
  const f = synthFrame({ W: 960, H: 540, ws: [230, 230, 230], page: [249, 247, 242], canvas, ribbon: true })
  const r = detectCanvasRect(f, 16 / 9)
  check('detected', !!r)
  if (r) {
    check('x within 6px', near(r.x, canvas.x, 6), `x=${r.x.toFixed(1)}`)
    check('y within 6px', near(r.y, canvas.y, 6), `y=${r.y.toFixed(1)}`)
    check('w within 8px', near(r.w, canvas.w, 8), `w=${r.w.toFixed(1)}`)
    check('h within 8px', near(r.h, canvas.h, 8), `h=${r.h.toFixed(1)}`)
    check('aspect locked', near(r.w / r.h, 16 / 9, 0.01))
  }
}

console.log('\nWith a light pane glued to the right edge (bleed case)')
{
  const canvas = { x: 100, y: 70, w: 640, h: 360 }
  const f = synthFrame({ W: 960, H: 540, ws: [230, 230, 230], page: [255, 255, 255], canvas, ribbon: true, paneRight: 150 })
  const r = detectCanvasRect(f, 16 / 9)
  check('detected despite pane', !!r)
  if (r) {
    check('left edge anchored', near(r.x, canvas.x, 6), `x=${r.x.toFixed(1)}`)
    check('top edge anchored', near(r.y, canvas.y, 6), `y=${r.y.toFixed(1)}`)
    check('aspect locked (pane trimmed)', near(r.w / r.h, 16 / 9, 0.01), `w=${r.w.toFixed(1)} h=${r.h.toFixed(1)}`)
  }
}

console.log('\nDark Desktop chrome')
{
  const canvas = { x: 140, y: 90, w: 640, h: 360 }
  const f = synthFrame({ W: 960, H: 540, ws: [45, 45, 48], page: [249, 247, 242], canvas })
  const r = detectCanvasRect(f, 16 / 9)
  check('detected on dark chrome', !!r)
  if (r) check('position ok', near(r.x, canvas.x, 6) && near(r.y, canvas.y, 6), `(${r.x.toFixed(1)},${r.y.toFixed(1)})`)
}

console.log('\nNo canvas present (all workspace) → null')
{
  const f = synthFrame({ W: 640, H: 360, ws: [230, 230, 230], page: [230, 230, 230], canvas: { x: 0, y: 0, w: 1, h: 1 } })
  check('returns null', detectCanvasRect(f, 16 / 9) === null)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
