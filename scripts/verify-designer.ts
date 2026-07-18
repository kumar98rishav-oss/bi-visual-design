// Verifies the Designer primitives: id minting, the shape encoding (checked
// against the REAL Desktop-authored rectangle from the probe copy), and the
// layer/z-order engine.
//   node --experimental-strip-types scripts/verify-designer.ts

import { readFile } from 'node:fs/promises'
import { mintId, mintIds, isPbirId } from '../src/designer/ids.ts'
import { buildShapeVisual, buildPanel } from '../src/designer/shapes.ts'
import {
  buildLayers, bringForward, sendBackward, bringToFront, sendToBack, moveTo,
  assignZ, changedZ, layerKind,
} from '../src/designer/layers.ts'
import { visualPath, newVisualEdits, zEdits } from '../src/designer/deploy.ts'
import type { JsonObject, VisualNode } from '../src/pbir/types.ts'

const PROBE =
  'E:/Data Analyst/POWER BI/Medical_Legal_BVD_TEST/Medical_Legal_Project.Report/definition/pages/aef2bde2d368fb98b6dd/visuals/4963dc4067ece8e4399c/visual.json'

let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  if (!cond) failures++
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('\nId minting')
{
  const id = mintId()
  check('mints a 20-hex id', isPbirId(id), id)
  const many = mintIds(500)
  check('500 ids are unique', new Set(many).size === 500)
  check('avoids taken ids', !mintIds(50, new Set(many)).some((i) => many.includes(i)))
}

console.log('\nShape encoding vs Desktop ground truth')
{
  const mine = buildShapeVisual({
    id: '4963dc4067ece8e4399c', x: 80, y: 360, width: 320, height: 200, z: 1, tabOrder: 9003,
    tileShape: 'rectangle', fill: { kind: 'theme', colorId: 5, percent: 0.2 }, shadow: true,
  }) as Record<string, any>

  let desktop: Record<string, any> | null = null
  try {
    desktop = JSON.parse((await readFile(PROBE, 'utf8')).replace(/^﻿/, ''))
  } catch {
    console.log('  (probe file unavailable — skipping ground-truth diff)')
  }

  if (desktop) {
    const dv = desktop.visual, mv = mine.visual
    check('visualType matches', mv.visualType === dv.visualType, mv.visualType)
    check('position matches', JSON.stringify(mine.position) === JSON.stringify(desktop.position))
    check('shape.tileShape matches', JSON.stringify(mv.objects.shape) === JSON.stringify(dv.objects.shape))
    check('rotation matches', JSON.stringify(mv.objects.rotation) === JSON.stringify(dv.objects.rotation))
    check('fill matches EXACTLY (incl. selector)', JSON.stringify(mv.objects.fill) === JSON.stringify(dv.objects.fill),
      JSON.stringify(mv.objects.fill))
    check('shadow matches', JSON.stringify(mv.objects.shadow) === JSON.stringify(dv.objects.shadow))
    check('drillFilterOtherVisuals matches', mv.drillFilterOtherVisuals === dv.drillFilterOtherVisuals)
  }

  // The selector is the thing that silently broke our first probe — guard it.
  const panel = buildPanel({ id: 'a'.repeat(20), x: 0, y: 0, width: 100, height: 50, z: 0, fill: { kind: 'literal', hex: '#12B886' } }) as Record<string, any>
  check('panel fill carries selector {id:"default"}', panel.visual.objects.fill[0].selector?.id === 'default')
  check('panel is rounded by default', JSON.stringify(panel.visual.objects.shape).includes('rectangleRounded'))
  check('panel has shadow by default', !!panel.visual.objects.shadow)
  check('literal fill encodes hex', JSON.stringify(panel.visual.objects.fill).includes("'#12B886'"))
  check('no fill object when fill omitted',
    !(buildShapeVisual({ id: 'b'.repeat(20), x: 0, y: 0, width: 1, height: 1, z: 0 }) as any).visual.objects.fill)
}

console.log('\nLayer stack + reordering')
{
  const mk = (id: string, z: number, type = 'card'): VisualNode => ({
    id, pageId: 'p', file: `f/${id}.json`, name: id, visualType: type,
    position: { x: 0, y: 0, z, height: 10, width: 10, tabOrder: 0 },
    projections: [], raw: { position: { x: 0, y: 0, z, height: 10, width: 10, tabOrder: 0 }, keep: 'me' } as JsonObject,
  })
  const visuals = [mk('c', 2), mk('a', 0), mk('b', 1)]
  const layers = buildLayers(visuals)
  check('layers ordered back-to-front by z', layers.map((l) => l.id).join('') === 'abc')

  const order = layers.map((l) => l.id)
  check('bringForward a → b a c', bringForward(order, 'a').join('') === 'bac')
  check('sendBackward c → a c b', sendBackward(order, 'c').join('') === 'acb')
  check('bringToFront a → b c a', bringToFront(order, 'a').join('') === 'bca')
  check('sendToBack c → c a b', sendToBack(order, 'c').join('') === 'cab')
  check('moveTo b → index 0', moveTo(order, 'b', 0).join('') === 'bac')
  check('front element cannot go further forward', bringForward(order, 'c').join('') === 'abc')
  check('back element cannot go further back', sendBackward(order, 'a').join('') === 'abc')

  const target = assignZ(['b', 'c', 'a']) // a is now front
  check('assignZ is sequential', target.get('b') === 0 && target.get('c') === 1 && target.get('a') === 2)
  const changes = changedZ(visuals, target)
  check('only changed visuals are written', changes.length === 3, `${changes.length} changed`)
  const unchanged = changedZ(visuals, assignZ(['a', 'b', 'c']))
  check('no-op reorder writes nothing', unchanged.length === 0)

  check('layerKind classifies', layerKind(mk('s', 0, 'shape')) === 'panel' && layerKind(mk('t', 0, 'textbox')) === 'decor' && layerKind(mk('d', 0, 'lineChart')) === 'data')

  // z edits preserve the rest of the file
  const edits = zEdits(changedZ(visuals, target))
  const aEdit = edits.find((e) => e.file.includes('a.json'))!
  const pos = (aEdit.raw as any).position
  check('z edit updates z', pos.z === 2)
  check('z edit preserves x/y/w/h/tabOrder', pos.x === 0 && pos.height === 10 && pos.tabOrder === 0)
  check('z edit preserves unrelated keys', (aEdit.raw as any).keep === 'me')
}

console.log('\nNew-visual paths')
{
  const p = visualPath('My.Report', 'page1', 'abc')
  check('path shape is correct', p === 'My.Report/definition/pages/page1/visuals/abc/visual.json', p)
  const edits = newVisualEdits('My.Report', 'page1', [{ id: 'x'.repeat(20), raw: { a: 1 } }])
  check('new edits flagged isNew', edits[0].isNew === true)
  check('new edit path includes minted id', edits[0].file.includes('x'.repeat(20)))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
