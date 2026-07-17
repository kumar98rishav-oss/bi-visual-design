import type { ReportModel, Theme } from '../pbir/types.ts'

interface Props {
  report: ReportModel | null
  /** Effective theme (may be a live Theme Lab draft) for the swatch strip. */
  theme: Theme | null
  activePageId: string | null
  onSelectPage: (id: string) => void
}

export function Sidebar({ report, theme, activePageId, onSelectPage }: Props) {
  return (
    <nav className="sidebar">
      <div className="sidebar-head">Pages</div>
      <ul className="page-list">
        {report?.pages.map((p, i) => (
          <li key={p.id}>
            <button
              className={`page-item${p.id === activePageId ? ' active' : ''}`}
              onClick={() => onSelectPage(p.id)}
            >
              <span className="page-index">{i + 1}</span>
              <span className="page-name">{p.displayName}</span>
              <span className="page-count">{p.visuals.length}</span>
            </button>
          </li>
        ))}
        {!report && <li className="muted">No report loaded</li>}
      </ul>

      {theme && (
        <div className="theme-strip">
          <div className="sidebar-head">Theme · {theme.name}</div>
          <div className="swatches">
            {theme.dataColors.slice(0, 16).map((c, i) => (
              <span key={i} className="swatch" style={{ background: c }} title={c} />
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
