// PBIR object ids are 20 lowercase hex characters (10 random bytes). Power BI
// generates them for every visual/bookmark; when the Designer creates panels or
// decorations it has to mint its own, collision-free within the report.

export const ID_LENGTH = 20

export function isPbirId(s: string): boolean {
  return new RegExp(`^[0-9a-f]{${ID_LENGTH}}$`).test(s)
}

/** Mint a fresh 20-hex id that is not already used in the report. */
export function mintId(taken: ReadonlySet<string> = new Set()): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    const bytes = new Uint8Array(ID_LENGTH / 2)
    globalThis.crypto.getRandomValues(bytes)
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    if (!taken.has(id)) return id
  }
  // Astronomically unlikely; fail loudly rather than risk overwriting a visual.
  throw new Error('Could not mint a unique id after 64 attempts')
}

/** Mint `count` ids, guaranteed distinct from each other and from `taken`. */
export function mintIds(count: number, taken: ReadonlySet<string> = new Set()): string[] {
  const used = new Set(taken)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const id = mintId(used)
    used.add(id)
    out.push(id)
  }
  return out
}
