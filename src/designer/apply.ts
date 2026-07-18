// Folds pending Designer edits (newly minted panels, restacked z) into the
// report model so the mirror previews them before anything is written to disk.

import type { JsonObject, ReportModel, VisualNode } from '../pbir/types.ts'
import { visualPath } from './deploy.ts'

export interface PendingPanel {
  pageId: string
  id: string
  raw: JsonObject
}

/** Wrap a minted shape's raw JSON as a VisualNode the renderer can draw. */
export function panelToNode(reportDir: string, pageId: string, id: string, raw: JsonObject): VisualNode {
  const p = (typeof raw.position === 'object' && raw.position !== null ? raw.position : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  return {
    id,
    pageId,
    file: visualPath(reportDir, pageId, id),
    name: 'Panel',
    visualType: 'shape',
    projections: [],
    raw,
    position: {
      x: num(p.x, 0),
      y: num(p.y, 0),
      z: num(p.z, 0),
      height: num(p.height, 0),
      width: num(p.width, 0),
      tabOrder: num(p.tabOrder, 0),
    },
  }
}

/**
 * Add pending panels to their pages and apply z overrides, then re-sort each
 * page so the mirror paints in the new stacking order.
 */
export function applyDesignerEdits(
  report: ReportModel,
  panels: readonly PendingPanel[],
  zOverrides: Readonly<Record<string, number>>,
): ReportModel {
  if (panels.length === 0 && Object.keys(zOverrides).length === 0) return report

  return {
    ...report,
    pages: report.pages.map((page) => {
      const added = panels
        .filter((p) => p.pageId === page.id)
        .map((p) => panelToNode(report.reportDir, page.id, p.id, p.raw))

      const visuals = [...page.visuals, ...added].map((v) => {
        const z = zOverrides[v.id]
        if (z === undefined || z === v.position.z) return v
        const position = { ...v.position, z }
        const rawPos =
          typeof v.raw.position === 'object' && v.raw.position !== null && !Array.isArray(v.raw.position)
            ? (v.raw.position as JsonObject)
            : {}
        return { ...v, position, raw: { ...v.raw, position: { ...rawPos, z } } }
      })

      visuals.sort((a, b) => a.position.z - b.position.z || (a.position.tabOrder ?? 0) - (b.position.tabOrder ?? 0))
      return { ...page, visuals }
    }),
  }
}
