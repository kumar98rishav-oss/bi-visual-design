// Per-visual sprites: each visual shows ITS region of the captured page via
// CSS background positioning — no image slicing, no canvas work. The snapshot
// stretches to (pageW × pageH) logical units scaled by how much the visual has
// been resized since capture, and shifts so the visual's capture-time rect
// lands exactly inside the box. Dragging a box therefore drags the visual's
// real rendered pixels.

import type { Rect } from '../layout/geometry.ts'

export interface SpriteCss {
  /** background-size, in page-logical px. */
  width: number
  height: number
  /** background-position, in page-logical px (negative offsets). */
  x: number
  y: number
}

/**
 * @param orig where the visual was when the page was captured
 * @param cur  where (and how big) the box is being rendered now
 */
export function spriteStyle(orig: Rect, cur: Rect, pageW: number, pageH: number): SpriteCss {
  const kw = orig.w > 0 ? cur.w / orig.w : 1
  const kh = orig.h > 0 ? cur.h / orig.h : 1
  return {
    width: pageW * kw,
    height: pageH * kh,
    x: -orig.x * kw,
    y: -orig.y * kh,
  }
}
