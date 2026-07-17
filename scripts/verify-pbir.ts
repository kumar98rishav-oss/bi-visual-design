// Verifies the PBIR parser and expression-tree helpers against a real project.
//
//   node --experimental-strip-types scripts/verify-pbir.ts [projectRoot]
//
// Defaults to the user's Medical_Legal project (the build's test bed).

import { loadReport } from '../src/pbir/report.ts'
import {
  decodeLiteralValue,
  encodeLiteralValue,
  readColor,
  readLiteral,
} from '../src/pbir/exprTree.ts'
import { applyThemeEdits, serializeTheme } from '../src/theme/deploy.ts'
import { generatePalette } from '../src/theme/harmony.ts'
import { createNodeProvider } from './nodeProvider.ts'

const ROOT = process.argv[2] ?? 'E:/Data Analyst/POWER BI/Medical_Legal_BI_Project'

let failures = 0
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
}

function section(name: string): void {
  console.log(`\n${name}`)
}

// --- Unit: literal round-trips -------------------------------------------
section('Expression-tree literals')
const cases: Array<[string, number | boolean | string]> = [
  ['28D', 28],
  ['0D', 0],
  ['15D', 15],
  ['true', true],
  ['false', false],
  ["'#FFBF35'", '#FFBF35'],
  ["'center'", 'center'],
  ["''", ''],
]
for (const [raw, expected] of cases) {
  const decoded = decodeLiteralValue(raw)
  check(`decode ${JSON.stringify(raw)} -> ${JSON.stringify(expected)}`, decoded === expected, `got ${JSON.stringify(decoded)}`)
  check(`encode round-trips ${JSON.stringify(raw)}`, encodeLiteralValue(expected) === raw, `got ${JSON.stringify(encodeLiteralValue(expected))}`)
}

// --- Integration: load the real report -----------------------------------
section(`Loading report from: ${ROOT}`)
const model = await loadReport(createNodeProvider(ROOT), 'Medical_Legal_Project')

check('12 pages loaded', model.pages.length === 12, `got ${model.pages.length}`)
check('pages follow pageOrder', model.pages[0]?.id === model.pagesMeta.pageOrder[0], `first=${model.pages[0]?.id}`)
check('a page has a displayName', !!model.pages[0]?.displayName, model.pages[0]?.displayName)
check('standard pages are 1280x720', model.pages.filter((p) => p.width === 1280 && p.height === 720).length === 11, `${model.pages.filter((p) => p.width === 1280).length}/12`)
check('tooltip page keeps its own size', model.pages.some((p) => p.width === 320 && p.height === 240))
check('every page has a positive canvas size', model.pages.every((p) => p.width > 0 && p.height > 0))

const totalVisuals = model.pages.reduce((n, p) => n + p.visuals.length, 0)
check('all visuals loaded', totalVisuals >= 90, `got ${totalVisuals}`)

const types = new Set<string>()
for (const p of model.pages) for (const v of p.visuals) types.add(v.visualType)
check('recognises many visual types', types.size >= 5, `types: ${[...types].sort().join(', ')}`)
check('no untyped visuals remain', !types.has('unknown'), types.has('unknown') ? 'still has unknown' : 'clean')
check('visual groups classified', types.has('visualGroup'))

// Sub-pixel positions must survive as exact doubles.
const subpixel = model.pages.flatMap((p) => p.visuals).find((v) => v.position.x % 1 !== 0)
check('sub-pixel x position preserved', !!subpixel, subpixel ? `x=${subpixel.position.x}` : 'none found')

// Field bindings extracted somewhere.
const withProj = model.pages.flatMap((p) => p.visuals).find((v) => v.projections.length > 0)
check('field projections extracted', !!withProj, withProj ? `${withProj.visualType}: ${withProj.projections.map((x) => `${x.entity}.${x.property}`).join(', ')}` : 'none')

// --- Theme ---------------------------------------------------------------
section('Theme (active, from report.json themeCollection)')
check('active theme resolved', !!model.theme, model.theme?.name)
check('active theme is the custom theme (Frontier), not root Theme.json', model.theme?.name === 'Frontier', `got ${model.theme?.name}`)
check('base theme recorded', model.theme?.baseName === 'CY26SU05', `got ${model.theme?.baseName}`)
check('theme source is a registered StaticResources file', model.theme?.source.kind === 'registered', model.theme?.source.kind)
check('deploy target path points into StaticResources', model.theme?.source.kind === 'registered' && model.theme.source.path.includes('StaticResources'), model.theme?.source.kind === 'registered' ? model.theme.source.path : '')
check('first data color is Frontier teal #426871', model.theme?.dataColors[0]?.toUpperCase() === '#426871', model.theme?.dataColors[0])
check('theme has 32 data colors', model.theme?.dataColors.length === 32, `${model.theme?.dataColors.length} colors`)
check('background/foreground resolved', model.theme?.background === '#F9F7F2' && model.theme?.foreground === '#252423', `${model.theme?.background} / ${model.theme?.foreground}`)

// --- Color reading on a real visual --------------------------------------
section('Color resolution across real visuals')
// Deep-walk every visual's raw JSON looking for the two color shapes we
// support, proving readColor works on genuine PBIR trees (themed + literal).
let themeColors = 0
let literalColors = 0
let literalReads = 0
function walk(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(walk)
    return
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const color = readColor(obj)
    if (color?.kind === 'theme') themeColors++
    if (color?.kind === 'literal') literalColors++
    const lit = readLiteral(obj)
    if (typeof lit === 'boolean' || typeof lit === 'number' || typeof lit === 'string') literalReads++
    for (const v of Object.values(obj)) walk(v)
  }
}
for (const p of model.pages) for (const v of p.visuals) walk(v.raw)
check('resolved themed colors', themeColors > 0, `${themeColors} ThemeDataColor refs`)
check('resolved fixed hex colors', literalColors > 0, `${literalColors} literal colors`)
check('read literal values', literalReads > 0, `${literalReads} literals`)

// --- Deploy payload (data integrity) -------------------------------------
section('Deploy payload — edits swap colours but preserve everything else')
if (model.theme) {
  const original = model.theme.raw
  const origTextClasses = JSON.stringify((original as Record<string, unknown>).textClasses)
  const origVisualStyles = JSON.stringify((original as Record<string, unknown>).visualStyles)
  const origGood = (original as Record<string, unknown>).good
  const origName = (original as Record<string, unknown>).name

  // Simulate a Theme Lab edit: new palette + new background.
  const newPalette = generatePalette('#2E86DE', 'triadic', model.theme.dataColors.length)
  const edited = { ...model.theme, dataColors: newPalette, background: '#101418' }
  const out = applyThemeEdits(edited) as Record<string, unknown>

  check('dataColors replaced', JSON.stringify(out.dataColors) === JSON.stringify(newPalette))
  check('background updated', out.background === '#101418', String(out.background))
  check('foreground preserved', out.foreground === model.theme.foreground, String(out.foreground))
  check('textClasses preserved byte-for-byte', JSON.stringify(out.textClasses) === origTextClasses)
  check('visualStyles preserved byte-for-byte', JSON.stringify(out.visualStyles) === origVisualStyles)
  check('structural colour (good) preserved', JSON.stringify(out.good) === JSON.stringify(origGood))
  check('theme name preserved', out.name === origName, String(out.name))
  check('original object not mutated', (original as Record<string, unknown>).background === model.theme.raw.background && JSON.stringify((original as Record<string, unknown>).dataColors) !== JSON.stringify(newPalette))
  // The serialized output must be valid JSON that round-trips.
  const serialized = serializeTheme(out)
  let reparses = false
  try {
    reparses = JSON.stringify(JSON.parse(serialized)) === JSON.stringify(out)
  } catch {
    reparses = false
  }
  check('serialized theme is valid JSON that round-trips', reparses)
} else {
  check('theme available for deploy test', false)
}

// --- Summary -------------------------------------------------------------
section('Summary')
console.log(`  Pages: ${model.pages.length}, Visuals: ${totalVisuals}, Types: ${types.size}`)
console.log(`  ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
