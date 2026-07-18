// Deploys a Style pack by rewriting the report's active theme file — one write
// restyles every visual, because Power BI resolves visualStyles/textClasses
// from the theme.

import type { Theme } from '../pbir/types.ts'
import { writeFileSafely } from '../pbir/fs.ts'
import { applyStylePack } from './theme.ts'
import type { StylePack } from './packs.ts'

export interface StyleDeployResult {
  path: string
  backedUpTo: string
}

export async function deployStyle(
  handle: FileSystemDirectoryHandle,
  theme: Theme,
  pack: StylePack,
  backupStamp: string,
): Promise<StyleDeployResult> {
  if (theme.source.kind === 'none') throw new Error('This theme has no file to write back to.')
  if (theme.source.kind === 'rootFile') {
    throw new Error(
      'The active theme is an imported Theme.json, not a registered report theme. Re-import it in Power BI (View → Themes) so it becomes the report theme, then deploy.',
    )
  }
  const json = JSON.stringify(applyStylePack(theme.raw, pack), null, 2)
  const res = await writeFileSafely(handle, theme.source.path, json, backupStamp)
  return { path: res.path, backedUpTo: res.backedUpTo }
}
