import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PageNode, ReportModel, Theme, VisualNode } from './pbir/types.ts'
import { loadReport } from './pbir/report.ts'
import { createMemoryProvider } from './pbir/memoryProvider.ts'
import { buildSampleFiles, SAMPLE_REPORT_NAME } from './sample/sampleReport.ts'
import { isFileSystemAccessSupported, openProjectFolder } from './pbir/fs.ts'
import { deployTheme } from './theme/deploy.ts'
import { deployLayout, type LayoutEdit } from './layout/deploy.ts'
import { alignRects, bounds, distributeRects, matchSize, type AlignEdge, type DistAxis, type MatchDim, type Rect } from './layout/geometry.ts'
import { shade } from './pbir/color.ts'
import { analyzeReport, type DoctorRule, type Finding } from './doctor/analyze.ts'
import { applyDoctorEdits, type DoctorEdits } from './doctor/apply.ts'
import { deployDoctor } from './doctor/deploy.ts'
import { buildLayers, bringForward, sendBackward, bringToFront, sendToBack, assignZ, changedZ } from './designer/layers.ts'
import { applyDesignerEdits, panelToNode, type PendingPanel } from './designer/apply.ts'
import { buildPanel } from './designer/shapes.ts'
import { mintId } from './designer/ids.ts'
import { deployDesigner, newVisualEdits, zEdits } from './designer/deploy.ts'
import { connectDesktopCapture, isCaptureSupported, type CropRect, type DesktopCapture, type PageSnapshot } from './truth/capture.ts'
import { CaptureDialog } from './ui/CaptureDialog.tsx'
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

  // Designer (M5.1): pending panels + restacking
  const [pendingPanels, setPendingPanels] = useState<PendingPanel[]>([])
  const [zOverrides, setZOverrides] = useState<Record<string, number>>({})
  const designerDirty = pendingPanels.length > 0 || Object.keys(zOverrides).length > 0

  // True View (M6.0): captured Desktop pixels per page
  const [capture, setCapture] = useState<DesktopCapture | null>(null)
  const [snapshots, setSnapshots] = useState<Record<string, PageSnapshot>>({})
  const [truthMode, setTruthMode] = useState<'off' | 'truth' | 'ghost'>('off')
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false)
  const lastCropRef = useRef<CropRect | null>(null)

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
  // Doctor fixes form the baseline; Designer edits (panels, restacking) layer on
  // top. Keeping them separate lets deploy diff z against the true stored value.
  const baseReport = useMemo(
    () => (report ? applyDoctorEdits(report, doctorEdits) : null),
    [report, doctorEdits],
  )
  const effectiveReport = useMemo(
    () => (baseReport ? applyDesignerEdits(baseReport, pendingPanels, zOverrides) : null),
    [baseReport, pendingPanels, zOverrides],
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
    setPendingPanels([])
    setZOverrides({})
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
    setPendingPanels([])
    setZOverrides({})
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
    if (!handle || (!changedEdits.length && !designerDirty)) return
    setDeployingLayout(true)
    setError(null)
    setNotice(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')

      // Designer edits first: newly minted panels + any restacking. Each panel
      // gets its final z baked in from the restack map.
      let created = 0
      if (designerDirty && baseReport && report) {
        const zMap = new Map(Object.entries(zOverrides))
        const panelEdits = pendingPanels.map((p) => ({
          id: p.id,
          raw: {
            ...p.raw,
            position: { ...(p.raw.position as Record<string, unknown>), z: zMap.get(p.id) ?? 0 },
          },
          pageId: p.pageId,
        }))
        const edits = [
          ...panelEdits.flatMap((p) => newVisualEdits(report.reportDir, p.pageId, [{ id: p.id, raw: p.raw }])),
          ...zEdits(changedZ(baseReport.pages.flatMap((pg) => pg.visuals), zMap)),
        ]
        created = (await deployDesigner(handle, edits, stamp)).created
      }

      const res = changedEdits.length
        ? await deployLayout(handle, changedEdits, stamp)
        : { count: 0, backupDir: `.bi-visual-design-backup/${stamp}` }
      // Fold everything deployed into the model as the new baseline: moved
      // positions, restacked z, and the panels that now exist on disk.
      const editedById = new Map(changedEdits.map((e) => [e.visual.id, e.rect]))
      const zMap = new Map(Object.entries(zOverrides))
      const panelsByPage = new Map<string, PendingPanel[]>()
      for (const p of pendingPanels) {
        panelsByPage.set(p.pageId, [...(panelsByPage.get(p.pageId) ?? []), p])
      }
      setReport((r) => {
        if (!r) return r
        const pages: PageNode[] = r.pages.map((p) => {
          const visuals = p.visuals.map((v) => {
            const rc = editedById.get(v.id)
            const z = zMap.get(v.id)
            if (!rc && z === undefined) return v
            const position = {
              ...v.position,
              ...(rc ? { x: rc.x, y: rc.y, width: rc.w, height: rc.h } : {}),
              ...(z !== undefined ? { z } : {}),
            }
            return { ...v, position, raw: { ...v.raw, position } }
          })
          for (const panel of panelsByPage.get(p.id) ?? []) {
            const z = zMap.get(panel.id) ?? 0
            const raw = { ...panel.raw, position: { ...(panel.raw.position as Record<string, unknown>), z } }
            visuals.push(panelToNode(r.reportDir, p.id, panel.id, raw))
          }
          visuals.sort((a, b) => a.position.z - b.position.z || (a.position.tabOrder ?? 0) - (b.position.tabOrder ?? 0))
          return { ...p, visuals }
        })
        return { ...r, pages }
      })
      setDraft({})
      setPendingPanels([])
      setZOverrides({})
      const h = { stack: [{}], at: 0 }
      histRef.current = h
      setHist(h)
      const parts = [
        res.count ? `${res.count} position${res.count === 1 ? '' : 's'}` : '',
        created ? `${created} new panel${created === 1 ? '' : 's'}` : '',
      ].filter(Boolean)
      setNotice(`Deployed ${parts.join(' + ') || 'changes'}. Backup at ${res.backupDir}. Close and reopen the report in Power BI Desktop to see it.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeployingLayout(false)
    }
  }, [handle, changedEdits, setDraft, designerDirty, baseReport, report, pendingPanels, zOverrides])

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

  // --- True View: connect / capture / disconnect (M6.0) ---
  const onConnectCapture = useCallback(async () => {
    try {
      const c = await connectDesktopCapture()
      c.onEnded(() => setCapture(null))
      setCapture(c)
      setCaptureDialogOpen(true)
    } catch (e) {
      // The user closing Chrome's picker is a normal path, not an error.
      if ((e as Error).name !== 'NotAllowedError') setError((e as Error).message)
    }
  }, [])

  const onCaptured = useCallback(
    (dataUrl: string, crop: CropRect) => {
      if (!activePage) return
      lastCropRef.current = crop
      setSnapshots((prev) => ({ ...prev, [activePage.id]: { dataUrl, at: Date.now(), crop } }))
      setCaptureDialogOpen(false)
      setTruthMode((m) => (m === 'off' ? 'truth' : m))
    },
    [activePage],
  )

  const onDisconnectCapture = useCallback(() => {
    capture?.stop()
    setCapture(null)
  }, [capture])

  const activeSnapshot = activePage ? snapshots[activePage.id] : undefined
  // Layout mode keeps the overlay interactive, so truth downgrades to ghost there.
  const truthForStage =
    activeSnapshot && truthMode !== 'off'
      ? { dataUrl: activeSnapshot.dataUrl, mode: (view === 'layout' && truthMode === 'truth' ? 'ghost' : truthMode) as 'truth' | 'ghost' }
      : undefined

  // --- Designer: layers, restacking, panel minting (M5.1) ---
  const layers = useMemo(() => (activePage ? buildLayers(activePage.visuals) : []), [activePage])
  const layerOrder = useMemo(() => layers.map((l) => l.id), [layers])
  const selectedLayer = selection.size === 1 ? [...selection][0] : null

  /** Reassign sequential z from a back-to-front order. */
  const restack = useCallback((order: string[]) => {
    setZOverrides((prev) => ({ ...prev, ...Object.fromEntries(assignZ(order)) }))
  }, [])

  const onBringForwardLayer = useCallback((id: string) => restack(bringForward(layerOrder, id)), [restack, layerOrder])
  const onSendBackwardLayer = useCallback((id: string) => restack(sendBackward(layerOrder, id)), [restack, layerOrder])
  const onBringToFrontLayer = useCallback((id: string) => restack(bringToFront(layerOrder, id)), [restack, layerOrder])
  const onSendToBackLayer = useCallback((id: string) => restack(sendToBack(layerOrder, id)), [restack, layerOrder])

  const onAddPanel = useCallback(() => {
    if (!activePage || !effectiveReport) return
    const taken = new Set<string>()
    effectiveReport.pages.forEach((p) => p.visuals.forEach((v) => taken.add(v.id)))
    const id = mintId(taken)

    // Wrap the current selection (padded) or drop a generous centred panel.
    const sel = [...selection].map((i) => rectOf(i)).filter((r): r is Rect => !!r)
    const PAD = 16
    const r: Rect = sel.length
      ? (() => {
          const b = bounds(sel)
          return { x: b.x - PAD, y: b.y - PAD, w: b.w + PAD * 2, h: b.h + PAD * 2 }
        })()
      : { x: activePage.width * 0.12, y: activePage.height * 0.12, w: activePage.width * 0.76, h: activePage.height * 0.76 }

    // A panel must read as a surface against the page: nudge the page colour.
    const pageBg = effectiveTheme?.background ?? '#FFFFFF'
    const light = parseInt(pageBg.slice(1, 3), 16) + parseInt(pageBg.slice(3, 5), 16) + parseInt(pageBg.slice(5, 7), 16) > 382
    const panelHex = shade(pageBg, light ? 0.05 : -0.08)

    const raw = buildPanel({
      id, x: r.x, y: r.y, width: r.w, height: r.h, z: 0,
      fill: { kind: 'literal', hex: panelHex },
    })
    setPendingPanels((prev) => [...prev, { pageId: activePage.id, id, raw }])
    restack([id, ...layerOrder]) // new panels belong at the back
    setSelection(new Set([id]))
  }, [activePage, effectiveReport, selection, rectOf, effectiveTheme, restack, layerOrder, setSelection])

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

            <span className="truth-cluster">
              {activeSnapshot && (
                <select
                  className="truth-select"
                  value={truthMode}
                  onChange={(e) => setTruthMode(e.target.value as 'off' | 'truth' | 'ghost')}
                  title="How to show the captured Desktop pixels"
                >
                  <option value="off">Mirror</option>
                  <option value="truth">Desktop pixels</option>
                  <option value="ghost">Ghost overlay</option>
                </select>
              )}
              {capture ? (
                <>
                  <button className="btn small" onClick={() => setCaptureDialogOpen(true)}>
                    Capture page
                  </button>
                  <button className="btn small" onClick={onDisconnectCapture} title="Stop sharing the Desktop window">
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  className="btn small"
                  onClick={onConnectCapture}
                  disabled={!isCaptureSupported()}
                  title="Share your Power BI Desktop window to see the report exactly as Desktop renders it"
                >
                  Connect Desktop view
                </button>
              )}
            </span>
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
                  truth={truthForStage}
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
            dirty={layoutDirty || designerDirty}
            changedCount={changedEdits.length + pendingPanels.length}
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
            layers={layers}
            selectedLayer={selectedLayer}
            onSelectLayer={(id) => setSelection(new Set([id]))}
            onBringForward={onBringForwardLayer}
            onSendBackward={onSendBackwardLayer}
            onBringToFront={onBringToFrontLayer}
            onSendToBack={onSendToBackLayer}
            onAddPanel={onAddPanel}
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

      {captureDialogOpen && capture && activePage && (
        <CaptureDialog
          capture={capture}
          aspect={activePage.width / activePage.height}
          pageName={activePage.displayName}
          initialCrop={lastCropRef.current}
          onCapture={onCaptured}
          onCancel={() => setCaptureDialogOpen(false)}
        />
      )}
    </div>
  )
}
