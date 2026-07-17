// Read/write helpers for the PBIR "expression tree" value format.
//
// PBIR wraps nearly every formatting value in a small tree. The three shapes we
// care about:
//
//   Literal:      { "expr": { "Literal": { "Value": "28D" } } }
//   Themed color: { "solid": { "color": { "expr": { "ThemeDataColor": { "ColorId": 1, "Percent": 0 } } } } }
//   Fixed color:  { "solid": { "color": { "expr": { "Literal": { "Value": "'#FFBF35'" } } } } }
//
// Literal *values* are strings with a type suffix, and strings additionally
// carry embedded single quotes:
//   "28D" -> 28   |   "0D" -> 0   |   "15D" -> 15   |   "true" -> true
//   "'#FFBF35'" -> "#FFBF35"   |   "'center'" -> "center"   |   "''" -> ""
//
// We keep the round-trip lossless: reading then writing the same value yields
// byte-identical output for the value we touched.

import type { JsonObject } from './types.ts'

export type LiteralValue = number | boolean | string

/** A resolved color: either a fixed hex or a reference into the theme palette. */
export type ColorValue =
  | { kind: 'literal'; hex: string }
  | { kind: 'theme'; colorId: number; percent: number }

function isObj(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ---------------------------------------------------------------------------
// Literal value <-> string encoding
// ---------------------------------------------------------------------------

/** Decode a PBIR literal string ("28D", "true", "'center'") to a JS value. */
export function decodeLiteralValue(raw: string): LiteralValue {
  if (raw === 'true') return true
  if (raw === 'false') return false

  // Quoted string: strip the surrounding single quotes. Power BI escapes an
  // embedded single quote by doubling it ('' inside the string).
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'")
  }

  // Numeric with a type suffix: D (double), L (long), or bare.
  const numMatch = /^(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(D|L)?$/.exec(raw)
  if (numMatch) return Number(numMatch[1])

  // Unknown shape — hand back the raw string rather than guessing.
  return raw
}

/** Encode a JS value back into the PBIR literal string form. */
export function encodeLiteralValue(value: LiteralValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return `${value}D`
  // String: single-quote wrap, doubling any embedded single quotes.
  return `'${value.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Pull a literal JS value out of an `{ expr: { Literal: { Value } } }` wrapper. */
export function readLiteral(wrapper: unknown): LiteralValue | undefined {
  if (!isObj(wrapper)) return undefined
  const expr = wrapper.expr
  if (!isObj(expr)) return undefined
  const lit = expr.Literal
  if (!isObj(lit) || typeof lit.Value !== 'string') return undefined
  return decodeLiteralValue(lit.Value)
}

/**
 * Resolve a color property to a {@link ColorValue}. Handles both fixed hex
 * literals and theme-palette references. Returns undefined if the shape is not
 * a solid color we recognise.
 */
export function readColor(wrapper: unknown): ColorValue | undefined {
  if (!isObj(wrapper)) return undefined
  const solid = wrapper.solid
  if (!isObj(solid)) return undefined
  const color = solid.color
  if (!isObj(color)) return undefined
  const expr = color.expr
  if (!isObj(expr)) return undefined

  if (isObj(expr.ThemeDataColor)) {
    const t = expr.ThemeDataColor
    const colorId = typeof t.ColorId === 'number' ? t.ColorId : 0
    const percent = typeof t.Percent === 'number' ? t.Percent : 0
    return { kind: 'theme', colorId, percent }
  }
  if (isObj(expr.Literal) && typeof expr.Literal.Value === 'string') {
    const hex = decodeLiteralValue(expr.Literal.Value)
    if (typeof hex === 'string') return { kind: 'literal', hex }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Writing (immutable — returns new nodes, never mutates input)
// ---------------------------------------------------------------------------

/** Build a fresh literal wrapper for a JS value. */
export function makeLiteral(value: LiteralValue): JsonObject {
  return { expr: { Literal: { Value: encodeLiteralValue(value) } } }
}

/** Build a fresh solid-color wrapper (fixed hex). */
export function makeLiteralColor(hex: string): JsonObject {
  return { solid: { color: { expr: { Literal: { Value: encodeLiteralValue(hex) } } } } }
}

/** Build a fresh solid-color wrapper (theme palette reference). */
export function makeThemeColor(colorId: number, percent = 0): JsonObject {
  return { solid: { color: { expr: { ThemeDataColor: { ColorId: colorId, Percent: percent } } } } }
}
