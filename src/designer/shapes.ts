// Builds `shape` visuals (the panel/decoration primitive) in the exact encoding
// Power BI Desktop itself writes — verified by round-tripping a Desktop-drawn
// rectangle out of a real report.
//
// The one non-obvious requirement: the `fill` object needs
//   "selector": { "id": "default" }
// as a SIBLING of `properties`. Without it Desktop silently discards the fill
// and paints a default colour. (That exact omission is what made our first
// probe render dark instead of green.)

import { makeLiteral, makeLiteralColor, makeThemeColor } from '../pbir/exprTree.ts'
import type { JsonObject } from '../pbir/types.ts'

const VISUAL_SCHEMA =
  'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json'

export type TileShape = 'rectangle' | 'rectangleRounded' | 'ellipse' | 'triangle' | 'arrow'

export type FillSpec =
  | { kind: 'literal'; hex: string }
  | { kind: 'theme'; colorId: number; percent?: number }

export interface ShapeSpec {
  id: string
  x: number
  y: number
  width: number
  height: number
  z: number
  tabOrder?: number
  tileShape?: TileShape
  fill?: FillSpec
  shadow?: boolean
  /** Outline colour; omitted means no visible outline. */
  strokeHex?: string
  strokeWeight?: number
  /** 0..100, where 100 is fully transparent. */
  transparency?: number
}

function fillColorNode(fill: FillSpec): JsonObject {
  return fill.kind === 'literal'
    ? makeLiteralColor(fill.hex)
    : makeThemeColor(fill.colorId, fill.percent ?? 0)
}

/** Build a complete `visual.json` body for a shape (panel / decoration). */
export function buildShapeVisual(spec: ShapeSpec): JsonObject {
  const objects: JsonObject = {
    shape: [{ properties: { tileShape: makeLiteral(spec.tileShape ?? 'rectangleRounded') } }],
    rotation: [{ properties: { shapeAngle: { expr: { Literal: { Value: '0L' } } } } }],
  }

  if (spec.fill) {
    const props: JsonObject = { fillColor: fillColorNode(spec.fill) }
    if (spec.transparency !== undefined) props.transparency = makeLiteral(spec.transparency)
    // `selector` is mandatory — see the note at the top of this file.
    objects.fill = [{ properties: props, selector: { id: 'default' } }]
  }

  if (spec.shadow) {
    objects.shadow = [{ properties: { show: makeLiteral(true) } }]
  }

  if (spec.strokeHex) {
    objects.outline = [
      {
        properties: {
          show: makeLiteral(true),
          lineColor: makeLiteralColor(spec.strokeHex),
          weight: makeLiteral(spec.strokeWeight ?? 1),
        },
        selector: { id: 'default' },
      },
    ]
  }

  return {
    $schema: VISUAL_SCHEMA,
    name: spec.id,
    position: {
      x: spec.x,
      y: spec.y,
      z: spec.z,
      height: spec.height,
      width: spec.width,
      tabOrder: spec.tabOrder ?? 0,
    },
    visual: {
      visualType: 'shape',
      objects,
      drillFilterOtherVisuals: true,
    },
  }
}

/** Convenience: a rounded container panel for a layout slot. */
export function buildPanel(
  spec: Omit<ShapeSpec, 'tileShape' | 'shadow'> & { shadow?: boolean },
): JsonObject {
  return buildShapeVisual({ tileShape: 'rectangleRounded', shadow: true, ...spec })
}
