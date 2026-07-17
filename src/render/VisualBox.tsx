// A single visual rendered at its exact PBIR position, with its title bar,
// background and border chrome applied, and placeholder content inside.

import { useMemo } from 'react'
import type { Theme, VisualNode } from '../pbir/types.ts'
import { readVisualChrome } from './formatting.ts'
import { PlaceholderVisual } from './PlaceholderVisual.tsx'

interface Props {
  visual: VisualNode
  theme: Theme | null
  selected: boolean
  onSelect: (id: string) => void
}

const TITLE_H = 24

export function VisualBox({ visual, theme, selected, onSelect }: Props) {
  const chrome = useMemo(() => readVisualChrome(visual, theme), [visual, theme])
  const { position } = visual

  const isGroup = visual.visualType === 'visualGroup'
  const showTitle = !!chrome.title && chrome.title.show && chrome.title.text !== ''
  const contentH = position.height - (showTitle ? TITLE_H : 0)

  const style: React.CSSProperties = {
    left: position.x,
    top: position.y,
    width: position.width,
    height: position.height,
    zIndex: position.z,
    borderRadius: chrome.border.radius || (isGroup ? 0 : 4),
    background: isGroup ? 'transparent' : chrome.background ?? 'var(--surface)',
    border: isGroup
      ? '1.5px dashed var(--group-border)'
      : chrome.border.show
        ? `1px solid ${chrome.border.color ?? 'var(--visual-border)'}`
        : '1px solid var(--visual-border)',
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
      {!isGroup && (
        <div className="visual-content" style={{ height: contentH }}>
          <PlaceholderVisual visual={visual} theme={theme} width={position.width} height={contentH} />
        </div>
      )}
    </div>
  )
}
