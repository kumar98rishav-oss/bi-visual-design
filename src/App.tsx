import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReportModel, Theme } from './pbir/types.ts'
import { loadReport } from './pbir/report.ts'
import { createMemoryProvider } from './pbir/memoryProvider.ts'
import { buildSampleFiles, SAMPLE_REPORT_NAME } from './sample/sampleReport.ts'
import { isFileSystemAccessSupported, openProjectFolder } from './pbir/fs.ts'
import { deployTheme } from './theme/deploy.ts'
import { PageCanvas } from './render/PageCanvas.tsx'
import { Landing } from './ui/Landing.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { Inspector } from './ui/Inspector.tsx'
import { ThemeLab } from './ui/ThemeLab.tsx'
import { Topbar } from './ui/Topbar.tsx'

const CANVAS_MARGIN = 32
type View = 'mirror' | 'theme'
type AppTheme = 'light' | 'dark'

function cloneTheme(t: Theme): Theme {
  return { ...t, dataColors: [...t.dataColors] }
}
function themeFingerprint(t: Theme | null): string {
  if (!t) return ''
  return JSON.stringify([t.dataColors, t.background, t.foreground, t.tableAccent])
}

export default function App() {
  const [report, setReport] = useState<ReportModel | null>(null)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [atHome, setAtHome] = useState(true)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [appTheme, setAppTheme] = useState<AppTheme>('dark')
  const [view, setView] = useState<View>('mirror')
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null)
  const [compare, setCompare] = useState(false)
  const [deploying, setDeploying] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // Apply the app theme to the document root so tokens switch.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme)
  }, [appTheme])

  const activePage = report?.pages.find((p) => p.id === activePageId) ?? report?.pages[0] ?? null
  const effectiveTheme = themeDraft ?? report?.theme ?? null
  const originalTheme = report?.theme ?? null

  const dirty = useMemo(
    () => !!themeDraft && themeFingerprint(themeDraft) !== themeFingerprint(originalTheme),
    [themeDraft, originalTheme],
  )

  const adoptReport = useCallback((model: ReportModel, dirHandle: FileSystemDirectoryHandle | null) => {
    setReport(model)
    setHandle(dirHandle)
    setAtHome(false)
    setView('mirror')
    setActivePageId(model.pagesMeta.activePageName ?? model.pages[0]?.id ?? null)
    setSelectedVisualId(null)
    setThemeDraft(model.theme ? cloneTheme(model.theme) : null)
    setCompare(false)
    setError(null)
    setNotice(null)
  }, [])

  const loadSample = useCallback(async () => {
    setBusy(true)
    try {
      const model = await loadReport(createMemoryProvider(buildSampleFiles()), SAMPLE_REPORT_NAME)
      adoptReport(model, null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [adoptReport])

  const openFolder = useCallback(async () => {
    setBusy(true)
    try {
      const opened = await openProjectFolder()
      const model = await loadReport(opened.provider, opened.name)
      adoptReport(model, opened.handle)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [adoptReport])

  const onDeploy = useCallback(async () => {
    if (!handle || !themeDraft) return
    setDeploying(true)
    setError(null)
    setNotice(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const out = await deployTheme(handle, themeDraft, stamp)
      setReport((r) => (r ? { ...r, theme: cloneTheme(themeDraft) } : r))
      setNotice(`Deployed theme to ${out.path}. Backup at ${out.backedUpTo}. Close and reopen the report in Power BI Desktop to see it.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeploying(false)
    }
  }, [handle, themeDraft])

  const resetTheme = useCallback(() => {
    if (originalTheme) setThemeDraft(cloneTheme(originalTheme))
  }, [originalTheme])

  useLayoutEffect(() => {
    if (atHome || !activePage || !stageRef.current) return
    const measure = () => {
      const el = stageRef.current
      if (!el) return
      const cols = compare && view === 'theme' ? 2 : 1
      const availW = (el.clientWidth - CANVAS_MARGIN * 2 - (cols - 1) * 24) / cols
      const availH = el.clientHeight - CANVAS_MARGIN * 2 - 28
      const s = Math.min(availW / activePage.width, availH / activePage.height, 1.5)
      setScale(Math.max(0.1, s))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [activePage, compare, view, atHome])

  // Landing until a report is opened (or the user returns Home).
  if (atHome || !report) {
    return (
      <Landing
        canOpen={isFileSystemAccessSupported()}
        busy={busy}
        onOpenFolder={openFolder}
        onLoadSample={loadSample}
      />
    )
  }

  const selectedVisual = activePage?.visuals.find((v) => v.id === selectedVisualId) ?? null
  const showCompare = compare && view === 'theme' && activePage

  return (
    <div className="app">
      <Topbar
        report={report}
        view={view}
        theme={appTheme}
        onViewChange={setView}
        onToggleTheme={() => setAppTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onHome={() => setAtHome(true)}
        onOpenFolder={openFolder}
        busy={busy}
        canOpen={isFileSystemAccessSupported()}
      />

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="banner ok" role="status">
          {notice}
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <div className="workspace">
        <Sidebar
          report={report}
          theme={effectiveTheme}
          activePageId={activePage?.id ?? null}
          onSelectPage={(id) => {
            setActivePageId(id)
            setSelectedVisualId(null)
          }}
        />

        <main className="stage-wrap">
          <div className="stage-toolbar">
            <span className="stage-page">{activePage ? activePage.displayName : '—'}</span>
            <span className="stage-dim">
              {activePage ? `${activePage.width}×${activePage.height}` : ''}
            </span>
            <span className="stage-zoom">{Math.round(scale * 100)}%</span>
            {view === 'theme' && (
              <label className="stage-compare">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
                A/B compare
              </label>
            )}
          </div>
          <div className="stage" ref={stageRef}>
            {activePage ? (
              showCompare ? (
                <div className="compare">
                  <div className="compare-col">
                    <div className="compare-label">Original</div>
                    <PageCanvas page={activePage} theme={originalTheme} scale={scale} selectedVisualId={null} onSelectVisual={() => {}} />
                  </div>
                  <div className="compare-col">
                    <div className="compare-label">Edited</div>
                    <PageCanvas page={activePage} theme={effectiveTheme} scale={scale} selectedVisualId={null} onSelectVisual={() => {}} />
                  </div>
                </div>
              ) : (
                <PageCanvas
                  page={activePage}
                  theme={effectiveTheme}
                  scale={scale}
                  selectedVisualId={selectedVisualId}
                  onSelectVisual={setSelectedVisualId}
                />
              )
            ) : (
              <div className="empty-state">
                <p>This report has no pages.</p>
              </div>
            )}
          </div>
        </main>

        {view === 'theme' && effectiveTheme ? (
          <ThemeLab
            theme={effectiveTheme}
            dirty={dirty}
            canDeploy={!!handle}
            deploying={deploying}
            onChange={setThemeDraft}
            onReset={resetTheme}
            onDeploy={onDeploy}
          />
        ) : (
          <Inspector report={report} page={activePage} visual={selectedVisual} scale={scale} />
        )}
      </div>
    </div>
  )
}
