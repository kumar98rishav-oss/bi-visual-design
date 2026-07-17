import { Palette, ChevronRight, Home, Sun, Moon, FolderOpen, Eye, SlidersHorizontal } from 'lucide-react'
import type { ReportModel } from '../pbir/types.ts'

interface Props {
  report: ReportModel | null
  view: 'mirror' | 'theme'
  theme: 'light' | 'dark'
  busy: boolean
  canOpen: boolean
  onViewChange: (v: 'mirror' | 'theme') => void
  onToggleTheme: () => void
  onHome: () => void
  onOpenFolder: () => void
}

export function Topbar({ report, view, theme, busy, canOpen, onViewChange, onToggleTheme, onHome, onOpenFolder }: Props) {
  const visuals = report ? report.pages.reduce((n, p) => n + p.visuals.length, 0) : 0

  return (
    <header className="topbar">
      <button className="topbar__brand" onClick={onHome} title="Home">
        <span className="topbar__logo">
          <Palette size={15} />
        </span>
        BI Visual Design
      </button>

      <span className="topbar__divider" />

      <div className="topbar__project">
        <span className="topbar__crumb">Report</span>
        <ChevronRight size={14} className="topbar__crumb" />
        <span>{report?.reportName ?? 'Untitled'}</span>
      </div>

      <span className="topbar__spacer" />

      {report && (
        <span className="topbar__meta">
          {report.pages.length} pages · {visuals} visuals
        </span>
      )}
      <span className="topbar__privacy" title="Reads only field names and geometry — never your data.">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Cannot see your data
      </span>

      <div className="segmented" role="tablist" aria-label="View">
        <button
          className={`segmented__btn${view === 'mirror' ? ' active' : ''}`}
          onClick={() => onViewChange('mirror')}
          role="tab"
          aria-selected={view === 'mirror'}
        >
          <Eye size={14} /> Mirror
        </button>
        <button
          className={`segmented__btn${view === 'theme' ? ' active' : ''}`}
          onClick={() => onViewChange('theme')}
          role="tab"
          aria-selected={view === 'theme'}
        >
          <SlidersHorizontal size={14} /> Theme Lab
        </button>
      </div>

      <span className="topbar__divider" />

      <button className="iconbtn" onClick={onOpenFolder} disabled={busy || !canOpen} title="Open a project folder" aria-label="Open project folder">
        <FolderOpen size={17} />
      </button>
      <button className="iconbtn" onClick={onToggleTheme} title={theme === 'light' ? 'Dark theme' : 'Light theme'} aria-label="Toggle theme">
        {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <button className="iconbtn" onClick={onHome} title="Home" aria-label="Home">
        <Home size={17} />
      </button>
    </header>
  )
}
