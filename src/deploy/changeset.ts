// The ChangeSet — one shared vocabulary for everything the tool can write.
//
// Before this, each feature deployed itself: five buttons, five backup stamps,
// five trips through "close and reopen Power BI Desktop". Now every feature
// CONTRIBUTES edits to a single pending ChangeSet, and the app writes it once.
// That is what turns ~36 Desktop reopens per report into one.
//
// Pure data + pure functions — no filesystem here, so it can all be verified in
// Node.

/** Which feature produced an edit — used for the pre-flight summary and undo. */
export type EditOrigin = 'theme' | 'style' | 'layout' | 'designer' | 'doctor' | 'background'

export const ORIGIN_LABELS: Record<EditOrigin, string> = {
  theme: 'Theme',
  style: 'Style',
  layout: 'Layout',
  designer: 'Panels & layers',
  doctor: 'Doctor fixes',
  background: 'Background',
}

export interface FileEdit {
  /** Project-relative path, e.g. "My.Report/definition/pages/<id>/visual.json". */
  file: string
  /** Serialized content. Blob = binary asset (a generated background image). */
  content: string | Blob
  /** True when this path does not exist yet (a minted visual, a new image). */
  isNew?: boolean
  origin: EditOrigin
  /** Page this edit belongs to, when it belongs to one (for the summary). */
  pageId?: string
  /** Human-readable, shown in the pre-flight diff: "Moved 4 visuals". */
  label: string
  /** Skip JSON validation (binary). Inferred from content type when omitted. */
  binary?: boolean
}

export interface ChangeSet {
  edits: FileEdit[]
}

export const emptyChangeSet = (): ChangeSet => ({ edits: [] })

/**
 * Merge contributions. Later edits to the SAME file win, because features are
 * layered (a Doctor fix applied after a layout move should carry both — the
 * caller composes the raw first, then contributes once).
 */
export function mergeChangeSets(...sets: (ChangeSet | null | undefined)[]): ChangeSet {
  const byFile = new Map<string, FileEdit>()
  for (const set of sets) {
    if (!set) continue
    for (const edit of set.edits) {
      const prev = byFile.get(edit.file)
      // A file is only "new" if nothing before it claimed to replace one.
      byFile.set(edit.file, prev ? { ...edit, isNew: prev.isNew && edit.isNew } : edit)
    }
  }
  return { edits: [...byFile.values()] }
}

export interface ChangeSummary {
  files: number
  newFiles: number
  pages: number
  /** Edit count per origin, in a stable display order. */
  byOrigin: { origin: EditOrigin; label: string; count: number }[]
  /** One line per distinct label, for the pre-flight list. */
  lines: { origin: EditOrigin; label: string; count: number }[]
}

const ORIGIN_ORDER: EditOrigin[] = ['layout', 'designer', 'background', 'style', 'theme', 'doctor']

export function summarize(cs: ChangeSet): ChangeSummary {
  const pages = new Set<string>()
  const originCounts = new Map<EditOrigin, number>()
  const labelCounts = new Map<string, { origin: EditOrigin; label: string; count: number }>()
  let newFiles = 0

  for (const e of cs.edits) {
    if (e.pageId) pages.add(e.pageId)
    if (e.isNew) newFiles++
    originCounts.set(e.origin, (originCounts.get(e.origin) ?? 0) + 1)
    const key = `${e.origin}::${e.label}`
    const prev = labelCounts.get(key)
    if (prev) prev.count++
    else labelCounts.set(key, { origin: e.origin, label: e.label, count: 1 })
  }

  const rank = (o: EditOrigin) => {
    const i = ORIGIN_ORDER.indexOf(o)
    return i < 0 ? ORIGIN_ORDER.length : i
  }

  return {
    files: cs.edits.length,
    newFiles,
    pages: pages.size,
    byOrigin: [...originCounts.entries()]
      .map(([origin, count]) => ({ origin, label: ORIGIN_LABELS[origin], count }))
      .sort((a, b) => rank(a.origin) - rank(b.origin)),
    lines: [...labelCounts.values()].sort((a, b) => rank(a.origin) - rank(b.origin) || a.label.localeCompare(b.label)),
  }
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

/**
 * Validate BEFORE writing anything — the whole point of an atomic deploy is
 * that a bad edit stops the batch instead of leaving a half-written report.
 */
export function validate(cs: ChangeSet): ValidationResult {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const e of cs.edits) {
    if (!e.file || e.file.includes('..') || e.file.startsWith('/')) {
      errors.push(`Unsafe path: ${e.file || '(empty)'}`)
      continue
    }
    if (seen.has(e.file)) errors.push(`Duplicate edit for ${e.file}`)
    seen.add(e.file)

    const isBinary = e.binary ?? typeof e.content !== 'string'
    if (!isBinary && typeof e.content === 'string') {
      try {
        JSON.parse(e.content)
      } catch (err) {
        errors.push(`Invalid JSON for ${e.file}: ${(err as Error).message}`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}
