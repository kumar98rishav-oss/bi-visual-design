// Small, immutable helpers for patching a visual's raw PBIR JSON. Design Doctor
// fixes are expressed as `RawPatch` functions so they can be previewed on the
// mirror and written back verbatim on deploy.

import { encodeLiteralValue, makeLiteral } from '../pbir/exprTree.ts'
import type { JsonObject, Json } from '../pbir/types.ts'

export type RawPatch = (raw: JsonObject) => JsonObject
export type PathSeg = string | number

export function isObj(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Deep clone a JSON-safe value (raw PBIR is always JSON-safe). */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function getAtPath(root: Json, path: PathSeg[]): Json {
  let cur: Json = root
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === 'number') cur = cur[seg]
    else if (isObj(cur) && typeof seg === 'string') cur = cur[seg]
    else return undefined
  }
  return cur
}

/** Return a clone of `root` with `value` set at `path` (creating objects as needed). */
export function setAtPath(root: JsonObject, path: PathSeg[], value: Json): JsonObject {
  const next = clone(root)
  let cur: Json = next
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]
    if (Array.isArray(cur) && typeof seg === 'number') cur = cur[seg]
    else if (isObj(cur) && typeof seg === 'string') {
      if (!isObj(cur[seg]) && !Array.isArray(cur[seg])) cur[seg] = {}
      cur = cur[seg]
    }
  }
  const last = path[path.length - 1]
  if (Array.isArray(cur) && typeof last === 'number') cur[last] = value
  else if (isObj(cur) && typeof last === 'string') cur[last] = value
  return next
}

const round = (n: number, precision: number) => Math.round(n / precision) * precision

/** Round a visual's position x/y/width/height to `precision` (default 1px). */
export function roundPositionPatch(precision = 1): RawPatch {
  return (raw) => {
    if (!isObj(raw.position)) return raw
    const p = raw.position
    const next = clone(raw)
    const np = next.position as JsonObject
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      if (typeof p[k] === 'number') np[k] = round(p[k], precision)
    }
    return next
  }
}

/** Set position x and/or y (used by alignment fixes). */
export function setPositionPatch(x?: number, y?: number): RawPatch {
  return (raw) => {
    const next = clone(raw)
    if (!isObj(next.position)) next.position = {}
    const p = next.position as JsonObject
    if (x !== undefined) p.x = x
    if (y !== undefined) p.y = y
    return next
  }
}

/** Set the corner radius literal inside visualContainerObjects.border[0]. */
export function setRadiusPatch(value: number): RawPatch {
  return (raw) => {
    const next = clone(raw)
    const visual = isObj(next.visual) ? next.visual : (next.visual = {})
    const vco = isObj((visual as JsonObject).visualContainerObjects)
      ? ((visual as JsonObject).visualContainerObjects as JsonObject)
      : ((visual as JsonObject).visualContainerObjects = {})
    const border = Array.isArray(vco.border) ? vco.border : (vco.border = [{ properties: {} }])
    const first = isObj(border[0]) ? border[0] : (border[0] = { properties: {} })
    const props = isObj(first.properties) ? first.properties : (first.properties = {})
    ;(props as JsonObject).radius = makeLiteral(value)
    return next
  }
}

/** Replace a literal colour's Value string at a specific path. */
export function setColorLiteralPatch(valuePath: PathSeg[], newHex: string): RawPatch {
  return (raw) => setAtPath(raw, valuePath, encodeLiteralValue(newHex))
}
