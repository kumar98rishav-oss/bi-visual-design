// Writes Design Doctor fixes back to their visual.json files (backup + validate).

import type { JsonObject } from '../pbir/types.ts'
import { writeFileSafely } from '../pbir/fs.ts'

export interface DoctorEdit {
  file: string
  raw: JsonObject
}

export interface DoctorDeployResult {
  count: number
  backupDir: string
}

export async function deployDoctor(
  handle: FileSystemDirectoryHandle,
  edits: DoctorEdit[],
  backupStamp: string,
): Promise<DoctorDeployResult> {
  for (const e of edits) {
    await writeFileSafely(handle, e.file, JSON.stringify(e.raw, null, 2), backupStamp)
  }
  return { count: edits.length, backupDir: `.bi-visual-design-backup/${backupStamp}` }
}
