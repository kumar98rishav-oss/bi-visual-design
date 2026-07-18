// Executes a ChangeSet as one transaction, and can undo it.
//
// Guarantees:
//  1. Nothing is written until EVERY edit validates (no half-written reports).
//  2. All files share one backup stamp, so a deploy is one restorable unit.
//  3. A manifest is written alongside the backup, which makes rollback possible
//     later — and in a different session, because it lives on disk.

import { deleteDir, deleteFile, writeFileSafely } from '../pbir/fs.ts'
import { summarize, validate, type ChangeSet, type EditOrigin } from './changeset.ts'

export const BACKUP_ROOT = '.bi-visual-design-backup'
export const MANIFEST_NAME = 'manifest.json'

export interface ManifestEntry {
  file: string
  isNew: boolean
  origin: EditOrigin
  label: string
}

export interface DeployManifest {
  /** Folder-safe timestamp; also the backup directory name. */
  stamp: string
  at: number
  reportName?: string
  files: ManifestEntry[]
  summary: {
    files: number
    newFiles: number
    pages: number
    byOrigin: { origin: EditOrigin; label: string; count: number }[]
  }
}

/** Folder-safe, sortable stamp. */
export function newStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

export const backupDirFor = (stamp: string) => `${BACKUP_ROOT}/${stamp}`

export interface DeployResult {
  manifest: DeployManifest
  backupDir: string
}

/**
 * Write every edit under one stamp. Throws BEFORE touching disk if validation
 * fails; if a write fails midway the error names the file so the manifest
 * already on disk can be used to recover.
 */
export async function deployChangeSet(
  handle: FileSystemDirectoryHandle,
  cs: ChangeSet,
  stamp: string,
  reportName?: string,
): Promise<DeployResult> {
  const check = validate(cs)
  if (!check.ok) {
    throw new Error(`Refusing to deploy — ${check.errors.length} problem(s):\n${check.errors.join('\n')}`)
  }
  if (cs.edits.length === 0) throw new Error('Nothing to deploy.')

  const sum = summarize(cs)
  const manifest: DeployManifest = {
    stamp,
    at: Date.now(),
    reportName,
    files: cs.edits.map((e) => ({ file: e.file, isNew: !!e.isNew, origin: e.origin, label: e.label })),
    summary: { files: sum.files, newFiles: sum.newFiles, pages: sum.pages, byOrigin: sum.byOrigin },
  }

  // Manifest first: if a later write fails, the record of intent already exists.
  const backupDir = backupDirFor(stamp)
  await writeFileSafely(handle, `${backupDir}/${MANIFEST_NAME}`, JSON.stringify(manifest, null, 2), stamp)

  for (const e of cs.edits) {
    const binary = e.binary ?? typeof e.content !== 'string'
    await writeFileSafely(handle, e.file, e.content, stamp, { validateJson: !binary })
  }

  return { manifest, backupDir }
}

export interface RollbackResult {
  restored: number
  removed: number
  failed: string[]
}

/**
 * Undo a deploy: files that existed before are restored from the backup, and
 * files the deploy CREATED are deleted (for a minted visual the whole folder
 * goes, since PBIR discovers visuals by folder).
 */
export async function rollbackManifest(
  handle: FileSystemDirectoryHandle,
  manifest: DeployManifest,
): Promise<RollbackResult> {
  const backupDir = backupDirFor(manifest.stamp)
  const out: RollbackResult = { restored: 0, removed: 0, failed: [] }

  for (const entry of manifest.files) {
    try {
      if (entry.isNew) {
        const isVisual = /\/visuals\/[^/]+\/visual\.json$/.test(entry.file)
        const ok = isVisual
          ? await deleteDir(handle, entry.file.replace(/\/visual\.json$/, ''))
          : await deleteFile(handle, entry.file)
        if (ok) out.removed++
        else out.failed.push(entry.file)
      } else {
        const backup = await readBackup(handle, `${backupDir}/${entry.file}`)
        if (!backup) {
          out.failed.push(entry.file)
          continue
        }
        // Restoring is itself a write, but must NOT create another backup
        // generation — pass the same stamp so it lands in the same folder.
        await writeFileSafely(handle, entry.file, backup, manifest.stamp, { validateJson: false })
        out.restored++
      }
    } catch {
      out.failed.push(entry.file)
    }
  }
  return out
}

async function readBackup(handle: FileSystemDirectoryHandle, path: string): Promise<Blob | null> {
  const { readBytes } = await import('../pbir/fs.ts')
  const buf = await readBytes(handle, path)
  return buf ? new Blob([buf]) : null
}

/** List past deploys, newest first (the stamp sorts chronologically). */
export async function listManifests(handle: FileSystemDirectoryHandle): Promise<DeployManifest[]> {
  const { createBrowserProvider } = await import('../pbir/fs.ts')
  const fp = createBrowserProvider(handle)
  const stamps = await fp.listDir(BACKUP_ROOT)
  const out: DeployManifest[] = []
  for (const stamp of stamps) {
    const text = await fp.readText(`${BACKUP_ROOT}/${stamp}/${MANIFEST_NAME}`)
    if (!text) continue
    try {
      out.push(JSON.parse(text) as DeployManifest)
    } catch {
      /* a manifest we can't read is not worth failing the list for */
    }
  }
  return out.sort((a, b) => b.stamp.localeCompare(a.stamp))
}
