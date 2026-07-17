// Checks the Design Doctor rules + fix patches against the real report and a
// crafted case. node --experimental-strip-types scripts/verify-doctor.ts

import { loadReport } from '../src/pbir/report.ts'
import { analyzeReport } from '../src/doctor/analyze.ts'
import { getAtPath, roundPositionPatch, setColorLiteralPatch, setRadiusPatch, setPositionPatch } from '../src/doctor/rawEdit.ts'
import { readColor, readLiteral } from '../src/pbir/exprTree.ts'
import type { JsonObject } from '../src/pbir/types.ts'
import { createNodeProvider } from './nodeProvider.ts'

const ROOT = process.argv[2] ?? 'E:/Data Analyst/POWER BI/Medical_Legal_BI_Project'
let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('\nrawEdit patches (unit)')
{
  const raw: JsonObject = {
    position: { x: 243.2399, y: 10, z: 0, height: 50.5, width: 100, tabOrder: 0 },
    visual: { visualType: 'card', visualContainerObjects: { border: [{ properties: { radius: { expr: { Literal: { Value: '12D' } } } } }] } },
  }
  const rounded = roundPositionPatch(1)(raw) as JsonObject
  const rp = rounded.position as JsonObject
  check('round position → integers', rp.x === 243 && rp.height === 51)
  check('round preserves z/tabOrder', rp.z === 0 && rp.tabOrder === 0)
  check('round does not mutate original', (raw.position as JsonObject).x === 243.2399)

  const rad = setRadiusPatch(15)(raw) as JsonObject
  const radVal = readLiteral(((rad.visual as JsonObject).visualContainerObjects as JsonObject).border && (((rad.visual as JsonObject).visualContainerObjects as JsonObject).border as JsonObject[])[0].properties && ((((rad.visual as JsonObject).visualContainerObjects as JsonObject).border as JsonObject[])[0].properties as JsonObject).radius)
  check('set radius → 15', radVal === 15)

  const withColor: JsonObject = { visual: { visualContainerObjects: { border: [{ properties: { color: { solid: { color: { expr: { Literal: { Value: "'#4C6EF6'" } } } } } } }] } } }
  const path = ['visual', 'visualContainerObjects', 'border', 0, 'properties', 'color', 'solid', 'color', 'expr', 'Literal', 'Value']
  const fixed = setColorLiteralPatch(path, '#4C6EF5')(withColor) as JsonObject
  check('set colour literal → new hex', getAtPath(fixed, path) === "'#4C6EF5'")
  check('colour patch preserves solid wrapper', !!readColor(getAtPath(fixed, ['visual', 'visualContainerObjects', 'border', 0, 'properties', 'color'])))

  const moved = setPositionPatch(50, undefined)(raw) as JsonObject
  check('setPosition x only', (moved.position as JsonObject).x === 50 && (moved.position as JsonObject).y === 10)
}

console.log(`\nAnalyze real report: ${ROOT}`)
{
  const model = await loadReport(createNodeProvider(ROOT), 'Medical_Legal_Project')
  const findings = analyzeReport(model)
  const byRule = (r: string) => findings.filter((f) => f.rule === r).length
  console.log(`  rules → misalign:${byRule('misalign')} radius:${byRule('radius')} offpalette:${byRule('offpalette')} subpixel:${byRule('subpixel')}`)
  check('produced findings', findings.length > 0, `${findings.length} total`)
  check('real report has sub-pixel positions to fix', byRule('subpixel') > 0)
  check('every finding carries at least one patch', findings.every((f) => f.patches.length > 0))
  check('every finding targets real visuals', findings.every((f) => f.visualIds.length > 0))

  // Applying a subpixel fix actually removes the fractional part.
  const sp = findings.find((f) => f.rule === 'subpixel')
  if (sp) {
    const v = model.pages.flatMap((p) => p.visuals).find((x) => x.id === sp.patches[0].visualId)!
    const fixed = sp.patches[0].patch(v.raw) as JsonObject
    const pos = fixed.position as JsonObject
    const clean = (['x', 'y', 'width', 'height'] as const).every((k) => typeof pos[k] !== 'number' || Number.isInteger(pos[k]))
    check('subpixel fix yields integer position', clean)
  } else {
    check('found a subpixel finding to test', false)
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
