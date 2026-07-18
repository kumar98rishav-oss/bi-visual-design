// Calibration + capture dialog for True View. Shows a snapshot of the shared
// Desktop window; the user drags an aspect-locked box over the report canvas
// (the page area inside Desktop's chrome), then captures. The crop is
// remembered for the session so re-captures are one click.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, X } from 'lucide-react'
import { cropFrame, seedCrop, type CropRect, type DesktopCapture } from '../truth/capture.ts'

interface Props {
  capture: DesktopCapture
  /** Page aspect ratio (width / height) the crop box locks to. */
  aspect: number
  pageName: string
  initialCrop: CropRect | null
  onCapture: (dataUrl: string, crop: CropRect) => void
  onCancel: () => void
}

const PREVIEW_MAX_W = 860
const PREVIEW_MAX_H = 480
const MIN_W = 60

type DragMode = { kind: 'move'; startX: number; startY: number; start: CropRect } | { kind: 'resize'; corner: 'nw' | 'ne' | 'sw' | 'se'; start: CropRect } | null

export function CaptureDialog({ capture, aspect, pageName, initialCrop, onCapture, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLCanvasElement | null>(null)
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const drag = useRef<DragMode>(null)

  // Preview scale: frame pixels → dialog pixels.
  const k = frameSize ? Math.min(PREVIEW_MAX_W / frameSize.w, PREVIEW_MAX_H / frameSize.h) : 1

  const refresh = useCallback(() => {
    const frame = capture.grabFrame()
    if (!frame) return
    frameRef.current = frame
    setFrameSize({ w: frame.width, h: frame.height })
    setCrop((c) => c ?? initialCrop ?? seedCrop(frame.width, frame.height, aspect))
    // Paint the scaled preview.
    const preview = canvasRef.current
    if (preview) {
      const scale = Math.min(PREVIEW_MAX_W / frame.width, PREVIEW_MAX_H / frame.height)
      preview.width = Math.round(frame.width * scale)
      preview.height = Math.round(frame.height * scale)
      const g = preview.getContext('2d')
      if (g) g.drawImage(frame, 0, 0, preview.width, preview.height)
    }
  }, [capture, aspect, initialCrop])

  useEffect(() => {
    // First frame can lag the stream start slightly.
    refresh()
    const t = setTimeout(refresh, 350)
    return () => clearTimeout(t)
  }, [refresh])

  const clamp = useCallback(
    (c: CropRect): CropRect => {
      if (!frameSize) return c
      let { x, y, w, h } = c
      w = Math.max(MIN_W, Math.min(w, frameSize.w))
      h = w / aspect
      if (h > frameSize.h) {
        h = frameSize.h
        w = h * aspect
      }
      x = Math.max(0, Math.min(x, frameSize.w - w))
      y = Math.max(0, Math.min(y, frameSize.h - h))
      return { x, y, w, h }
    },
    [frameSize, aspect],
  )

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current
      if (!d || !frameSize) return
      const preview = canvasRef.current
      if (!preview) return
      const r = preview.getBoundingClientRect()
      const px = (e.clientX - r.left) / k
      const py = (e.clientY - r.top) / k

      if (d.kind === 'move') {
        setCrop(clamp({ ...d.start, x: d.start.x + (px - d.startX), y: d.start.y + (py - d.startY) }))
      } else {
        // Resize toward the pointer, anchored at the opposite corner.
        const anchorX = d.corner.includes('w') ? d.start.x + d.start.w : d.start.x
        const anchorY = d.corner.includes('n') ? d.start.y + d.start.h : d.start.y
        const w = Math.max(MIN_W, Math.abs(px - anchorX))
        const h = w / aspect
        setCrop(
          clamp({
            x: px >= anchorX ? anchorX : anchorX - w,
            y: d.corner.includes('n') ? anchorY - h : anchorY,
            w,
            h,
          }),
        )
      }
    },
    [frameSize, k, aspect, clamp],
  )

  const endDrag = useCallback(() => {
    drag.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', endDrag)
  }, [onMove])

  const beginDrag = (mode: NonNullable<DragMode>) => {
    drag.current = mode
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
  }

  const doCapture = () => {
    const frame = frameRef.current ?? capture.grabFrame()
    if (!frame || !crop) return
    const url = cropFrame(frame, crop)
    if (url) onCapture(url, crop)
  }

  const px = (v: number) => v * k

  return (
    <div className="capdlg-backdrop" role="dialog" aria-modal="true">
      <div className="capdlg">
        <div className="capdlg-head">
          <div>
            <div className="tl-title">Capture “{pageName}”</div>
            <div className="tl-sub">Drag the box so it covers only the report canvas in Power BI Desktop — not the ribbon or panes.</div>
          </div>
          <button className="iconbtn" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="capdlg-stage">
          <canvas ref={canvasRef} className="capdlg-frame" />
          {crop && frameSize && (
            <div
              className="capdlg-crop"
              style={{ left: px(crop.x), top: px(crop.y), width: px(crop.w), height: px(crop.h) }}
              onPointerDown={(e) => {
                e.preventDefault()
                const preview = canvasRef.current!.getBoundingClientRect()
                beginDrag({
                  kind: 'move',
                  startX: (e.clientX - preview.left) / k,
                  startY: (e.clientY - preview.top) / k,
                  start: crop,
                })
              }}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  className={`capdlg-handle ${corner}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    beginDrag({ kind: 'resize', corner, start: crop })
                  }}
                />
              ))}
            </div>
          )}
          {!frameSize && <div className="capdlg-wait">Waiting for the shared window…</div>}
        </div>

        <div className="capdlg-actions">
          <button className="btn" onClick={refresh}>
            <RefreshCw size={14} /> Refresh frame
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={doCapture} disabled={!crop || !frameSize}>
            <Camera size={14} /> Capture this page
          </button>
        </div>
      </div>
    </div>
  )
}
