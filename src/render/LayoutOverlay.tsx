// Interactive layer for Layout mode. Sits above the (scaled) page canvas in
// screen space and drives selection, drag-move (with grid + smart-guide
// snapping) and resize. All snapping math is in report units; we convert screen
// deltas to report deltas by dividing by `scale`.

import { useRef, useState } from 'react'
import { bounds, computeMoveSnap, resizeRect, type Guide, type Rect, type ResizeHandle } from '../layout/geometry.ts'

export interface LayoutItem {
  id: string
  rect: Rect
  isGroup: boolean
}

interface Props {
  width: number // page width in report units
  height: number
  scale: number
  items: LayoutItem[] // in z-order (last = top)
  selection: Set<string>
  grid: number | null
  showGrid: boolean
  onSelect: (next: Set<string>) => void
  onDraftChange: (patch: Record<string, Rect>) => void
  onCommit: () => void
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}

interface DragState {
  mode: 'move' | 'resize'
  handle?: ResizeHandle
  startX: number
  startY: number
  startRects: Map<string, Rect>
  ids: string[]
}

export function LayoutOverlay(props: Props) {
  const { width, height, scale, items, selection, grid, showGrid, onSelect, onDraftChange, onCommit } = props
  const [guides, setGuides] = useState<Guide[]>([])
  const drag = useRef<DragState | null>(null)

  const rectOf = (id: string) => items.find((i) => i.id === id)?.rect
  const sx = (v: number) => v * scale

  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    setGuides([])
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    onCommit()
  }

  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const ddx = (e.clientX - d.startX) / scale
    const ddy = (e.clientY - d.startY) / scale

    if (d.mode === 'move') {
      // Proposed rects for the moving selection.
      const proposed = new Map<string, Rect>()
      for (const id of d.ids) {
        const s = d.startRects.get(id)!
        proposed.set(id, { ...s, x: s.x + ddx, y: s.y + ddy })
      }
      const box = bounds([...proposed.values()])
      const others = items.filter((i) => !d.ids.includes(i.id)).map((i) => i.rect)
      const snap = computeMoveSnap(box, others, grid, 6 / scale)
      const patch: Record<string, Rect> = {}
      for (const [id, r] of proposed) patch[id] = { ...r, x: r.x + snap.dx, y: r.y + snap.dy }
      onDraftChange(patch)
      setGuides(snap.guides)
    } else if (d.mode === 'resize' && d.handle) {
      const id = d.ids[0]
      const s = d.startRects.get(id)!
      onDraftChange({ [id]: resizeRect(s, d.handle, ddx, ddy, grid) })
    }
  }

  const onUp = () => endDrag()

  const beginDrag = (mode: 'move' | 'resize', ids: string[], e: React.PointerEvent, handle?: ResizeHandle) => {
    const startRects = new Map<string, Rect>()
    for (const id of ids) {
      const r = rectOf(id)
      if (r) startRects.set(id, r)
    }
    drag.current = { mode, handle, startX: e.clientX, startY: e.clientY, startRects, ids }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onVisualPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    const additive = e.shiftKey
    if (selection.has(id)) {
      if (additive) {
        const next = new Set(selection)
        next.delete(id)
        onSelect(next)
        return
      }
      beginDrag('move', [...selection], e)
    } else {
      const next = additive ? new Set([...selection, id]) : new Set([id])
      onSelect(next)
      beginDrag('move', [...next], e)
    }
  }

  const single = selection.size === 1 ? rectOf([...selection][0]) : null

  return (
    <div
      className="layout-overlay"
      style={{ width: sx(width), height: sx(height) }}
      onPointerDown={(e) => {
        // Empty-space click clears selection (unless additive).
        if (e.target === e.currentTarget && !e.shiftKey) onSelect(new Set())
      }}
    >
      {showGrid && (
        <div
          className="layout-grid"
          style={{ backgroundSize: `${sx(40)}px ${sx(40)}px` }}
        />
      )}

      {/* Hit + selection rects, in z-order (last on top). */}
      {items.map((it) => {
        const selected = selection.has(it.id)
        return (
          <div
            key={it.id}
            className={`layout-hit${selected ? ' selected' : ''}${it.isGroup ? ' group' : ''}`}
            style={{ left: sx(it.rect.x), top: sx(it.rect.y), width: sx(it.rect.w), height: sx(it.rect.h) }}
            onPointerDown={(e) => onVisualPointerDown(e, it.id)}
          />
        )
      })}

      {/* Resize handles for a single selection. */}
      {single &&
        HANDLES.map((h) => {
          const cx = single.x + (h.includes('w') ? 0 : h.includes('e') ? single.w : single.w / 2)
          const cy = single.y + (h.includes('n') ? 0 : h.includes('s') ? single.h : single.h / 2)
          return (
            <div
              key={h}
              className="layout-handle"
              style={{ left: sx(cx), top: sx(cy), cursor: HANDLE_CURSOR[h] }}
              onPointerDown={(e) => {
                e.stopPropagation()
                beginDrag('resize', [[...selection][0]], e, h)
              }}
            />
          )
        })}

      {/* Smart guides. */}
      <svg className="layout-guides" width={sx(width)} height={sx(height)}>
        {guides.map((g, i) =>
          g.axis === 'x' ? (
            <line key={i} x1={sx(g.at)} y1={sx(g.from)} x2={sx(g.at)} y2={sx(g.to)} />
          ) : (
            <line key={i} x1={sx(g.from)} y1={sx(g.at)} x2={sx(g.to)} y2={sx(g.at)} />
          ),
        )}
      </svg>
    </div>
  )
}
