// An in-memory FileProvider backed by a { path -> text } map. Used to drive the
// real parser from bundled sample data (and handy for tests). Paths are the
// same POSIX-relative form the browser/Node providers use.

import type { FileProvider } from './report.ts'

export function createMemoryProvider(files: Record<string, string>): FileProvider {
  const paths = Object.keys(files)
  // Normalise to a root-relative path with no leading "./" and no trailing
  // slash; a bare "." (the root) becomes "".
  const norm = (p: string) => {
    const cleaned = p.replace(/^\.\//, '').replace(/\/+$/, '')
    return cleaned === '.' ? '' : cleaned
  }

  return {
    async readText(path) {
      return files[norm(path)] ?? null
    },
    async listDir(path) {
      const prefix = norm(path) === '' ? '' : `${norm(path)}/`
      const names = new Set<string>()
      for (const p of paths) {
        if (prefix === '' || p.startsWith(prefix)) {
          const rest = p.slice(prefix.length)
          const first = rest.split('/')[0]
          if (first) names.add(first)
        }
      }
      return [...names]
    },
    async isDir(path) {
      const prefix = `${norm(path)}/`
      return paths.some((p) => p.startsWith(prefix))
    },
  }
}
