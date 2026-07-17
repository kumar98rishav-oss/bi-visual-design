import type { PageNode, ReportModel, VisualNode } from '../pbir/types.ts'

interface Props {
  report: ReportModel | null
  page: PageNode | null
  visual: VisualNode | null
  scale: number
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function Inspector({ report, page, visual, scale }: Props) {
  return (
    <aside className="inspector">
      {visual ? (
        <>
          <div className="insp-head">{visual.visualType}</div>
          <dl className="insp-grid">
            <dt>X</dt>
            <dd>{round(visual.position.x)}</dd>
            <dt>Y</dt>
            <dd>{round(visual.position.y)}</dd>
            <dt>Width</dt>
            <dd>{round(visual.position.width)}</dd>
            <dt>Height</dt>
            <dd>{round(visual.position.height)}</dd>
            <dt>Z</dt>
            <dd>{visual.position.z}</dd>
          </dl>
          {visual.projections.length > 0 && (
            <div className="insp-section">
              <div className="insp-subhead">Fields</div>
              <ul className="field-list">
                {visual.projections.map((p, i) => (
                  <li key={i}>
                    <span className="field-role">{p.role}</span>
                    <span className="field-name">
                      {p.entity}.{p.property}
                    </span>
                    <span className={`field-kind ${p.kind.toLowerCase()}`}>{p.kind[0]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="insp-id">{visual.id}</div>
        </>
      ) : page ? (
        <>
          <div className="insp-head">{page.displayName}</div>
          <dl className="insp-grid">
            <dt>Canvas</dt>
            <dd>
              {page.width}×{page.height}
            </dd>
            <dt>Visuals</dt>
            <dd>{page.visuals.length}</dd>
            <dt>Fit</dt>
            <dd>{page.displayOption}</dd>
            <dt>Zoom</dt>
            <dd>{Math.round(scale * 100)}%</dd>
          </dl>
          <p className="insp-hint">Select a visual to inspect its geometry and fields.</p>
        </>
      ) : (
        <p className="insp-hint">{report ? 'No page selected.' : 'No report loaded.'}</p>
      )}
    </aside>
  )
}
