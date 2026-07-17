import type { ReportModel } from '../pbir/types.ts'

interface Props {
  report: ReportModel | null
  busy: boolean
  canOpen: boolean
  onOpenFolder: () => void
  onLoadSample: () => void
}

export function Topbar({ report, busy, canOpen, onOpenFolder, onLoadSample }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>◑</span>
        <div>
          <div className="brand-name">BI Visual Design</div>
          <div className="brand-sub">
            {report ? report.reportName : 'File-based design mirror for Power BI'}
          </div>
        </div>
      </div>

      <div className="topbar-meta">
        {report && (
          <span className="pill">
            {report.pages.length} pages · {report.pages.reduce((n, p) => n + p.visuals.length, 0)} visuals
          </span>
        )}
        <span className="privacy" title="This tool reads only field names and geometry — never your data.">
          🔒 Cannot see your data
        </span>
      </div>

      <div className="topbar-actions">
        <button className="btn ghost" onClick={onLoadSample} disabled={busy}>
          Sample report
        </button>
        <button
          className="btn primary"
          onClick={onOpenFolder}
          disabled={busy || !canOpen}
          title={canOpen ? 'Pick your Power BI project folder' : 'Use Chrome or Edge to open a folder'}
        >
          {busy ? 'Working…' : 'Open project folder'}
        </button>
      </div>
    </header>
  )
}
