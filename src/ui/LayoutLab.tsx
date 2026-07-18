import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
  Undo2, Redo2, SquarePlus,
} from 'lucide-react'
import type { AlignEdge, DistAxis, MatchDim, Rect } from '../layout/geometry.ts'
import type { Layer } from '../designer/layers.ts'
import { LayersPanel } from './LayersPanel.tsx'

interface Props {
  selectionCount: number
  single: { id: string; rect: Rect } | null
  grid: boolean
  showGrid: boolean
  dirty: boolean
  changedCount: number
  canDeploy: boolean
  deploying: boolean
  canUndo: boolean
  canRedo: boolean
  onSetRect: (id: string, patch: Partial<Rect>) => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistAxis) => void
  onMatch: (dim: MatchDim) => void
  onToggleGrid: () => void
  onToggleShowGrid: () => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onDeploy: () => void
  // --- Layers (M5.1) ---
  layers: Layer[]
  selectedLayer: string | null
  onSelectLayer: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onBringToFront: (id: string) => void
  onSendToBack: (id: string) => void
  onAddPanel: () => void
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="ll-num">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
      />
    </label>
  )
}

export function LayoutLab(props: Props) {
  const {
    selectionCount, single, grid, showGrid, dirty, changedCount, canDeploy, deploying,
    canUndo, canRedo, onSetRect, onAlign, onDistribute, onMatch, onToggleGrid, onToggleShowGrid,
    onUndo, onRedo, onReset, onDeploy,
    layers, selectedLayer, onSelectLayer, onBringForward, onSendBackward, onBringToFront, onSendToBack, onAddPanel,
  } = props

  const multi = selectionCount >= 2
  const multi3 = selectionCount >= 3

  return (
    <aside className="themelab">
      <div className="tl-head">
        <div>
          <div className="tl-title">Layout Lab</div>
          <div className="tl-sub">
            {selectionCount === 0 ? 'Nothing selected' : `${selectionCount} selected`}
          </div>
        </div>
        {dirty && <span className="tl-dirty" title="Unsaved layout edits">● {changedCount} pending</span>}
      </div>

      <section className="tl-section">
        <div className="tl-section-head">Position</div>
        {single ? (
          <div className="ll-nums">
            <Num label="X" value={single.rect.x} onChange={(x) => onSetRect(single.id, { x })} />
            <Num label="Y" value={single.rect.y} onChange={(y) => onSetRect(single.id, { y })} />
            <Num label="W" value={single.rect.w} onChange={(w) => onSetRect(single.id, { w })} />
            <Num label="H" value={single.rect.h} onChange={(h) => onSetRect(single.id, { h })} />
          </div>
        ) : (
          <p className="tl-note">
            {selectionCount === 0
              ? 'Click a visual to select it. Shift-click to add more. Drag to move, or use the arrow keys to nudge (Shift = ×10).'
              : 'Multiple selected — align, distribute or match their sizes below.'}
          </p>
        )}
      </section>

      <section className="tl-section">
        <div className="tl-section-head">Align {!multi && <span className="ll-hint">2+</span>}</div>
        <div className="ll-btn-row">
          <button className="ll-tool" disabled={!multi} title="Align left" onClick={() => onAlign('left')}><AlignStartVertical size={16} /></button>
          <button className="ll-tool" disabled={!multi} title="Align horizontal centres" onClick={() => onAlign('hcenter')}><AlignCenterVertical size={16} /></button>
          <button className="ll-tool" disabled={!multi} title="Align right" onClick={() => onAlign('right')}><AlignEndVertical size={16} /></button>
          <span className="ll-sep" />
          <button className="ll-tool" disabled={!multi} title="Align top" onClick={() => onAlign('top')}><AlignStartHorizontal size={16} /></button>
          <button className="ll-tool" disabled={!multi} title="Align vertical centres" onClick={() => onAlign('vcenter')}><AlignCenterHorizontal size={16} /></button>
          <button className="ll-tool" disabled={!multi} title="Align bottom" onClick={() => onAlign('bottom')}><AlignEndHorizontal size={16} /></button>
        </div>
      </section>

      <section className="tl-section">
        <div className="tl-section-head">Distribute {!multi3 && <span className="ll-hint">3+</span>}</div>
        <div className="ll-btn-row">
          <button className="ll-tool wide" disabled={!multi3} onClick={() => onDistribute('h')}><AlignHorizontalSpaceAround size={16} /> Horizontal</button>
          <button className="ll-tool wide" disabled={!multi3} onClick={() => onDistribute('v')}><AlignVerticalSpaceAround size={16} /> Vertical</button>
        </div>
      </section>

      <section className="tl-section">
        <div className="tl-section-head">Match size {!multi && <span className="ll-hint">2+ · to last selected</span>}</div>
        <div className="ll-btn-row">
          <button className="btn small" disabled={!multi} onClick={() => onMatch('width')}>Width</button>
          <button className="btn small" disabled={!multi} onClick={() => onMatch('height')}>Height</button>
          <button className="btn small" disabled={!multi} onClick={() => onMatch('both')}>Both</button>
        </div>
      </section>

      <section className="tl-section">
        <div className="tl-section-head">
          Layers <span className="tl-count">{layers.length}</span>
          <button className="doc-groupfix" onClick={onAddPanel} title="Add a rounded panel behind everything">
            <SquarePlus size={12} /> Add panel
          </button>
        </div>
        <LayersPanel
          layers={layers}
          selected={selectedLayer}
          onSelect={onSelectLayer}
          onBringForward={onBringForward}
          onSendBackward={onSendBackward}
          onBringToFront={onBringToFront}
          onSendToBack={onSendToBack}
        />
      </section>

      <section className="tl-section">
        <div className="tl-section-head">Options</div>
        <label className="ll-check"><input type="checkbox" checked={grid} onChange={onToggleGrid} /> Snap to grid &amp; guides</label>
        <label className="ll-check"><input type="checkbox" checked={showGrid} onChange={onToggleShowGrid} /> Show grid overlay</label>
      </section>

      <div className="ll-history">
        <button className="btn small" disabled={!canUndo} onClick={onUndo}><Undo2 size={14} /> Undo</button>
        <button className="btn small" disabled={!canRedo} onClick={onRedo}><Redo2 size={14} /> Redo</button>
      </div>

      <div className="tl-actions">
        <button className="btn" onClick={onReset} disabled={!dirty}>Reset</button>
        <button
          className="btn primary"
          onClick={onDeploy}
          disabled={!dirty || !canDeploy || deploying}
          title={canDeploy ? 'Write positions back to the report' : 'Open a project folder to deploy'}
        >
          {deploying ? 'Deploying…' : `Deploy ${changedCount || ''}`.trim()}
        </button>
      </div>
      {!canDeploy && <p className="tl-note">Deploy is available once you open a project folder (not the sample).</p>}
    </aside>
  )
}
