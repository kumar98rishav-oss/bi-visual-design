// Pulls render-ready "chrome" (titles, backgrounds, borders) out of raw PBIR
// nodes. Values that are data-bound (e.g. a dynamic title bound to a measure)
// can't be evaluated without data — we surface a labelled placeholder instead,
// true to the "designer works with lorem ipsum" model.

import { readColor, readLiteral } from '../pbir/exprTree.ts'
import { resolveColor } from '../pbir/color.ts'
import type { JsonObject, PageNode, Theme, VisualNode } from '../pbir/types.ts'

function isObj(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** First entry's `properties` object for a formatting slot (objects are arrays). */
function firstProps(slot: unknown): JsonObject | undefined {
  if (!Array.isArray(slot) || slot.length === 0) return undefined
  const first = slot[0]
  return isObj(first) && isObj(first.properties) ? first.properties : undefined
}

/** Detect a data-bound value (Measure/Column) inside an expr wrapper. */
function boundLabel(wrapper: unknown): string | undefined {
  if (!isObj(wrapper) || !isObj(wrapper.expr)) return undefined
  const expr = wrapper.expr
  if (isObj(expr.Measure) && typeof expr.Measure.Property === 'string') return expr.Measure.Property
  if (isObj(expr.Column) && typeof expr.Column.Property === 'string') return expr.Column.Property
  return undefined
}

export interface TitleChrome {
  show: boolean
  text: string
  /** True when text is a data binding we can't evaluate (dynamic title). */
  dynamic: boolean
  color?: string
  background?: string
  align: 'left' | 'center' | 'right'
  fontSize?: number
}

export interface VisualChrome {
  title?: TitleChrome
  background?: string
  border: { show: boolean; color?: string; radius: number }
}

export function readVisualChrome(visual: VisualNode, theme: Theme | null): VisualChrome {
  const v = isObj(visual.raw.visual) ? visual.raw.visual : {}
  const vco = isObj(v.visualContainerObjects) ? v.visualContainerObjects : {}

  // Title
  let title: TitleChrome | undefined
  const tp = firstProps(vco.title)
  if (tp) {
    const show = readLiteral(tp.show)
    const bound = boundLabel(tp.text)
    const literalText = readLiteral(tp.text)
    const align = readLiteral(tp.alignment)
    const fontSize = readLiteral(tp.fontSize)
    title = {
      show: show !== false,
      text: bound ?? (typeof literalText === 'string' ? literalText : ''),
      dynamic: !!bound,
      color: resolveColor(readColor(tp.fontColor), theme),
      background: resolveColor(readColor(tp.background), theme),
      align: align === 'left' || align === 'center' || align === 'right' ? align : 'left',
      fontSize: typeof fontSize === 'number' ? fontSize : undefined,
    }
  }

  // Border
  const bp = firstProps(vco.border)
  const borderShow = bp ? readLiteral(bp.show) : undefined
  const borderRadius = bp ? readLiteral(bp.radius) : undefined
  const border = {
    show: borderShow === true,
    color: bp ? resolveColor(readColor(bp.color), theme) : undefined,
    radius: typeof borderRadius === 'number' ? borderRadius : 0,
  }

  // Visual background (visualContainerObjects.background)
  const bgp = firstProps(vco.background)
  const background = bgp ? resolveColor(readColor(bgp.color), theme) : undefined

  return { title, background, border }
}

export interface ShapeStyle {
  fill?: string
  radius: number
  shadow: boolean
  stroke?: string
}

/**
 * Style for a `shape` / `basicShape` visual. These are our panel primitive, and
 * their fill lives in `visual.objects.fill` (NOT visualContainerObjects), so
 * they need their own reader.
 */
export function readShapeStyle(visual: VisualNode, theme: Theme | null): ShapeStyle | null {
  if (visual.visualType !== 'shape' && visual.visualType !== 'basicShape') return null
  const v = isObj(visual.raw.visual) ? visual.raw.visual : {}
  const objects = isObj(v.objects) ? v.objects : {}

  const fillProps = firstProps(objects.fill)
  const fill = fillProps ? resolveColor(readColor(fillProps.fillColor), theme) : undefined

  const shapeProps = firstProps(objects.shape)
  const tile = shapeProps ? readLiteral(shapeProps.tileShape) : undefined
  // Power BI implies the corner radius from the tile shape rather than storing
  // it; 12px reads true to how Desktop draws a rounded rectangle.
  const rounded = typeof tile === 'string' && tile.toLowerCase().includes('rounded')

  // Legacy basicShape keeps its radius explicitly on `line.roundEdge`.
  const lineProps = firstProps(objects.line)
  const roundEdge = lineProps ? readLiteral(lineProps.roundEdge) : undefined

  const outlineProps = firstProps(objects.outline)
  const stroke = outlineProps ? resolveColor(readColor(outlineProps.lineColor), theme) : undefined

  const shadowProps = firstProps(objects.shadow)
  const shadow = shadowProps ? readLiteral(shadowProps.show) === true : false

  return {
    fill,
    radius: typeof roundEdge === 'number' ? roundEdge : rounded ? 12 : 0,
    shadow,
    stroke,
  }
}

export interface PageChrome {
  background?: string
  /** 0..100 transparency of the background fill, if specified. */
  backgroundTransparency?: number
}

export function readPageChrome(page: PageNode, theme: Theme | null): PageChrome {
  const objects = isObj(page.raw.objects) ? page.raw.objects : {}
  const props = firstProps(objects.background)
  if (!props) return {}
  const transparency = readLiteral(props.transparency)
  return {
    background: resolveColor(readColor(props.color), theme),
    backgroundTransparency: typeof transparency === 'number' ? transparency : undefined,
  }
}
