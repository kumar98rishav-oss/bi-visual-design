// Colour-harmony generation and preset palettes for Theme Lab. Pure functions
// over hex strings — no dependencies.

export interface HSL {
  h: number // 0..360
  s: number // 0..100
  l: number // 0..100
}

export function hexToHsl(hex: string): HSL {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0x888888
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = Math.round(h * 60)
  if (h < 0) h += 360
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex({ h, s, l }: HSL): string {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

const wrap = (h: number) => ((h % 360) + 360) % 360

export type HarmonyScheme = 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'monochromatic' | 'splitComplement'

export const HARMONY_SCHEMES: { id: HarmonyScheme; label: string }[] = [
  { id: 'analogous', label: 'Analogous' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'splitComplement', label: 'Split complement' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'tetradic', label: 'Tetradic' },
  { id: 'monochromatic', label: 'Monochromatic' },
]

/**
 * Generate `count` harmonious colours from a base. Anchor hues come from the
 * scheme; we then fan out across those hues varying lightness/saturation so a
 * long palette (Power BI wants up to ~8 primary + more) stays distinct.
 */
export function generatePalette(baseHex: string, scheme: HarmonyScheme, count = 8): string[] {
  const base = hexToHsl(baseHex)
  const anchors: number[] = (() => {
    switch (scheme) {
      case 'complementary':
        return [base.h, wrap(base.h + 180)]
      case 'splitComplement':
        return [base.h, wrap(base.h + 150), wrap(base.h + 210)]
      case 'triadic':
        return [base.h, wrap(base.h + 120), wrap(base.h + 240)]
      case 'tetradic':
        return [base.h, wrap(base.h + 90), wrap(base.h + 180), wrap(base.h + 270)]
      case 'monochromatic':
        return [base.h]
      case 'analogous':
      default:
        return [base.h, wrap(base.h + 30), wrap(base.h - 30), wrap(base.h + 60)]
    }
  })()

  const out: string[] = []
  // Lightness steps give variety within each anchor hue.
  const lSteps = [0, -12, 12, -24, 24, -6, 6, -18]
  for (let i = 0; i < count; i++) {
    const h = anchors[i % anchors.length]
    const tier = Math.floor(i / anchors.length)
    const l = Math.max(24, Math.min(78, base.l + (lSteps[tier % lSteps.length] ?? 0)))
    const s = Math.max(30, Math.min(92, base.s + (scheme === 'monochromatic' ? -tier * 6 : 0)))
    out.push(hslToHex({ h, s, l: scheme === 'monochromatic' ? Math.max(20, Math.min(82, base.l + (i - count / 2) * 8)) : l }))
  }
  return out
}

export interface Preset {
  name: string
  dataColors: string[]
  background: string
  foreground: string
  tableAccent: string
}

export const PRESETS: Preset[] = [
  {
    name: 'Midnight',
    dataColors: ['#4C6EF5', '#12B886', '#FAB005', '#FA5252', '#7048E8', '#1098AD', '#E64980', '#82C91E'],
    background: '#0F1115',
    foreground: '#E7E9EE',
    tableAccent: '#4C6EF5',
  },
  {
    name: 'Slate & Amber',
    dataColors: ['#2C3E50', '#E67E22', '#3498DB', '#95A5A6', '#F1C40F', '#16A085', '#9B59B6', '#E74C3C'],
    background: '#FFFFFF',
    foreground: '#2C3E50',
    tableAccent: '#E67E22',
  },
  {
    name: 'Forest',
    dataColors: ['#2F6D4F', '#8FBF5A', '#D9A441', '#C05746', '#5B8A72', '#3A5A40', '#A3B18A', '#DAD7CD'],
    background: '#FBFBF7',
    foreground: '#2B2D2A',
    tableAccent: '#2F6D4F',
  },
  {
    name: 'Berry',
    dataColors: ['#7B2D6B', '#C13584', '#E1306C', '#F56040', '#FFB84C', '#5A2A82', '#2D6187', '#3AA8A0'],
    background: '#FFFFFF',
    foreground: '#3A2130',
    tableAccent: '#C13584',
  },
  {
    name: 'Ocean',
    dataColors: ['#12557E', '#1B9AAA', '#06D6A0', '#EF476F', '#FFD166', '#118AB2', '#073B4C', '#83C5BE'],
    background: '#F7FBFC',
    foreground: '#0B2530',
    tableAccent: '#12557E',
  },
]
