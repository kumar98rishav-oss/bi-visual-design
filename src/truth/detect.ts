// Auto-detection of the report canvas inside a captured Desktop frame.
//
// The report page sits as a large rectangle of the page background colour,
// surrounded by Desktop's uniform workspace grey. We learn the workspace
// colour from the frame itself (mode colour of the left/right margins), then
// scan for the widest horizontal and vertical runs that are NOT workspace,
// take medians across several scanlines, and snap the result to the page's
// known aspect ratio — anchored top-left, where the workspace margin is most
// reliable (the right/bottom edges can bleed into Desktop's panes/tab strip).
//
// Pure function over raw RGBA — verifiable in Node with a synthetic frame.

import type { CropRect } from './capture.ts'

export interface FrameData {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Per-channel-sum distance at which a pixel still counts as "workspace". */
const WS_TOLERANCE = 24
/** A run must span at least this fraction of the frame to be the canvas. */
const MIN_RUN = 0.3

function at(frame: FrameData, x: number, y: number): [number, number, number] {
  const i = (y * frame.width + x) * 4
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]]
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
}

/** The dominant colour of the left+right margins = Desktop's workspace grey. */
function workspaceColor(frame: FrameData): [number, number, number] {
  const counts = new Map<number, { n: number; sum: [number, number, number] }>()
  const sample = (x: number, y: number) => {
    const c = at(frame, x, y)
    const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4)
    const e = counts.get(key) ?? { n: 0, sum: [0, 0, 0] }
    e.n++
    e.sum[0] += c[0]
    e.sum[1] += c[1]
    e.sum[2] += c[2]
    counts.set(key, e)
  }
  const { width: W, height: H } = frame
  for (let y = Math.floor(H * 0.2); y < H * 0.92; y += 3) {
    for (let x = Math.floor(W * 0.005); x < W * 0.035; x += 2) sample(x, y)
    for (let x = Math.floor(W * 0.965); x < W * 0.995; x += 2) sample(x, y)
  }
  let best: { n: number; sum: [number, number, number] } | null = null
  for (const e of counts.values()) if (!best || e.n > best.n) best = e
  if (!best) return [230, 230, 230]
  return [best.sum[0] / best.n, best.sum[1] / best.n, best.sum[2] / best.n] as [number, number, number]
}

/** Longest contiguous non-workspace run along one scanline. */
function longestRun(
  frame: FrameData,
  ws: [number, number, number],
  fixed: number,
  horizontal: boolean,
): [number, number] | null {
  const length = horizontal ? frame.width : frame.height
  let bestStart = -1
  let bestLen = 0
  let start = -1
  for (let i = Math.floor(length * 0.01); i < length * 0.99; i++) {
    const c = horizontal ? at(frame, i, fixed) : at(frame, fixed, i)
    const isWs = dist(c, ws) <= WS_TOLERANCE
    if (!isWs) {
      if (start < 0) start = i
    } else if (start >= 0) {
      if (i - start > bestLen) {
        bestLen = i - start
        bestStart = start
      }
      start = -1
    }
  }
  if (start >= 0 && length - start > bestLen) {
    bestLen = length - start
    bestStart = start
  }
  if (bestLen < length * MIN_RUN) return null
  return [bestStart, bestStart + bestLen]
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Find the report canvas. Returns null when no confident rectangle exists —
 * the caller falls back to the manual seed.
 */
export function detectCanvasRect(frame: FrameData, aspect: number): CropRect | null {
  const { width: W, height: H } = frame
  const ws = workspaceColor(frame)

  // Horizontal extent from several scanlines through the canvas body.
  const x0s: number[] = []
  const x1s: number[] = []
  for (const fy of [0.35, 0.45, 0.55, 0.65, 0.75]) {
    const run = longestRun(frame, ws, Math.floor(H * fy), true)
    if (run) {
      x0s.push(run[0])
      x1s.push(run[1])
    }
  }
  if (x0s.length < 3) return null
  const x0 = median(x0s)
  const x1 = median(x1s)

  // Vertical extent along columns inside that horizontal extent.
  const y0s: number[] = []
  const y1s: number[] = []
  for (const fx of [0.3, 0.5, 0.7]) {
    const run = longestRun(frame, ws, Math.floor(x0 + (x1 - x0) * fx), false)
    if (run) {
      y0s.push(run[0])
      y1s.push(run[1])
    }
  }
  if (y0s.length < 2) return null
  const y0 = median(y0s)
  const y1 = median(y1s)

  let w = x1 - x0
  let h = y1 - y0
  if (w < W * MIN_RUN || h < H * MIN_RUN) return null

  // Snap to the page aspect, anchored top-left (the reliable margins). A small
  // mismatch is centred; a large one means an edge bled into a pane/tab strip,
  // so the oversized dimension is trimmed.
  const wFromH = h * aspect
  if (Math.abs(w - wFromH) / wFromH <= 0.03) {
    return { x: x0 + (w - wFromH) / 2, y: y0, w: wFromH, h }
  }
  if (w > wFromH) return { x: x0, y: y0, w: wFromH, h }
  return { x: x0, y: y0, w, h: w / aspect }
}

/** Downsample-aware wrapper used by the dialog (keeps detection fast). */
export function detectFromCanvas(
  frameCanvas: HTMLCanvasElement,
  aspect: number,
): CropRect | null {
  const targetW = 480
  const ds = Math.max(1, Math.ceil(frameCanvas.width / targetW))
  const w = Math.floor(frameCanvas.width / ds)
  const h = Math.floor(frameCanvas.height / ds)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(frameCanvas, 0, 0, w, h)
  const img = g.getImageData(0, 0, w, h)
  const found = detectCanvasRect({ data: img.data, width: w, height: h }, aspect)
  if (!found) return null
  return { x: found.x * ds, y: found.y * ds, w: found.w * ds, h: found.h * ds }
}
