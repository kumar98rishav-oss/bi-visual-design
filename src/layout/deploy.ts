// Writes edited visual positions back to their visual.json files. Only the
// position's x/y/width/height change; z, tabOrder and everything else in the
// file round-trip untouched.

import type { JsonObject, VisualNode } from '../pbir/types.ts'
import { writeFileSafely } from '../pbir/fs.ts'
import type { Rect } from './geometry.ts'

/** Merge a new rect into the visual's raw `position`, preserving z/tabOrder. */
export function applyPositionEdit(visual: VisualNode, rect: Rect): JsonObject {
  const prevPos =
    typeof visual.raw.position === 'object' && visual.raw.position !== null && !Array.isArray(visual.raw.position)
      ? (visual.raw.position as JsonObject)
      : {}
  const position: JsonObject = {
    ...prevPos,
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  }
  return { ...visual.raw, position }
}

export function serializeVisual(raw: JsonObject): string {
  return JSON.stringify(raw, null, 2)
}

export interface LayoutEdit {
  visual: VisualNode
  rect: Rect
}

export interface LayoutDeployResult {
  count: number
  backupDir: string
}

/**
 * Write each changed visual back to disk, backing up the prior file first and
 * validating JSON. All files in one deploy share a backup timestamp.
 */
export async function deployLayout(
  handle: FileSystemDirectoryHandle,
  edits: LayoutEdit[],
  backupStamp: string,
): Promise<LayoutDeployResult> {
  for (const edit of edits) {
    const json = serializeVisual(applyPositionEdit(edit.visual, edit.rect))
    await writeFileSafely(handle, edit.visual.file, json, backupStamp)
  }
  return { count: edits.length, backupDir: `.bi-visual-design-backup/${backupStamp}` }
}
