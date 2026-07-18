// A single visual rendered at its exact PBIR position, with its title bar,
// background and border chrome applied, and placeholder content inside.

import { useMemo } from 'react'
import type { Theme, VisualNode } from '../pbir/types.ts'
import type { Rect } from '../layout/geometry.ts'
import { readShapeStyle, readVisualChrome } from './formatting.ts'
import { PlaceholderVisual } from './PlaceholderVisual.tsx'

interface Props {
  visual: VisualNode
  theme: Theme | null
  selected: boolean
  onSelect: (id: string) => void
  /** When set (Layout mode), render at this rect instead of the stored one. */
  rect?: Rect
  /** In Layout mode the overlay handles pointer events, not the box. */
  inert?: boolean
}

const TITLE_H = 24

export function VisualBox({ visual, theme, selected, onSelect, rect, inert }: Props) {
  const chrome = useMemo(() => readVisualChrome(visual, theme), [visual, theme])
  const shape = useMemo(() => readShapeStyle(visual, theme), [visual, theme])
  const pos = rect
    ? { x: rect.x, y: rect.y, width: rect.w, height: rect.h, z: visual.position.z }
    : visual.position
  const position = pos

  const isGroup = visual.visualType === 'visualGroup'
  // A shape carries no title bar and no placeholder content — it is pure fill.
  const showTitle = !shape && !!chrome.title && chrome.title.show && chrome.title.text !== ''
  const contentH = position.height - (showTitle ? TITLE_H : 0)

  const style: React.CSSProperties = shape
    ? {
        // A shape is a pure panel: its own fill, its own radius, no chrome.
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        zIndex: position.z,
        pointerEvents: inert ? 'none' : undefined,
        borderRadius: shape.radius,
        background: shape.fill ?? 'var(--art-border)',
        border: shape.stroke ? `1px solid ${shape.stroke}` : 'none',
        boxShadow: shape.shadow ? '0 4px 14px rgba(0,0,0,0.28)' : undefined,
      }
    : {
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        zIndex: position.z,
        pointerEvents: inert ? 'none' : undefined,
        borderRadius: chrome.border.radius || (isGroup ? 0 : 4),
        background: isGroup ? 'transparent' : chrome.background ?? 'var(--art-surface)',
        border: isGroup
          ? '1.5px dashed var(--art-group-border)'
          : chrome.border.show
            ? `1px solid ${chrome.border.color ?? 'var(--art-border)'}`
            : '1px solid var(--art-border)',
      }

  return (
    <div
      className={`visual-box${selected ? ' selected' : ''}${isGroup ? ' group' : ''}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(visual.id)
      }}
      title={`${visual.visualType} — ${Math.round(position.width)}×${Math.round(position.height)} @ (${Math.round(position.x)}, ${Math.round(position.y)})`}
    >
      {isGroup && <span className="group-label">{visual.name}</span>}
      {showTitle && chrome.title && (
        <div
          className="visual-title"
          style={{
            height: TITLE_H,
            color: chrome.title.color,
            background: chrome.title.background,
            textAlign: chrome.title.align,
            fontSize: chrome.title.fontSize ? Math.min(chrome.title.fontSize, 15) : undefined,
          }}
        >
          <span className={chrome.title.dynamic ? 'dynamic-title' : ''}>
            {chrome.title.dynamic ? `⟨${chrome.title.text}⟩` : chrome.title.text}
          </span>
        </div>
      )}
      {!isGroup && !shape && (
        <div className="visual-content" style={{ height: contentH }}>
          <PlaceholderVisual visual={visual} theme={theme} width={position.width} height={contentH} />
        </div>
      )}
    </div>
  )
}
