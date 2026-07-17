// Turns an edited Theme back into a PBIR theme file and writes it safely.
// Only the fields Theme Lab edits are overwritten; textClasses, visualStyles,
// structural colours and anything else in the source theme round-trip intact.

import type { JsonObject, Theme } from '../pbir/types.ts'
import { writeFileSafely } from '../pbir/fs.ts'

/** Merge the edited scalar fields into the theme's raw object (immutably). */
export function applyThemeEdits(theme: Theme): JsonObject {
  const next: JsonObject = { ...theme.raw }
  next.dataColors = [...theme.dataColors]
  if (theme.background !== undefined) next.background = theme.background
  if (theme.foreground !== undefined) next.foreground = theme.foreground
  if (theme.tableAccent !== undefined) next.tableAccent = theme.tableAccent
  return next
}

export function serializeTheme(raw: JsonObject): string {
  return JSON.stringify(raw, null, 2)
}

export interface DeployOutcome {
  path: string
  backedUpTo: string
}

/**
 * Write the edited theme to its source file inside the project, backing up the
 * prior contents first. Refuses if the theme has no writable source (e.g. the
 * report was loaded from the read-only sample).
 */
export async function deployTheme(
  handle: FileSystemDirectoryHandle,
  theme: Theme,
  backupStamp: string,
): Promise<DeployOutcome> {
  if (theme.source.kind === 'none') {
    throw new Error('This theme has no file to write back to.')
  }
  if (theme.source.kind === 'rootFile') {
    // Imported source file next to the project — writing it does not change the
    // registered report theme, so we refuse rather than mislead.
    throw new Error(
      'The active theme is an imported Theme.json, not a registered report theme. Re-import it in Power BI (View → Themes) so it becomes the report theme, then deploy.',
    )
  }
  const json = serializeTheme(applyThemeEdits(theme))
  const result = await writeFileSafely(handle, theme.source.path, json, backupStamp)
  return { path: result.path, backedUpTo: result.backedUpTo }
}
