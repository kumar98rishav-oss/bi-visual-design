// Renders one page at its native PBIR size, scaled to fit the viewport, with
// the page background applied and every visual positioned exactly.

import { useMemo } from 'react'
import type { PageNode, Theme } from '../pbir/types.ts'
import { readPageChrome } from './formatting.ts'
import { VisualBox } from './VisualBox.tsx'

interface Props {
  page: PageNode
  theme: Theme | null
  scale: number
  selectedVisualId: string | null
  onSelectVisual: (id: string | null) => void
}

export function PageCanvas({ page, theme, scale, selectedVisualId, onSelectVisual }: Props) {
  const chrome = useMemo(() => readPageChrome(page, theme), [page, theme])

  return (
    <div
      className="page-canvas-scaler"
      style={{ width: page.width * scale, height: page.height * scale }}
      onClick={() => onSelectVisual(null)}
    >
      <div
        className="page-canvas"
        style={{
          width: page.width,
          height: page.height,
          transform: `scale(${scale})`,
          background: chrome.background ?? 'var(--art-page-bg)',
        }}
      >
        {page.visuals.map((v) => (
          <VisualBox
            key={v.id}
            visual={v}
            theme={theme}
            selected={v.id === selectedVisualId}
            onSelect={onSelectVisual}
          />
        ))}
      </div>
    </div>
  )
}
