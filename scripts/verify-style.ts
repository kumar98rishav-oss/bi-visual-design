// Verifies Style packs → theme JSON: correct THEME colour format (plain hex,
// never expression trees), palette/typography/visualStyles wiring, and that
// applying a pack preserves unrelated keys in the real theme file.
//   node --experimental-strip-types scripts/verify-style.ts

import { loadReport } from '../src/pbir/report.ts'
import { STYLE_PACKS, packById } from '../src/style/packs.ts'
import { applyStylePack, buildTextClasses, buildVisualStyles } from '../src/style/theme.ts'
import { createNodeProvider } from './nodeProvider.ts'

const ROOT = process.argv[2] ?? 'E:/Data Analyst/POWER BI/Medical_Legal_BI_Project'
let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}
const HEX = /^#[0-9A-Fa-f]{6}$/

console.log('\nPack definitions')
{
  check('four packs', STYLE_PACKS.length === 4, STYLE_PACKS.map((p) => p.name).join(', '))
  check('ids unique', new Set(STYLE_PACKS.map((p) => p.id)).size === STYLE_PACKS.length)
  const badHex: string[] = []
  for (const p of STYLE_PACKS) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'string' && (k.toLowerCase().includes('color') || ['background', 'foreground', 'cardBg', 'cardBorder', 'good', 'bad', 'neutral', 'tableAccent', 'headerBg'].includes(k))) {
        if (v !== '' && !HEX.test(v)) badHex.push(`${p.id}.${k}=${v}`)
      }
    }
    for (const c of p.dataColors) if (!HEX.test(c)) badHex.push(`${p.id}.dataColors ${c}`)
  }
  check('every colour is a clean 6-digit hex', badHex.length === 0, badHex.slice(0, 4).join(', '))
  check('every pack has 8 data colours', STYLE_PACKS.every((p) => p.dataColors.length === 8))
}

console.log('\nGenerated theme structure')
{
  const p = packById('corporate-navy')!
  const vs = buildVisualStyles(p) as Record<string, any>
  const tc = buildTextClasses(p) as Record<string, any>

  check('has wildcard block', !!vs['*']?.['*'])
  check('styles the page canvas', vs.page?.['*']?.background?.[0]?.color?.solid?.color === p.background)
  check('card callout uses the KPI size', vs.card['*'].labels[0].fontSize === p.calloutSize)
  check('card category label uses the label colour', vs.card['*'].categoryLabels[0].color.solid.color === p.labelColor)
  check('container radius applied', vs['*']['*'].border[0].radius === p.cardRadius)
  check('table + matrix both styled', !!vs.tableEx?.['*']?.grid && !!vs.pivotTable?.['*']?.grid)
  check('slicer styled', !!vs.slicer?.['*']?.items)
  check('textClasses cover callout/title/header/label', ['callout', 'title', 'header', 'label'].every((k) => !!tc[k]?.fontFace))

  // THE format rule: theme colours are plain hex, NOT expression trees.
  let exprLeaks = 0
  let solids = 0
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (n && typeof n === 'object') {
      const o = n as Record<string, unknown>
      if ('expr' in o) exprLeaks++
      if ('solid' in o) {
        const c = (o.solid as Record<string, unknown>)?.color
        solids++
        if (typeof c !== 'string' || !HEX.test(c)) exprLeaks++
      }
      Object.values(o).forEach(walk)
    }
  }
  walk(vs)
  check('no expression trees leaked into the theme', exprLeaks === 0, `${exprLeaks} bad, ${solids} solid colours`)
  check('serialises to valid JSON', (() => { try { JSON.parse(JSON.stringify(vs)); return true } catch { return false } })())
}

console.log('\nApplying a pack to the REAL theme file')
{
  const model = await loadReport(createNodeProvider(ROOT), 'Medical_Legal_Project')
  const theme = model.theme!
  check('real theme loaded', !!theme, theme?.name)
  const before = JSON.stringify(theme.raw)
  const p = packById('midnight-glass')!
  const out = applyStylePack(theme.raw, p) as Record<string, any>

  check('palette replaced', JSON.stringify(out.dataColors) === JSON.stringify(p.dataColors))
  check('structural colours replaced', out.background === p.background && out.foreground === p.foreground)
  check('name preserved', out.name === (theme.raw as Record<string, unknown>).name, String(out.name))
  check('visualStyles written', !!out.visualStyles?.['*'])
  check('textClasses written', out.textClasses.callout.fontSize === p.calloutSize)
  check('original theme object not mutated', JSON.stringify(theme.raw) === before)
  check('result is valid JSON', (() => { try { JSON.parse(JSON.stringify(out)); return true } catch { return false } })())

  // Every pack must produce a writable theme.
  const allOk = STYLE_PACKS.every((pk) => {
    try { JSON.parse(JSON.stringify(applyStylePack(theme.raw, pk))); return true } catch { return false }
  })
  check('all four packs produce valid themes', allOk)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
