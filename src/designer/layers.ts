// Layer stack model — the data behind the Layers panel (Selection-pane style)
// and the send-forward / send-backward controls.
//
// PBIR stores stacking order as an integer `position.z` on every visual. We
// model the page as an ordered array of ids, BACK-TO-FRONT (index 0 = furthest
// back), because that maps directly onto ascending z. The UI displays it
// reversed, so the front-most layer sits at the top of the list — the
// convention every design tool uses.

import type { VisualNode } from '../pbir/types.ts'

export type LayerKind = 'panel' | 'data' | 'decor' | 'group'

export interface Layer {
  id: string
  kind: LayerKind
  label: string
  z: number
}

/** Classify a visual for the layer list (icon + grouping). */
export function layerKind(v: VisualNode): LayerKind {
  if (v.visualType === 'visualGroup') return 'group'
  if (v.visualType === 'shape' || v.visualType === 'basicShape' || v.visualType === 'image') return 'panel'
  if (v.visualType === 'textbox' || v.visualType === 'actionButton' || v.visualType === 'pageNavigator') return 'decor'
  return 'data'
}

function labelOf(v: VisualNode): string {
  const base =
    v.visualType === 'visualGroup'
      ? v.name
      : v.projections[0]
        ? `${v.visualType} · ${v.projections[0].property}`
        : v.visualType
  return v.isHidden ? `${base} · hidden` : base
}

/** Build the layer list for a page, ordered BACK-TO-FRONT. */
export function buildLayers(visuals: readonly VisualNode[]): Layer[] {
  return [...visuals]
    .sort((a, b) => a.position.z - b.position.z || (a.position.tabOrder ?? 0) - (b.position.tabOrder ?? 0))
    .map((v) => ({ id: v.id, kind: layerKind(v), label: labelOf(v), z: v.position.z }))
}

// ---------------------------------------------------------------------------
// Reordering — all pure, all return a new array (back-to-front)
// ---------------------------------------------------------------------------

function swap(order: string[], i: number, j: number): string[] {
  const next = order.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function bringForward(order: readonly string[], id: string): string[] {
  const i = order.indexOf(id)
  if (i < 0 || i === order.length - 1) return order.slice()
  return swap(order.slice(), i, i + 1)
}

export function sendBackward(order: readonly string[], id: string): string[] {
  const i = order.indexOf(id)
  if (i <= 0) return order.slice()
  return swap(order.slice(), i, i - 1)
}

export function bringToFront(order: readonly string[], id: string): string[] {
  const i = order.indexOf(id)
  if (i < 0) return order.slice()
  const next = order.slice()
  next.splice(i, 1)
  next.push(id)
  return next
}

export function sendToBack(order: readonly string[], id: string): string[] {
  const i = order.indexOf(id)
  if (i < 0) return order.slice()
  const next = order.slice()
  next.splice(i, 1)
  next.unshift(id)
  return next
}

/** Move `id` to a specific index in the back-to-front array (drag & drop). */
export function moveTo(order: readonly string[], id: string, index: number): string[] {
  const i = order.indexOf(id)
  if (i < 0) return order.slice()
  const next = order.slice()
  next.splice(i, 1)
  const clamped = Math.max(0, Math.min(index, next.length))
  next.splice(clamped, 0, id)
  return next
}

// ---------------------------------------------------------------------------
// z assignment
// ---------------------------------------------------------------------------

/** Sequential z from a back-to-front order: index 0 → z 0. */
export function assignZ(order: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  order.forEach((id, i) => out.set(id, i))
  return out
}

/**
 * Which visuals actually need writing: compares the target z against what each
 * visual currently stores, so a reorder only touches the files it must.
 */
export function changedZ(
  visuals: readonly VisualNode[],
  target: ReadonlyMap<string, number>,
): { visual: VisualNode; z: number }[] {
  const out: { visual: VisualNode; z: number }[] = []
  for (const v of visuals) {
    const z = target.get(v.id)
    if (z !== undefined && z !== v.position.z) out.push({ visual: v, z })
  }
  return out
}
