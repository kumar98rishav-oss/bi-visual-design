// Verifies the deploy engine's guarantees against an in-memory filesystem that
// mimics the browser's FileSystemDirectoryHandle: atomic validation, one backup
// stamp per deploy, manifest persistence, and rollback (restore modified,
// delete created).
//   node --experimental-strip-types scripts/verify-deploy.ts

import { mergeChangeSets, summarize, validate, type ChangeSet, type FileEdit } from '../src/deploy/changeset.ts'
import { backupDirFor, deployChangeSet, listManifests, MANIFEST_NAME, newStamp, rollbackManifest } from '../src/deploy/engine.ts'

let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

// --- Minimal in-memory stand-in for FileSystemDirectoryHandle ---------------
function makeFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed))
  const dirHandle = (prefix: string): any => ({
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      const p = prefix ? `${prefix}/${name}` : name
      const exists = [...files.keys()].some((f) => f.startsWith(`${p}/`))
      if (!exists && !opts?.create) throw new Error('no dir')
      return dirHandle(p)
    },
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      const p = prefix ? `${prefix}/${name}` : name
      if (!files.has(p) && !opts?.create) throw new Error('no file')
      return {
        async getFile() {
          const text = files.get(p) ?? ''
          return {
            async text() { return text },
            async arrayBuffer() { return new TextEncoder().encode(text).buffer },
          }
        },
        async createWritable() {
          return {
            async write(data: any) {
              if (typeof data === 'string') files.set(p, data)
              else if (data instanceof Blob) files.set(p, await data.text())
              else files.set(p, new TextDecoder().decode(data))
            },
            async close() {},
          }
        },
      }
    },
    async removeEntry(name: string, opts?: { recursive?: boolean }) {
      const p = prefix ? `${prefix}/${name}` : name
      if (files.has(p)) { files.delete(p); return }
      if (opts?.recursive) {
        let hit = false
        for (const k of [...files.keys()]) if (k.startsWith(`${p}/`)) { files.delete(k); hit = true }
        if (hit) return
      }
      throw new Error('no entry')
    },
    async *entries() {
      const seen = new Set<string>()
      const pre = prefix ? `${prefix}/` : ''
      for (const k of files.keys()) {
        if (!k.startsWith(pre)) continue
        const rest = k.slice(pre.length)
        const first = rest.split('/')[0]
        if (first && !seen.has(first)) { seen.add(first); yield [first, {}] }
      }
    },
  })
  return { handle: dirHandle('') as FileSystemDirectoryHandle, files }
}

const edit = (file: string, content: string, extra: Partial<FileEdit> = {}): FileEdit => ({
  file, content, origin: 'layout', label: 'Moved visuals', ...extra,
})

console.log('\nChangeSet model')
{
  const cs: ChangeSet = {
    edits: [
      edit('r/p1/a.json', '{"a":1}', { pageId: 'p1' }),
      edit('r/p1/b.json', '{"b":1}', { pageId: 'p1', origin: 'doctor', label: 'Rounded positions' }),
      edit('r/p2/c.json', '{"c":1}', { pageId: 'p2', isNew: true, origin: 'designer', label: 'Added panel' }),
    ],
  }
  const s = summarize(cs)
  check('counts files', s.files === 3)
  check('counts new files', s.newFiles === 1)
  check('counts distinct pages', s.pages === 2)
  check('groups by origin', s.byOrigin.length === 3, s.byOrigin.map((o) => `${o.origin}:${o.count}`).join(' '))
  check('layout sorts before doctor', s.byOrigin[0].origin === 'layout' && s.byOrigin.at(-1)!.origin === 'doctor')

  const merged = mergeChangeSets({ edits: [edit('x.json', '{"v":1}')] }, { edits: [edit('x.json', '{"v":2}')] })
  check('merge dedupes by file, last wins', merged.edits.length === 1 && merged.edits[0].content === '{"v":2}')
}

console.log('\nValidation (must fail BEFORE any write)')
{
  check('rejects invalid JSON', !validate({ edits: [edit('a.json', '{oops')] }).ok)
  check('rejects duplicate paths', !validate({ edits: [edit('a.json', '{}'), edit('a.json', '{}')] }).ok)
  check('rejects path traversal', !validate({ edits: [edit('../evil.json', '{}')] }).ok)
  check('accepts a clean set', validate({ edits: [edit('a.json', '{"ok":true}')] }).ok)
  check('binary edits skip JSON validation', validate({ edits: [edit('img.png', 'not-json', { binary: true })] }).ok)
}

console.log('\nAtomic deploy')
{
  const { handle, files } = makeFs({ 'r/a.json': '{"orig":"a"}', 'r/b.json': '{"orig":"b"}' })
  const bad: ChangeSet = { edits: [edit('r/a.json', '{"new":"a"}'), edit('r/b.json', '{broken')] }
  let threw = false
  try { await deployChangeSet(handle, bad, 'S1') } catch { threw = true }
  check('one bad edit aborts the whole deploy', threw)
  check('NOTHING was written', files.get('r/a.json') === '{"orig":"a"}', files.get('r/a.json'))
  check('no backup folder created', ![...files.keys()].some((k) => k.startsWith('.bi-visual-design-backup/S1/r/')))
}

console.log('\nDeploy + manifest')
{
  const { handle, files } = makeFs({ 'r/a.json': '{"orig":"a"}' })
  const cs: ChangeSet = {
    edits: [
      edit('r/a.json', '{"v":2}', { pageId: 'p1' }),
      edit('r/new/visuals/xyz/visual.json', '{"n":1}', { isNew: true, origin: 'designer', label: 'Added panel', pageId: 'p1' }),
    ],
  }
  const { manifest } = await deployChangeSet(handle, cs, 'S2', 'MyReport')
  check('edits written', files.get('r/a.json') === '{"v":2}')
  check('new file created', files.get('r/new/visuals/xyz/visual.json') === '{"n":1}')
  check('prior contents backed up', files.get('.bi-visual-design-backup/S2/r/a.json') === '{"orig":"a"}')
  check('manifest persisted', !!files.get(`${backupDirFor('S2')}/${MANIFEST_NAME}`))
  check('manifest records both files', manifest.files.length === 2)
  check('manifest flags the new file', manifest.files.find((f) => f.file.includes('xyz'))!.isNew === true)
  check('manifest carries the report name', manifest.reportName === 'MyReport')
  check('all files share ONE stamp', [...files.keys()].filter((k) => k.startsWith('.bi-visual-design-backup/')).every((k) => k.startsWith('.bi-visual-design-backup/S2/')))

  const found = await listManifests(handle)
  check('manifest is listable', found.length === 1 && found[0].stamp === 'S2')

  const roll = await rollbackManifest(handle, manifest)
  check('rollback restores modified files', files.get('r/a.json') === '{"orig":"a"}', `restored=${roll.restored}`)
  check('rollback deletes created visual folder', !files.has('r/new/visuals/xyz/visual.json'), `removed=${roll.removed}`)
  check('rollback reports no failures', roll.failed.length === 0, roll.failed.join(', '))
}

console.log('\nStamps')
{
  const s = newStamp(new Date('2026-07-19T08:30:15.123Z'))
  check('folder-safe', !/[:.]/.test(s), s)
  check('sorts chronologically', newStamp(new Date('2026-07-19T08:00:00Z')) < newStamp(new Date('2026-07-19T09:00:00Z')))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
