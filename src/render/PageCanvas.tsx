// Renders one page at its native PBIR size, scaled to fit the viewport, with
// the page background applied and every visual positioned exactly. In Layout
// mode it renders visuals at their draft positions and mounts the interactive
// LayoutOverlay on top.

import { useMemo } from 'react'
import type { PageNode, Theme, VisualNode } from '../pbir/types.ts'
import type { Rect } from '../layout/geometry.ts'
import { readPageChrome } from './formatting.ts'
import { VisualBox } from './VisualBox.tsx'
import { LayoutOverlay, type LayoutItem } from './LayoutOverlay.tsx'

interface LayoutProps {
  draftRects: Record<string, Rect>
  selection: Set<string>
  grid: number | null
  showGrid: boolean
  onSelect: (next: Set<string>) => void
  onDraftChange: (patch: Record<string, Rect>) => void
  onCommit: () => void
}

interface Props {
  page: PageNode
  theme: Theme | null
  scale: number
  selectedVisualId: string | null
  onSelectVisual: (id: string | null) => void
  /** Present only in Layout mode. */
  layout?: LayoutProps
  /**
   * True View: a captured Desktop snapshot of this page. 'truth' shows the
   * real pixels instead of the mirror; 'ghost' underlays them at half opacity
   * so edits can be lined up against reality.
   */
  truth?: { dataUrl: string; mode: 'truth' | 'ghost' }
}

const toRect = (v: VisualNode): Rect => ({ x: v.position.x, y: v.position.y, w: v.position.width, h: v.position.height })

export function PageCanvas({ page, theme, scale, selectedVisualId, onSelectVisual, layout, truth }: Props) {
  const chrome = useMemo(() => readPageChrome(page, theme), [page, theme])
  const layoutMode = !!layout
  const rectOf = (v: VisualNode): Rect => layout?.draftRects[v.id] ?? toRect(v)

  return (
    <div
      className="page-canvas-scaler"
      style={{ width: page.width * scale, height: page.height * scale }}
      onClick={() => !layoutMode && onSelectVisual(null)}
    >
      <div
        className={`page-canvas${layoutMode ? ' layout-mode' : ''}${truth?.mode === 'truth' ? ' truth' : ''}${truth?.mode === 'ghost' ? ' ghost' : ''}`}
        style={{
          width: page.width,
          height: page.height,
          transform: `scale(${scale})`,
          background: chrome.background ?? 'var(--art-page-bg)',
        }}
      >
        {/* Rendered FIRST so equal z-index visuals still paint above a ghost. */}
        {truth && <img className={`truth-img ${truth.mode}`} src={truth.dataUrl} alt="" draggable={false} />}
        {page.visuals.map((v) => (
          <VisualBox
            key={v.id}
            visual={v}
            theme={theme}
            selected={!layoutMode && v.id === selectedVisualId}
            onSelect={onSelectVisual}
            rect={layoutMode ? rectOf(v) : undefined}
            inert={layoutMode}
          />
        ))}
      </div>

      {layout && (
        <LayoutOverlay
          width={page.width}
          height={page.height}
          scale={scale}
          items={page.visuals
            .filter((v) => v.visualType !== 'visualGroup')
            .map<LayoutItem>((v) => ({ id: v.id, rect: rectOf(v), isGroup: false }))}
          selection={layout.selection}
          grid={layout.grid}
          showGrid={layout.showGrid}
          onSelect={layout.onSelect}
          onDraftChange={layout.onDraftChange}
          onCommit={layout.onCommit}
        />
      )}
    </div>
  )
}
