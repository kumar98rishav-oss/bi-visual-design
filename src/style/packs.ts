// Style packs — the "look" half of a design (the Layout packs are the "shape"
// half). A pack is a compact set of design decisions; `theme.ts` expands it
// into a full Power BI theme (palette + textClasses + visualStyles), so one
// deploy restyles every visual in the report at once.

export interface StylePack {
  id: string
  name: string
  blurb: string

  /** Chart series palette. */
  dataColors: string[]
  /** Page canvas. */
  background: string
  /** Primary text. */
  foreground: string
  tableAccent: string
  good: string
  bad: string
  neutral: string

  /** Visual container surface. */
  cardBg: string
  /** Empty string = no visible border. */
  cardBorder: string
  cardRadius: number
  shadow: boolean

  fontFace: string
  /** Big KPI number. */
  calloutSize: number
  titleSize: number
  labelSize: number
  titleColor: string
  labelColor: string
  /** Table row separators / subtle rules. */
  gridColor: string
  /** Header band behind table column names. */
  headerBg: string
}

export const STYLE_PACKS: StylePack[] = [
  {
    id: 'corporate-navy',
    name: 'Corporate Navy',
    blurb: 'Navy + sky + coral on white cards. Crisp, executive, boardroom-ready.',
    dataColors: ['#1B3B8B', '#6BA3E8', '#F0A08C', '#2E9E8F', '#F2C14E', '#8E7CC3', '#5B8DEF', '#C0553B'],
    background: '#F4F5FB',
    foreground: '#1A2138',
    tableAccent: '#1B3B8B',
    good: '#1E9E6A',
    bad: '#D6455D',
    neutral: '#8A93A8',
    cardBg: '#FFFFFF',
    cardBorder: '#E4E7F2',
    cardRadius: 8,
    shadow: false,
    fontFace: 'Segoe UI',
    calloutSize: 28,
    titleSize: 12,
    labelSize: 10,
    titleColor: '#1A2138',
    labelColor: '#6B7490',
    gridColor: '#EDEFF6',
    headerBg: '#F4F5FB',
  },
  {
    id: 'midnight-glass',
    name: 'Midnight Glass',
    blurb: 'Dark canvas, luminous accents — the modern SaaS dashboard look.',
    dataColors: ['#5B8DEF', '#2DD4A0', '#F2C14E', '#F06A6A', '#A78BFA', '#38BDF8', '#F472B6', '#84CC16'],
    background: '#0F1320',
    foreground: '#E8EBF5',
    tableAccent: '#5B8DEF',
    good: '#2DD4A0',
    bad: '#F06A6A',
    neutral: '#7A849B',
    cardBg: '#171C2C',
    cardBorder: '#252C42',
    cardRadius: 12,
    shadow: true,
    fontFace: 'Segoe UI',
    calloutSize: 30,
    titleSize: 12,
    labelSize: 10,
    titleColor: '#E8EBF5',
    labelColor: '#8B94AC',
    gridColor: '#252C42',
    headerBg: '#1D2438',
  },
  {
    id: 'warm-minimal',
    name: 'Warm Minimal',
    blurb: 'Cream canvas, earthy accents, no shadows — quiet and editorial.',
    dataColors: ['#B5643C', '#3F6C51', '#D9A441', '#7A6A58', '#8C5B6B', '#4E7B8C', '#A8894A', '#5F5A4E'],
    background: '#FAF7F1',
    foreground: '#2E2A24',
    tableAccent: '#B5643C',
    good: '#3F6C51',
    bad: '#B5453C',
    neutral: '#9B9187',
    cardBg: '#FFFDF9',
    cardBorder: '#E9E2D6',
    cardRadius: 4,
    shadow: false,
    fontFace: 'Segoe UI',
    calloutSize: 26,
    titleSize: 12,
    labelSize: 10,
    titleColor: '#2E2A24',
    labelColor: '#857C70',
    gridColor: '#EDE6DA',
    headerBg: '#F3EDE3',
  },
  {
    id: 'mono-slate',
    name: 'Mono Slate',
    blurb: 'Greyscale with one accent — maximum data, minimum decoration.',
    dataColors: ['#2F3B52', '#647089', '#9AA3B7', '#C3C9D6', '#0E7C86', '#4B5568', '#7E8AA3', '#B7BECC'],
    background: '#FFFFFF',
    foreground: '#1C2230',
    tableAccent: '#2F3B52',
    good: '#0E7C86',
    bad: '#B23A48',
    neutral: '#8B93A5',
    cardBg: '#FFFFFF',
    cardBorder: '#DDE1E9',
    cardRadius: 0,
    shadow: false,
    fontFace: 'Segoe UI',
    calloutSize: 26,
    titleSize: 12,
    labelSize: 10,
    titleColor: '#1C2230',
    labelColor: '#6C7488',
    gridColor: '#E7EAF0',
    headerBg: '#F5F6F9',
  },
]

export const packById = (id: string): StylePack | undefined => STYLE_PACKS.find((p) => p.id === id)

/**
 * The subset the mirror needs to preview a pack. Power BI applies these
 * through the theme's visualStyles; our renderer applies them as DEFAULTS,
 * so a visual's own explicit formatting still wins — same precedence.
 */
export interface StylePreview {
  cardBg: string
  cardBorder: string
  cardRadius: number
  shadow: boolean
  titleColor: string
  titleSize: number
  labelColor: string
  calloutSize: number
  foreground: string
}

export const previewOf = (p: StylePack): StylePreview => ({
  cardBg: p.cardBg,
  cardBorder: p.cardBorder,
  cardRadius: p.cardRadius,
  shadow: p.shadow,
  titleColor: p.titleColor,
  titleSize: p.titleSize,
  labelColor: p.labelColor,
  calloutSize: p.calloutSize,
  foreground: p.foreground,
})
