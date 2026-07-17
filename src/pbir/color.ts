// Resolve PBIR {@link ColorValue}s to concrete CSS hex strings using the active
// theme palette, applying Power BI's tint/shade "Percent" convention.

import type { ColorValue } from './exprTree.ts'
import type { Theme } from './types.ts'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const short = /^#?([0-9a-f]{3})$/i.exec(hex.trim())
  if (short) {
    const [r, g, b] = short[1].split('').map((c) => parseInt(c + c, 16))
    return { r, g, b }
  }
  return null
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/**
 * Apply Power BI's shade/tint percent. Positive percent darkens toward black,
 * negative lightens toward white. `percent` is a fraction in roughly [-1, 1].
 */
export function shade(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb || !percent) return hex.toUpperCase()
  const t = clamp(Math.abs(percent), 0, 1)
  const target = percent > 0 ? 0 : 255
  return rgbToHex(
    rgb.r + (target - rgb.r) * t,
    rgb.g + (target - rgb.g) * t,
    rgb.b + (target - rgb.b) * t,
  )
}

/**
 * Resolve a theme ColorId to a base hex. In Power BI the format-pane color
 * picker exposes the theme's palette as "Theme color 1..N", and a pick is
 * stored as `ThemeDataColor{ColorId}` — 1-based into the dataColors array
 * (ColorId 1 -> dataColors[0]). Verified against a real report: only ColorId
 * values >= 1 ever appear, and structural colors use their own fields, so we
 * index dataColors directly and wrap defensively if out of range.
 */
function themeSlotHex(theme: Theme | null, colorId: number): string {
  const palette = theme?.dataColors ?? []
  if (palette.length === 0) return '#888888'
  const idx = colorId - 1
  if (idx >= 0 && idx < palette.length) return palette[idx]
  return palette[((idx % palette.length) + palette.length) % palette.length] ?? '#888888'
}

/** Resolve any {@link ColorValue} to a concrete hex, given the active theme. */
export function resolveColor(color: ColorValue | undefined, theme: Theme | null): string | undefined {
  if (!color) return undefined
  if (color.kind === 'literal') return color.hex.toUpperCase()
  return shade(themeSlotHex(theme, color.colorId), color.percent)
}

/** The nth data color (0-based), for placeholder chart series. */
export function dataColor(theme: Theme | null, i: number): string {
  const palette = theme?.dataColors ?? ['#73B761', '#4A588A', '#ECC846', '#CD4C46', '#71AFE2']
  return palette[i % palette.length] ?? '#888888'
}
