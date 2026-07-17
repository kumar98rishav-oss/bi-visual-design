// Browser File System Access API implementation of {@link FileProvider}, plus
// safe write-back (backup + validate) and mtime polling for the live mirror.
//
// Chromium-only by design (Chrome/Edge). The user picks the Power BI *project*
// folder; we never leave that directory tree. No data ever leaves the machine —
// PBIR files contain field names and geometry, never rows.

import type { FileProvider } from './report.ts'

// The File System Access API isn't in older TS DOM libs everywhere; declare the
// bits we use so strict mode is happy without pulling extra deps.
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** A path split into segments, ignoring "." and empty parts. */
function segments(path: string): string[] {
  return path.split('/').filter((s) => s && s !== '.')
}

/** Resolve a directory handle for a relative path, or null if missing. */
async function getDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle | null> {
  let dir = root
  for (const seg of segments(path)) {
    try {
      dir = await dir.getDirectoryHandle(seg)
    } catch {
      return null
    }
  }
  return dir
}

/** Resolve a file handle for a relative path, optionally creating it. */
async function getFile(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemFileHandle | null> {
  const segs = segments(path)
  const fileName = segs.pop()
  if (!fileName) return null
  let dir = root
  for (const seg of segs) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create })
    } catch {
      return null
    }
  }
  try {
    return await dir.getFileHandle(fileName, { create })
  } catch {
    return null
  }
}

/** Wrap a picked directory handle as a FileProvider for the parser. */
export function createBrowserProvider(root: FileSystemDirectoryHandle): FileProvider {
  return {
    async readText(path) {
      const handle = await getFile(root, path)
      if (!handle) return null
      const file = await handle.getFile()
      return await file.text()
    },
    async listDir(path) {
      const dir = await getDir(root, path)
      if (!dir) return []
      const names: string[] = []
      // @ts-expect-error - async iterator on directory handle
      for await (const [name] of dir.entries()) names.push(name as string)
      return names
    },
    async isDir(path) {
      return (await getDir(root, path)) !== null
    },
  }
}

/** Return the lastModified time of a file, or 0 if missing. */
export async function fileMtime(root: FileSystemDirectoryHandle, path: string): Promise<number> {
  const handle = await getFile(root, path)
  if (!handle) return 0
  const file = await handle.getFile()
  return file.lastModified
}

export interface OpenedProject {
  handle: FileSystemDirectoryHandle
  provider: FileProvider
  /** Folder name, used as the report label. */
  name: string
}

/** Prompt the user to pick their Power BI project folder (readwrite). */
export async function openProjectFolder(): Promise<OpenedProject> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Your browser does not support the File System Access API. Use Chrome or Edge.')
  }
  const handle = await window.showDirectoryPicker!({ id: 'bi-visual-design', mode: 'readwrite' })
  return { handle, provider: createBrowserProvider(handle), name: handle.name }
}

// ---------------------------------------------------------------------------
// Safe write-back
// ---------------------------------------------------------------------------

export interface WriteResult {
  path: string
  backedUpTo: string
}

/**
 * Write JSON text to a file inside the project, backing up the previous
 * contents first. The caller is responsible for schema validation before
 * calling; we refuse to write anything that fails to re-parse.
 *
 * @param backupStamp a stable per-deploy timestamp so all files in one deploy
 *   share a backup folder. Pass the same value for every file in a deploy.
 */
export async function writeFileSafely(
  root: FileSystemDirectoryHandle,
  path: string,
  json: string,
  backupStamp: string,
): Promise<WriteResult> {
  // Guard: never write text that isn't valid JSON.
  try {
    JSON.parse(json)
  } catch (e) {
    throw new Error(`Refusing to write invalid JSON to ${path}: ${(e as Error).message}`)
  }

  const backupDir = `.bi-visual-design-backup/${backupStamp}`

  // Back up existing contents (if the file already exists).
  const existing = await getFile(root, path)
  if (existing) {
    const prev = await (await existing.getFile()).text()
    const backupPath = `${backupDir}/${path}`
    const backupHandle = await getFile(root, backupPath, true)
    if (backupHandle) {
      const w = await backupHandle.createWritable()
      await w.write(prev)
      await w.close()
    }
  }

  // Write the new contents.
  const target = await getFile(root, path, true)
  if (!target) throw new Error(`Could not open ${path} for writing.`)
  const writable = await target.createWritable()
  await writable.write(json)
  await writable.close()

  return { path, backedUpTo: `${backupDir}/${path}` }
}
