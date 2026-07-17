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

/** Standard Power BI theme slots (ColorId 1..8 map to these before dataColors). */
function themeSlotHex(theme: Theme | null, colorId: number): string {
  if (!theme) return '#888888'
  // ColorId is 1-based. Power BI's first palette entries are the named theme
  // colors; from index 1 it flows into dataColors. We map pragmatically:
  //   1 -> foreground, 2 -> background, 3.. -> dataColors, with a fallback.
  if (colorId === 1 && theme.foreground) return theme.foreground
  if (colorId === 2 && theme.background) return theme.background
  const idx = colorId - 1
  if (idx >= 0 && idx < theme.dataColors.length) return theme.dataColors[idx]
  return theme.dataColors[(Math.max(0, colorId - 1)) % Math.max(1, theme.dataColors.length)] ?? '#888888'
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
