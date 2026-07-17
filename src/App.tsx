import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReportModel } from './pbir/types.ts'
import { loadReport } from './pbir/report.ts'
import { createMemoryProvider } from './pbir/memoryProvider.ts'
import { buildSampleFiles, SAMPLE_REPORT_NAME } from './sample/sampleReport.ts'
import { isFileSystemAccessSupported, openProjectFolder } from './pbir/fs.ts'
import { PageCanvas } from './render/PageCanvas.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { Inspector } from './ui/Inspector.tsx'
import { Topbar } from './ui/Topbar.tsx'

const CANVAS_MARGIN = 32

export default function App() {
  const [report, setReport] = useState<ReportModel | null>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const activePage = report?.pages.find((p) => p.id === activePageId) ?? report?.pages[0] ?? null

  const adoptReport = useCallback((model: ReportModel) => {
    setReport(model)
    setActivePageId(model.pagesMeta.activePageName ?? model.pages[0]?.id ?? null)
    setSelectedVisualId(null)
    setError(null)
  }, [])

  const loadSample = useCallback(async () => {
    setBusy(true)
    try {
      const model = await loadReport(createMemoryProvider(buildSampleFiles()), SAMPLE_REPORT_NAME)
      adoptReport(model)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [adoptReport])

  const openFolder = useCallback(async () => {
    setBusy(true)
    try {
      const { provider, name } = await openProjectFolder()
      const model = await loadReport(provider, name)
      adoptReport(model)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [adoptReport])

  // Fit-to-viewport scaling for the active page.
  useLayoutEffect(() => {
    if (!activePage || !stageRef.current) return
    const measure = () => {
      const el = stageRef.current
      if (!el) return
      const availW = el.clientWidth - CANVAS_MARGIN * 2
      const availH = el.clientHeight - CANVAS_MARGIN * 2
      const s = Math.min(availW / activePage.width, availH / activePage.height, 1.5)
      setScale(Math.max(0.1, s))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [activePage])

  // Load the sample on first mount so the app is never a blank screen.
  useEffect(() => {
    void loadSample()
  }, [loadSample])

  const selectedVisual = activePage?.visuals.find((v) => v.id === selectedVisualId) ?? null

  return (
    <div className="app">
      <Topbar
        report={report}
        busy={busy}
        canOpen={isFileSystemAccessSupported()}
        onOpenFolder={openFolder}
        onLoadSample={loadSample}
      />

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="workspace">
        <Sidebar
          report={report}
          activePageId={activePage?.id ?? null}
          onSelectPage={(id) => {
            setActivePageId(id)
            setSelectedVisualId(null)
          }}
        />

        <main className="stage" ref={stageRef}>
          {activePage ? (
            <PageCanvas
              page={activePage}
              theme={report?.theme ?? null}
              scale={scale}
              selectedVisualId={selectedVisualId}
              onSelectVisual={setSelectedVisualId}
            />
          ) : (
            <div className="empty-state">
              <p>Open a Power BI project folder to mirror its report.</p>
            </div>
          )}
        </main>

        <Inspector report={report} page={activePage} visual={selectedVisual} scale={scale} />
      </div>
    </div>
  )
}
