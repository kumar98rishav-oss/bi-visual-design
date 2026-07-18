// Loads a PBIR project folder into a {@link ReportModel}.
//
// The parser is pure and I/O-agnostic: it talks to a {@link FileProvider},
// which is implemented over the browser File System Access API in the app
// (`fs.ts`) and over Node `fs` in the verification script. Everything the
// parser does not explicitly model is kept in `raw`, so a later deploy can
// round-trip untouched properties without loss.

import type {
  JsonObject,
  Json,
  PageNode,
  PagesMetadata,
  Projection,
  ReportModel,
  Theme,
  VisualNode,
  VisualPosition,
} from './types.ts'

/**
 * Minimal file access surface. Paths are POSIX-style and relative to the
 * project root (the folder that CONTAINS the `<name>.Report` directory).
 */
export interface FileProvider {
  /** Read a UTF-8 text file, or null if it does not exist. */
  readText(path: string): Promise<string | null>
  /** List child entry names of a directory, or [] if it does not exist. */
  listDir(path: string): Promise<string[]>
  /** True if the path is a directory. */
  isDir(path: string): Promise<boolean>
}

function isObj(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function parseJson(text: string | null): JsonObject | null {
  if (text == null) return null
  try {
    const v = JSON.parse(stripBom(text))
    return isObj(v) ? v : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Locating the .Report folder
// ---------------------------------------------------------------------------

/** Find the `<name>.Report` directory inside the picked project root. */
export async function findReportDir(fp: FileProvider): Promise<string | null> {
  // Picked the project root: look for a *.Report child.
  for (const name of await fp.listDir('.')) {
    if (name.endsWith('.Report') && (await fp.isDir(name))) return name
  }
  // Picked the .Report folder directly: definition/ lives right here.
  if (await fp.isDir('definition')) return '.'
  return null
}

// ---------------------------------------------------------------------------
// Field projections
// ---------------------------------------------------------------------------

function readFieldExpr(field: Json): Projection | null {
  if (!isObj(field)) return null
  const kind = isObj(field.Measure) ? 'Measure' : isObj(field.Column) ? 'Column' : null
  if (!kind) return null
  const inner = field[kind] as JsonObject
  const property = typeof inner.Property === 'string' ? inner.Property : ''
  let entity = ''
  const expr = inner.Expression
  if (isObj(expr) && isObj(expr.SourceRef)) {
    const sr = expr.SourceRef
    entity = (typeof sr.Entity === 'string' && sr.Entity) || (typeof sr.Source === 'string' && sr.Source) || ''
  }
  return { role: '', entity, property, kind }
}

/** Best-effort extraction of field bindings from visual.query.queryState. */
function readProjections(visual: JsonObject): Projection[] {
  const query = visual.query
  if (!isObj(query)) return []
  const queryState = query.queryState
  if (!isObj(queryState)) return []

  const out: Projection[] = []
  for (const [role, bucket] of Object.entries(queryState)) {
    if (!isObj(bucket) || !Array.isArray(bucket.projections)) continue
    for (const proj of bucket.projections) {
      if (!isObj(proj)) continue
      const parsed = readFieldExpr(proj.field)
      if (parsed) out.push({ ...parsed, role })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------

function readPosition(raw: Json): VisualPosition {
  const p = isObj(raw) ? raw : {}
  const num = (v: Json, d = 0) => (typeof v === 'number' ? v : d)
  return {
    x: num(p.x),
    y: num(p.y),
    z: num(p.z),
    height: num(p.height),
    width: num(p.width),
    tabOrder: typeof p.tabOrder === 'number' ? p.tabOrder : undefined,
  }
}

async function loadVisual(
  fp: FileProvider,
  visualsDir: string,
  visualId: string,
  pageId: string,
): Promise<VisualNode | null> {
  const file = `${visualsDir}/${visualId}/visual.json`
  const raw = parseJson(await fp.readText(file))
  if (!raw) return null

  // A container node groups other visuals; it has `visualGroup` in place of
  // `visual`. We surface it as the synthetic type "visualGroup" so the mirror
  // can render it as a labelled container.
  if (isObj(raw.visualGroup)) {
    const group = raw.visualGroup
    return {
      id: visualId,
      pageId,
      file,
      name: typeof group.displayName === 'string' ? group.displayName : (typeof raw.name === 'string' ? raw.name : visualId),
      position: readPosition(raw.position),
      visualType: 'visualGroup',
      projections: [],
      raw,
      schema: typeof raw.$schema === 'string' ? raw.$schema : undefined,
    }
  }

  const visual = isObj(raw.visual) ? raw.visual : {}
  return {
    id: visualId,
    pageId,
    file,
    name: typeof raw.name === 'string' ? raw.name : visualId,
    position: readPosition(raw.position),
    visualType: typeof visual.visualType === 'string' ? visual.visualType : 'unknown',
    isHidden: raw.isHidden === true,
    projections: readProjections(visual),
    raw,
    schema: typeof raw.$schema === 'string' ? raw.$schema : undefined,
  }
}

async function loadPage(fp: FileProvider, pagesDir: string, pageId: string): Promise<PageNode | null> {
  const raw = parseJson(await fp.readText(`${pagesDir}/${pageId}/page.json`))
  if (!raw) return null

  const visualsDir = `${pagesDir}/${pageId}/visuals`
  const visualIds = await fp.listDir(visualsDir)
  const visuals: VisualNode[] = []
  for (const vid of visualIds) {
    if (!(await fp.isDir(`${visualsDir}/${vid}`))) continue
    const v = await loadVisual(fp, visualsDir, vid, pageId)
    if (v) visuals.push(v)
  }
  // Stable stacking order: z ascending, then tabOrder.
  visuals.sort((a, b) => a.position.z - b.position.z || (a.position.tabOrder ?? 0) - (b.position.tabOrder ?? 0))

  const num = (v: Json, d: number) => (typeof v === 'number' ? v : d)
  return {
    id: pageId,
    name: typeof raw.name === 'string' ? raw.name : pageId,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : pageId,
    displayOption: typeof raw.displayOption === 'string' ? raw.displayOption : 'FitToPage',
    width: num(raw.width, 1280),
    height: num(raw.height, 720),
    visuals,
    raw,
    schema: typeof raw.$schema === 'string' ? raw.$schema : undefined,
  }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function str(v: Json): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function dataColorsOf(raw: JsonObject): string[] {
  return Array.isArray(raw.dataColors) ? raw.dataColors.filter((c): c is string => typeof c === 'string') : []
}

/**
 * Resolve a resource item's path to a file location under the report's
 * StaticResources. SharedResources (base + built-in themes) and
 * RegisteredResources (user-uploaded custom themes) live in different subtrees.
 */
function resourceFilePath(packageType: string, itemPath: string): string {
  const subtree = packageType === 'RegisteredResources' ? 'RegisteredResources' : 'SharedResources'
  return `StaticResources/${subtree}/${itemPath}`
}

/**
 * Look up a theme resource's report-relative path by its declared name in
 * report.json. Returns a path like "StaticResources/SharedResources/...".
 */
function findThemePath(reportRaw: JsonObject | null, themeName: string): { path: string; packageName: string } | null {
  if (!reportRaw || !Array.isArray(reportRaw.resourcePackages)) return null
  for (const pkg of reportRaw.resourcePackages) {
    if (!isObj(pkg) || !Array.isArray(pkg.items)) continue
    const packageType = str(pkg.type) ?? 'SharedResources'
    for (const item of pkg.items) {
      if (isObj(item) && str(item.name) === themeName && str(item.path)) {
        return { path: resourceFilePath(packageType, str(item.path)!), packageName: str(pkg.name) ?? packageType }
      }
    }
  }
  return null
}

/**
 * Load the ACTIVE theme the report renders with. Power BI declares a
 * themeCollection in report.json (baseTheme + optional customTheme) that points
 * into StaticResources. The effective palette is the custom theme merged over
 * the base. We keep the custom theme's raw as the deploy target so edits
 * round-trip its textClasses/visualStyles. Falls back to a root Theme.json.
 */
async function loadTheme(fp: FileProvider, reportDir: string, reportRaw: JsonObject | null): Promise<Theme | null> {
  const themeCollection = reportRaw && isObj(reportRaw.themeCollection) ? reportRaw.themeCollection : null

  const baseName = themeCollection && isObj(themeCollection.baseTheme) ? str(themeCollection.baseTheme.name) : undefined
  const customName =
    themeCollection && isObj(themeCollection.customTheme) ? str(themeCollection.customTheme.name) : undefined

  const readThemeByName = async (name: string | undefined): Promise<{ raw: JsonObject; loc: { path: string; packageName: string } } | null> => {
    if (!name) return null
    const loc = findThemePath(reportRaw, name)
    if (!loc) return null
    const raw = parseJson(await fp.readText(`${reportDir}/${loc.path}`))
    return raw ? { raw, loc } : null
  }

  const base = await readThemeByName(baseName)
  const custom = await readThemeByName(customName)

  // The active layer we edit/deploy is the custom theme if present, else base.
  const active = custom ?? base
  if (active) {
    // Effective palette: the custom theme's colours if it defines them,
    // otherwise the base theme's. We edit/deploy the active layer's raw.
    const mergedColors = dataColorsOf(active.raw).length ? dataColorsOf(active.raw) : dataColorsOf(base?.raw ?? {})
    return {
      name: str(active.raw.name) ?? customName ?? baseName ?? 'Theme',
      dataColors: mergedColors,
      background: str(active.raw.background) ?? str(base?.raw.background),
      foreground: str(active.raw.foreground) ?? str(base?.raw.foreground),
      tableAccent: str(active.raw.tableAccent) ?? str(base?.raw.tableAccent),
      raw: active.raw,
      source: { kind: 'registered', path: `${reportDir}/${active.loc.path}`, packageName: active.loc.packageName },
      baseName: custom ? baseName : undefined,
    }
  }

  // Fallback: a Theme.json sitting next to the project (an imported source file).
  for (const candidate of ['Theme.json', 'theme.json']) {
    const raw = parseJson(await fp.readText(candidate))
    if (raw && Array.isArray(raw.dataColors)) {
      return {
        name: str(raw.name) ?? 'Custom theme',
        dataColors: dataColorsOf(raw),
        background: str(raw.background),
        foreground: str(raw.foreground),
        tableAccent: str(raw.tableAccent),
        raw,
        source: { kind: 'rootFile', path: candidate },
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Top-level load
// ---------------------------------------------------------------------------

export async function loadReport(fp: FileProvider, reportName = 'Report'): Promise<ReportModel> {
  const reportDir = await findReportDir(fp)
  if (!reportDir) {
    throw new Error('No .Report folder found. Pick the Power BI project folder (the one containing <name>.Report).')
  }

  const defDir = `${reportDir}/definition`
  const pagesDir = `${defDir}/pages`

  const pagesMetaRaw = parseJson(await fp.readText(`${pagesDir}/pages.json`))
  const pageOrder =
    pagesMetaRaw && Array.isArray(pagesMetaRaw.pageOrder)
      ? pagesMetaRaw.pageOrder.filter((s): s is string => typeof s === 'string')
      : []

  const pagesMeta: PagesMetadata = {
    $schema: pagesMetaRaw && typeof pagesMetaRaw.$schema === 'string' ? pagesMetaRaw.$schema : undefined,
    pageOrder,
    activePageName:
      pagesMetaRaw && typeof pagesMetaRaw.activePageName === 'string' ? pagesMetaRaw.activePageName : undefined,
    landingPageName:
      pagesMetaRaw && typeof pagesMetaRaw.landingPageName === 'string' ? pagesMetaRaw.landingPageName : undefined,
  }

  // If pages.json is missing/empty, fall back to whatever folders exist.
  const idsToLoad = pageOrder.length ? pageOrder : (await fp.listDir(pagesDir)).filter((n) => n !== 'pages.json')

  const pages: PageNode[] = []
  for (const pid of idsToLoad) {
    const page = await loadPage(fp, pagesDir, pid)
    if (page) pages.push(page)
  }

  const reportRaw = parseJson(await fp.readText(`${defDir}/report.json`))

  return {
    reportName,
    reportDir,
    pagesMeta,
    pages,
    theme: await loadTheme(fp, reportDir, reportRaw),
    reportRaw,
  }
}
