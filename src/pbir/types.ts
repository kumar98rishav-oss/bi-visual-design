// Type model for a Power BI PBIR (enhanced report format) project.
//
// PBIR stores the entire *design* layer as JSON files on disk inside the
// `<Report>.Report` folder. There is zero row-level data here — only field
// names, bindings, geometry, and formatting. That is the whole privacy story:
// this tool literally cannot see the user's data.
//
// These types intentionally model only what we read/write today. Everything we
// don't touch is preserved verbatim (see `report.ts` -> raw kept per node), so
// we never lose properties we don't understand when we deploy.

/** A raw, untyped JSON object as it sits in a PBIR file. */
export type Json = unknown
export type JsonObject = { [key: string]: Json }

// ---------------------------------------------------------------------------
// Expression trees
// ---------------------------------------------------------------------------
// Almost every formatting value in PBIR is wrapped in an "expression tree".
// Literals look like: { "expr": { "Literal": { "Value": "28D" } } }
// Colors look like:   { "solid": { "color": { "expr": { ... } } } }
// Values carry a type suffix and (for strings) embedded single quotes:
//   "28D"      -> number 28
//   "0D"       -> number 0
//   "true"     -> boolean true
//   "'#FFBF35'"-> string  #FFBF35
//   "'center'" -> string  center
//   "''"       -> string  (empty)
// A value can also be a data binding (Measure / Column) instead of a literal —
// e.g. a dynamic title bound to a measure. We surface those as bindings.

export interface LiteralExpr {
  Literal: { Value: string }
}

export interface ThemeDataColorExpr {
  ThemeDataColor: { ColorId: number; Percent: number }
}

export interface SourceRef {
  Entity?: string
  Source?: string
}

export interface MeasureExpr {
  Measure: { Expression: { SourceRef: SourceRef }; Property: string }
}

export interface ColumnExpr {
  Column: { Expression: { SourceRef: SourceRef }; Property: string }
}

export type FieldExpr = MeasureExpr | ColumnExpr

// ---------------------------------------------------------------------------
// Report / pages / visuals
// ---------------------------------------------------------------------------

export interface PagesMetadata {
  $schema?: string
  pageOrder: string[]
  activePageName?: string
  landingPageName?: string
}

export interface VisualPosition {
  x: number
  y: number
  z: number
  height: number
  width: number
  tabOrder?: number
}

/** A single field projection inside a visual's query. */
export interface Projection {
  role: string // e.g. "Values", "Category", "Y", "Legend"
  entity: string // e.g. "_Measure"
  property: string // e.g. "Total_cases"
  kind: 'Measure' | 'Column'
}

export interface VisualNode {
  /** Folder id === name in the file. */
  id: string
  /** Owning page id. */
  pageId: string
  /** Project-relative path to this visual.json, for deploy. */
  file: string
  name: string
  position: VisualPosition
  /** "card", "clusteredBarChart", "slicer", "textbox", ... */
  visualType: string
  /** Field bindings pulled from visual.query.queryState (best-effort). */
  projections: Projection[]
  /** The full parsed JSON, kept so we can round-trip untouched properties. */
  raw: JsonObject
  schema?: string
}

export interface PageNode {
  /** Folder id === name in the file. */
  id: string
  name: string
  displayName: string
  displayOption: string
  width: number
  height: number
  /** Ordered by z then tabOrder for stable stacking. */
  visuals: VisualNode[]
  raw: JsonObject
  schema?: string
}

/** How the active theme was located, which determines where a deploy writes. */
export type ThemeSource =
  | { kind: 'registered'; path: string; packageName: string } // inside <Report>/StaticResources/...
  | { kind: 'rootFile'; path: string } // a Theme.json next to the project
  | { kind: 'none' } // synthesized default; nowhere to write yet

/** A Power BI theme. Only the fields we edit are typed; the rest round-trips. */
export interface Theme {
  name: string
  /** Effective palette (custom theme merged over base). ColorId N -> [N-1]. */
  dataColors: string[]
  background?: string
  foreground?: string
  tableAccent?: string
  /**
   * The raw JSON of the theme we would WRITE on deploy — i.e. the custom theme
   * layer, not the merged view. Preserves textClasses/visualStyles/etc.
   */
  raw: JsonObject
  /** Where this theme lives, for deploy. */
  source: ThemeSource
  /** Base theme name we merged under the custom theme, if any (for display). */
  baseName?: string
}

export interface ReportModel {
  /** Absolute-ish label for the report (folder name), for display only. */
  reportName: string
  /**
   * Project-relative path of the `<name>.Report` folder (e.g. "My.Report", or
   * "." when the user picked the .Report folder itself). Needed to CREATE new
   * files — new visuals, generated background images.
   */
  reportDir: string
  pagesMeta: PagesMetadata
  /** Pages in pageOrder. */
  pages: PageNode[]
  /** Parsed Theme.json if present next to the .Report folder or embedded. */
  theme: Theme | null
  /** Raw report.json, preserved. */
  reportRaw: JsonObject | null
}
