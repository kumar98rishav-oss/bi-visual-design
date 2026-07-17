import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PageNode, ReportModel, Theme, VisualNode } from './pbir/types.ts'
import { loadReport } from './pbir/report.ts'
import { createMemoryProvider } from './pbir/memoryProvider.ts'
import { buildSampleFiles, SAMPLE_REPORT_NAME } from './sample/sampleReport.ts'
import { isFileSystemAccessSupported, openProjectFolder } from './pbir/fs.ts'
import { deployTheme } from './theme/deploy.ts'
import { deployLayout, type LayoutEdit } from './layout/deploy.ts'
import { alignRects, distributeRects, matchSize, type AlignEdge, type DistAxis, type MatchDim, type Rect } from './layout/geometry.ts'
import { analyzeReport, type DoctorRule, type Finding } from './doctor/analyze.ts'
import { applyDoctorEdits, type DoctorEdits } from './doctor/apply.ts'
import { deployDoctor } from './doctor/deploy.ts'
import { PageCanvas } from './render/PageCanvas.tsx'
import { Landing } from './ui/Landing.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { Inspector } from './ui/Inspector.tsx'
import { ThemeLab } from './ui/ThemeLab.tsx'
import { LayoutLab } from './ui/LayoutLab.tsx'
import { DesignDoctor } from './ui/DesignDoctor.tsx'
import { Topbar } from './ui/Topbar.tsx'

const CANVAS_MARGIN = 32
const GRID = 8
type View = 'mirror' | 'theme' | 'layout' | 'doctor'
type AppTheme = 'light' | 'dark'
type DraftMap = Record<string, Rect>
interface Hist { stack: DraftMap[]; at: number }

const toRect = (v: VisualNode): Rect => ({ x: v.position.x, y: v.position.y, w: v.position.width, h: v.position.height })
const rectEq = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

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

  // Theme Lab
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null)
  const [compare, setCompare] = useState(false)
  const [deploying, setDeploying] = useState(false)

  // Layout Lab
  const [layoutDraft, setLayoutDraft] = useState<DraftMap>({})
  const [selection, setSelectionState] = useState<Set<string>>(new Set())
  const [hist, setHist] = useState<Hist>({ stack: [{}], at: 0 })
  const [gridSnap, setGridSnap] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [deployingLayout, setDeployingLayout] = useState(false)

  // Design Doctor
  const [doctorEdits, setDoctorEdits] = useState<DoctorEdits>({})
  const [deployingDoctor, setDeployingDoctor] = useState(false)

  const layoutDraftRef = useRef<DraftMap>({})
  const selectionRef = useRef<Set<string>>(selection)
  const histRef = useRef<Hist>(hist)
  const reportRef = useRef<ReportModel | null>(null)
  const activePageIdRef = useRef<string | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme)
  }, [appTheme])

  // Doctor fixes are applied to the model so the mirror previews them live, and
  // they become the baseline that Layout Lab and the analyzer read from.
  const effectiveReport = useMemo(
    () => (report ? applyDoctorEdits(report, doctorEdits) : null),
    [report, doctorEdits],
  )
  const activePage = effectiveReport?.pages.find((p) => p.id === activePageId) ?? effectiveReport?.pages[0] ?? null
  const effectiveTheme = themeDraft ?? report?.theme ?? null
  const originalTheme = report?.theme ?? null

  const findings = useMemo<Finding[]>(
    () => (view === 'doctor' && effectiveReport ? analyzeReport(effectiveReport) : []),
    [view, effectiveReport],
  )
  const doctorEditedCount = Object.keys(doctorEdits).length

  useEffect(() => { reportRef.current = report }, [report])
  useEffect(() => { activePageIdRef.current = activePage?.id ?? null }, [activePage])
  useEffect(() => { histRef.current = hist }, [hist])

  const themeDirty = useMemo(
    () => !!themeDraft && themeFingerprint(themeDraft) !== themeFingerprint(originalTheme),
    [themeDraft, originalTheme],
  )

  const visualsById = useMemo(() => {
    const m = new Map<string, VisualNode>()
    effectiveReport?.pages.forEach((p) => p.visuals.forEach((v) => m.set(v.id, v)))
    return m
  }, [effectiveReport])

  const rectOf = useCallback((id: string): Rect | undefined => {
    const v = visualsById.get(id)
    return v ? layoutDraft[id] ?? toRect(v) : undefined
  }, [visualsById, layoutDraft])

  // Which visuals actually moved (draft differs from original).
  const changedEdits = useMemo<LayoutEdit[]>(() => {
    const out: LayoutEdit[] = []
    for (const [id, rect] of Object.entries(layoutDraft)) {
      const v = visualsById.get(id)
      if (v && !rectEq(rect, toRect(v))) out.push({ visual: v, rect })
    }
    return out
  }, [layoutDraft, visualsById])
  const layoutDirty = changedEdits.length > 0

  // --- Selection & draft helpers (keep refs in sync for keyboard handlers) ---
  const setSelection = useCallback((next: Set<string>) => {
    selectionRef.current = next
    setSelectionState(next)
  }, [])

  const setDraft = useCallback((next: DraftMap) => {
    layoutDraftRef.current = next
    setLayoutDraft(next)
  }, [])

  const pushHistory = useCallback((draft: DraftMap) => {
    setHist((h) => {
      const stack = h.stack.slice(0, h.at + 1)
      stack.push(draft)
      const next = { stack, at: stack.length - 1 }
      histRef.current = next
      return next
    })
  }, [])

  const commitDraft = useCallback((next: DraftMap) => {
    setDraft(next)
    pushHistory(next)
  }, [setDraft, pushHistory])

  // Live drag updates (no history entry until commit).
  const onDraftChange = useCallback((patch: DraftMap) => {
    setLayoutDraft((prev) => {
      const n = { ...prev, ...patch }
      layoutDraftRef.current = n
      return n
    })
  }, [])
  const onLayoutCommit = useCallback(() => pushHistory(layoutDraftRef.current), [pushHistory])

  const adoptReport = useCallback((model: ReportModel, dirHandle: FileSystemDirectoryHandle | null) => {
    setReport(model)
    setHandle(dirHandle)
    setAtHome(false)
    setView('mirror')
    setActivePageId(model.pagesMeta.activePageName ?? model.pages[0]?.id ?? null)
    setSelectedVisualId(null)
    setThemeDraft(model.theme ? cloneTheme(model.theme) : null)
    setCompare(false)
    setDraft({})
    setSelection(new Set())
    setHist({ stack: [{}], at: 0 })
    histRef.current = { stack: [{}], at: 0 }
    setDoctorEdits({})
    setError(null)
    setNotice(null)
  }, [setDraft, setSelection])

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

  // --- Theme deploy ---
  const onDeployTheme = useCallback(async () => {
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

  // --- Layout operations ---
  const applyToSelection = useCallback(
    (fn: (rects: Rect[], ids: string[]) => Rect[]) => {
      const ids = [...selectionRef.current]
      const rects = ids.map((id) => rectOf(id)).filter((r): r is Rect => !!r)
      if (rects.length !== ids.length) return
      const result = fn(rects, ids)
      const next = { ...layoutDraftRef.current }
      ids.forEach((id, i) => (next[id] = result[i]))
      commitDraft(next)
    },
    [rectOf, commitDraft],
  )

  const onAlign = useCallback((edge: AlignEdge) => applyToSelection((r) => alignRects(r, edge)), [applyToSelection])
  const onDistribute = useCallback((axis: DistAxis) => applyToSelection((r) => distributeRects(r, axis)), [applyToSelection])
  const onMatch = useCallback((dim: MatchDim) => applyToSelection((r) => matchSize(r, r.length - 1, dim)), [applyToSelection])

  const onSetRect = useCallback((id: string, patch: Partial<Rect>) => {
    const cur = rectOf(id)
    if (!cur) return
    commitDraft({ ...layoutDraftRef.current, [id]: { ...cur, ...patch } })
  }, [rectOf, commitDraft])

  const onUndo = useCallback(() => {
    const h = histRef.current
    if (h.at <= 0) return
    const at = h.at - 1
    setDraft(h.stack[at])
    const next = { ...h, at }
    histRef.current = next
    setHist(next)
  }, [setDraft])
  const onRedo = useCallback(() => {
    const h = histRef.current
    if (h.at >= h.stack.length - 1) return
    const at = h.at + 1
    setDraft(h.stack[at])
    const next = { ...h, at }
    histRef.current = next
    setHist(next)
  }, [setDraft])

  const resetLayout = useCallback(() => {
    setDraft({})
    const h = { stack: [{}], at: 0 }
    histRef.current = h
    setHist(h)
  }, [setDraft])

  // Keyboard: nudge, undo/redo, deselect — active only in Layout view.
  useEffect(() => {
    if (view !== 'layout') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const meta = e.ctrlKey || e.metaKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? onRedo() : onUndo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        onRedo()
        return
      }
      if (e.key === 'Escape') {
        setSelection(new Set())
        return
      }
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      }
      const d = nudges[e.key]
      const ids = [...selectionRef.current]
      if (d && ids.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const next = { ...layoutDraftRef.current }
        for (const id of ids) {
          const cur = rectOf(id)
          if (cur) next[id] = { ...cur, x: cur.x + d[0] * step, y: cur.y + d[1] * step }
        }
        commitDraft(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, rectOf, commitDraft, onUndo, onRedo, setSelection])

  // --- Layout deploy ---
  const onDeployLayout = useCallback(async () => {
    if (!handle || !changedEdits.length) return
    setDeployingLayout(true)
    setError(null)
    setNotice(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const res = await deployLayout(handle, changedEdits, stamp)
      // Fold the deployed positions into the model as the new baseline.
      const editedById = new Map(changedEdits.map((e) => [e.visual.id, e.rect]))
      setReport((r) => {
        if (!r) return r
        const pages: PageNode[] = r.pages.map((p) => ({
          ...p,
          visuals: p.visuals.map((v) => {
            const rc = editedById.get(v.id)
            if (!rc) return v
            const position = { ...v.position, x: rc.x, y: rc.y, width: rc.w, height: rc.h }
            return { ...v, position, raw: { ...v.raw, position } }
          }),
        }))
        return { ...r, pages }
      })
      setDraft({})
      const h = { stack: [{}], at: 0 }
      histRef.current = h
      setHist(h)
      setNotice(`Deployed ${res.count} visual position${res.count === 1 ? '' : 's'}. Backup at ${res.backupDir}. Close and reopen the report in Power BI Desktop to see it.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeployingLayout(false)
    }
  }, [handle, changedEdits, setDraft])

  // --- Design Doctor ---
  const originalById = useMemo(() => {
    const m = new Map<string, VisualNode>()
    report?.pages.forEach((p) => p.visuals.forEach((v) => m.set(v.id, v)))
    return m
  }, [report])

  const applyFindings = useCallback(
    (list: Finding[]) => {
      setDoctorEdits((prev) => {
        const next = { ...prev }
        for (const f of list) {
          for (const { visualId, patch } of f.patches) {
            const base = next[visualId] ?? originalById.get(visualId)?.raw
            if (base) next[visualId] = patch(base)
          }
        }
        return next
      })
    },
    [originalById],
  )
  const onFix = useCallback((f: Finding) => applyFindings([f]), [applyFindings])
  const onFixAll = useCallback(
    (rule?: DoctorRule) => applyFindings(rule ? findings.filter((f) => f.rule === rule) : findings),
    [applyFindings, findings],
  )
  const resetDoctor = useCallback(() => setDoctorEdits({}), [])

  const onDeployDoctor = useCallback(async () => {
    if (!handle || doctorEditedCount === 0) return
    setDeployingDoctor(true)
    setError(null)
    setNotice(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const edits = Object.entries(doctorEdits)
        .map(([id, raw]) => ({ file: originalById.get(id)?.file, raw }))
        .filter((e): e is { file: string; raw: (typeof doctorEdits)[string] } => !!e.file)
      const res = await deployDoctor(handle, edits, stamp)
      setReport((r) => (r ? applyDoctorEdits(r, doctorEdits) : r)) // bake fixes into the baseline
      setDoctorEdits({})
      setNotice(`Fixed ${res.count} visual${res.count === 1 ? '' : 's'}. Backup at ${res.backupDir}. Close and reopen the report in Power BI Desktop to see it.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeployingDoctor(false)
    }
  }, [handle, doctorEdits, doctorEditedCount, originalById])

  // Fit-to-viewport scaling.
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
  const singleSel = selection.size === 1 ? (() => { const id = [...selection][0]; const rect = rectOf(id); return rect ? { id, rect } : null })() : null

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
            setSelection(new Set())
          }}
        />

        <main className="stage-wrap">
          <div className="stage-toolbar">
            <span className="stage-page">{activePage ? activePage.displayName : '—'}</span>
            <span className="stage-dim">{activePage ? `${activePage.width}×${activePage.height}` : ''}</span>
            <span className="stage-zoom">{Math.round(scale * 100)}%</span>
            {view === 'theme' && (
              <label className="stage-compare">
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
                A/B compare
              </label>
            )}
            {view === 'layout' && <span className="stage-hint">Drag to move · Shift-click to multi-select · arrows to nudge</span>}
            {view === 'doctor' && <span className="stage-hint">Fixes preview here live · deploy writes them back</span>}
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
                  layout={
                    view === 'layout'
                      ? {
                          draftRects: layoutDraft,
                          selection,
                          grid: gridSnap ? GRID : null,
                          showGrid,
                          onSelect: setSelection,
                          onDraftChange,
                          onCommit: onLayoutCommit,
                        }
                      : undefined
                  }
                />
              )
            ) : (
              <div className="empty-state"><p>This report has no pages.</p></div>
            )}
          </div>
        </main>

        {view === 'theme' && effectiveTheme ? (
          <ThemeLab
            theme={effectiveTheme}
            dirty={themeDirty}
            canDeploy={!!handle}
            deploying={deploying}
            onChange={setThemeDraft}
            onReset={resetTheme}
            onDeploy={onDeployTheme}
          />
        ) : view === 'layout' ? (
          <LayoutLab
            selectionCount={selection.size}
            single={singleSel}
            grid={gridSnap}
            showGrid={showGrid}
            dirty={layoutDirty}
            changedCount={changedEdits.length}
            canDeploy={!!handle}
            deploying={deployingLayout}
            canUndo={hist.at > 0}
            canRedo={hist.at < hist.stack.length - 1}
            onSetRect={onSetRect}
            onAlign={onAlign}
            onDistribute={onDistribute}
            onMatch={onMatch}
            onToggleGrid={() => setGridSnap((g) => !g)}
            onToggleShowGrid={() => setShowGrid((g) => !g)}
            onUndo={onUndo}
            onRedo={onRedo}
            onReset={resetLayout}
            onDeploy={onDeployLayout}
          />
        ) : view === 'doctor' ? (
          <DesignDoctor
            findings={findings}
            editedCount={doctorEditedCount}
            canDeploy={!!handle}
            deploying={deployingDoctor}
            onFix={onFix}
            onFixAll={onFixAll}
            onReset={resetDoctor}
            onDeploy={onDeployDoctor}
          />
        ) : (
          <Inspector report={report} page={activePage} visual={selectedVisual} scale={scale} />
        )}
      </div>
    </div>
  )
}
