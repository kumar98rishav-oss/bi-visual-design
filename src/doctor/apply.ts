// Applies accumulated Design Doctor fixes (patched raw JSON per visual) onto the
// report model so the mirror previews them live.

import type { JsonObject, ReportModel, VisualNode } from '../pbir/types.ts'
import { isObj } from './rawEdit.ts'

export type DoctorEdits = Record<string, JsonObject>

function patchedNode(v: VisualNode, raw: JsonObject): VisualNode {
  const p = isObj(raw.position) ? raw.position : {}
  const num = (x: unknown, d: number) => (typeof x === 'number' ? x : d)
  const position = {
    x: num(p.x, v.position.x),
    y: num(p.y, v.position.y),
    z: num(p.z, v.position.z),
    height: num(p.height, v.position.height),
    width: num(p.width, v.position.width),
    tabOrder: typeof p.tabOrder === 'number' ? p.tabOrder : v.position.tabOrder,
  }
  return { ...v, raw, position }
}

export function applyDoctorEdits(report: ReportModel, edits: DoctorEdits): ReportModel {
  if (Object.keys(edits).length === 0) return report
  return {
    ...report,
    pages: report.pages.map((page) => ({
      ...page,
      visuals: page.visuals.map((v) => (edits[v.id] ? patchedNode(v, edits[v.id]) : v)),
    })),
  }
}
