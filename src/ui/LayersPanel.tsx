import { ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Square, BarChart3, Type, Boxes } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Layer, LayerKind } from '../designer/layers.ts'

interface Props {
  /** Back-to-front order; the list renders reversed so front sits on top. */
  layers: Layer[]
  selected: string | null
  onSelect: (id: string) => void
  onBringForward: (id: string) => void
  onSendBackward: (id: string) => void
  onBringToFront: (id: string) => void
  onSendToBack: (id: string) => void
}

const KIND_ICON: Record<LayerKind, ReactNode> = {
  panel: <Square size={13} />,
  data: <BarChart3 size={13} />,
  decor: <Type size={13} />,
  group: <Boxes size={13} />,
}

export function LayersPanel({
  layers, selected, onSelect, onBringForward, onSendBackward, onBringToFront, onSendToBack,
}: Props) {
  const frontFirst = [...layers].reverse()

  return (
    <div className="layers">
      <div className="layers-actions">
        <button className="ll-tool" disabled={!selected} title="Bring to front" onClick={() => selected && onBringToFront(selected)}><ChevronsUp size={15} /></button>
        <button className="ll-tool" disabled={!selected} title="Bring forward" onClick={() => selected && onBringForward(selected)}><ChevronUp size={15} /></button>
        <button className="ll-tool" disabled={!selected} title="Send backward" onClick={() => selected && onSendBackward(selected)}><ChevronDown size={15} /></button>
        <button className="ll-tool" disabled={!selected} title="Send to back" onClick={() => selected && onSendToBack(selected)}><ChevronsDown size={15} /></button>
      </div>

      <ul className="layer-list">
        {frontFirst.map((l, i) => (
          <li key={l.id}>
            <button
              className={`layer-row${l.id === selected ? ' active' : ''}`}
              onClick={() => onSelect(l.id)}
              title={`${l.label} — z ${l.z}`}
            >
              <span className={`layer-icon ${l.kind}`}>{KIND_ICON[l.kind]}</span>
              <span className="layer-label">{l.label}</span>
              <span className="layer-z">{frontFirst.length - i}</span>
            </button>
          </li>
        ))}
        {layers.length === 0 && <li className="muted">Nothing on this page</li>}
      </ul>
      <p className="tl-note">Top of the list is the front-most layer.</p>
    </div>
  )
}
