// A Node-backed FileProvider so the pure PBIR parser can be exercised against
// real files on disk (verification + future CLI use). The browser app uses a
// separate File System Access implementation in src/pbir/fs.ts.

import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { FileProvider } from '../src/pbir/report.ts'

export function createNodeProvider(rootDir: string): FileProvider {
  const root = resolve(rootDir)
  const abs = (p: string) => (p === '.' ? root : join(root, p))

  return {
    async readText(path) {
      try {
        return await readFile(abs(path), 'utf8')
      } catch {
        return null
      }
    },
    async listDir(path) {
      try {
        return await readdir(abs(path))
      } catch {
        return []
      }
    },
    async isDir(path) {
      try {
        return (await stat(abs(path))).isDirectory()
      } catch {
        return false
      }
    },
  }
}
