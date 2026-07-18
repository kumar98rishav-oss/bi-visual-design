// Deploy for Designer operations: CREATING new visuals (panels, decorations)
// and rewriting stacking order.
//
// Creating a visual is purely a filesystem act — drop
//   <reportDir>/definition/pages/<pageId>/visuals/<newId>/visual.json
// and Power BI Desktop discovers it on open. Nothing else registers it (pages
// don't list their visuals), which is why minting is safe and reversible:
// deleting the folder removes the object cleanly.

import { writeFileSafely } from '../pbir/fs.ts'
import type { JsonObject, VisualNode } from '../pbir/types.ts'

export interface FileEdit {
  file: string
  raw: JsonObject
  /** True when this path does not exist yet (a newly minted visual). */
  isNew?: boolean
}

/** Project-relative path of a visual.json, existing or new. */
export function visualPath(reportDir: string, pageId: string, visualId: string): string {
  return `${reportDir}/definition/pages/${pageId}/visuals/${visualId}/visual.json`
}

/** Edits that create new visuals on a page. */
export function newVisualEdits(
  reportDir: string,
  pageId: string,
  visuals: readonly { id: string; raw: JsonObject }[],
): FileEdit[] {
  return visuals.map((v) => ({
    file: visualPath(reportDir, pageId, v.id),
    raw: v.raw,
    isNew: true,
  }))
}

/** Edits that rewrite `position.z` on existing visuals, preserving everything else. */
export function zEdits(changes: readonly { visual: VisualNode; z: number }[]): FileEdit[] {
  return changes.map(({ visual, z }) => {
    const prev =
      typeof visual.raw.position === 'object' && visual.raw.position !== null && !Array.isArray(visual.raw.position)
        ? (visual.raw.position as JsonObject)
        : {}
    return {
      file: visual.file,
      raw: { ...visual.raw, position: { ...prev, z } },
    }
  })
}

export interface DesignerDeployResult {
  written: number
  created: number
  backupDir: string
}

/**
 * Write every edit through the safe-write path (backs up any file it replaces,
 * refuses invalid JSON). Newly created files have nothing to back up.
 */
export async function deployDesigner(
  handle: FileSystemDirectoryHandle,
  edits: readonly FileEdit[],
  backupStamp: string,
): Promise<DesignerDeployResult> {
  let created = 0
  for (const e of edits) {
    await writeFileSafely(handle, e.file, JSON.stringify(e.raw, null, 2), backupStamp)
    if (e.isNew) created++
  }
  return { written: edits.length, created, backupDir: `.bi-visual-design-backup/${backupStamp}` }
}
