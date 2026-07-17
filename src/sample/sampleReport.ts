// A neutral, synthetic PBIR project used for the "Load sample report" button.
// It is authored as real PBIR files (expression-tree formatting and all) and
// run through the actual parser, so the sample exercises the same code path as
// a real folder. Nothing here is user data — it's a fictional sales report.

import { makeLiteral, makeLiteralColor, makeThemeColor } from '../pbir/exprTree.ts'
import type { JsonObject } from '../pbir/types.ts'

const SCHEMA = {
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json',
}

function measure(entity: string, property: string): JsonObject {
  return { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } }
}
function column(entity: string, property: string): JsonObject {
  return { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } }
}

interface VisualSpec {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  z?: number
  title?: { text: string; themeBg?: number; radius?: number; color?: number }
  projections?: { role: string; field: JsonObject }[]
  group?: string
  /** Off-palette border colour — seeds a Design Doctor "off-palette" finding. */
  borderColor?: string
}

function visualJson(spec: VisualSpec): JsonObject {
  const vco: JsonObject = {}
  if (spec.title) {
    const hasBar = spec.title.themeBg != null
    vco.title = [
      {
        properties: {
          show: makeLiteral(true),
          text: makeLiteral(spec.title.text),
          // White text reads on a coloured bar; otherwise a theme colour.
          fontColor: hasBar ? makeLiteralColor('#FFFFFF') : makeThemeColor(spec.title.color ?? 1, 0),
          ...(hasBar ? { background: makeThemeColor(spec.title.themeBg!, 0) } : {}),
          alignment: makeLiteral('center'),
          fontSize: makeLiteral(14),
        },
      },
    ]
    if (spec.title.radius != null) {
      const props: JsonObject = { show: makeLiteral(true), radius: makeLiteral(spec.title.radius) }
      // A deliberately off-palette border colour, for the Design Doctor demo.
      if (spec.borderColor) props.color = makeLiteralColor(spec.borderColor)
      vco.border = [{ properties: props }]
    }
  }

  const query =
    spec.projections && spec.projections.length
      ? {
          queryState: spec.projections.reduce<Record<string, unknown>>((acc, p) => {
            acc[p.role] = { projections: [{ field: p.field }] }
            return acc
          }, {}),
        }
      : undefined

  return {
    $schema: SCHEMA.visual,
    name: spec.id,
    position: { x: spec.x, y: spec.y, z: spec.z ?? 0, height: spec.h, width: spec.w, tabOrder: 0 },
    visual: {
      visualType: spec.type,
      ...(query ? { query } : {}),
      visualContainerObjects: vco,
    },
  }
}

function groupJson(id: string, name: string, x: number, y: number, w: number, h: number): JsonObject {
  return {
    $schema: SCHEMA.visual,
    name: id,
    position: { x, y, z: 0, height: h, width: w, tabOrder: 0 },
    visualGroup: { displayName: name, groupMode: 'ScaleMode' },
  }
}

// --- Page 1: Overview ------------------------------------------------------
// A few deliberate imperfections are seeded here so the Design Doctor demo has
// something to catch: a sub-pixel header (x=24.37), one KPI 2px out of the row
// (y=82) with an odd corner radius (14 vs 12), and an off-palette bar border.
const page1Visuals: VisualSpec[] = [
  { id: 'v_hdr', type: 'textbox', x: 24.37, y: 16, w: 1232, h: 48, title: { text: 'Quarterly Sales Overview', themeBg: 2, radius: 8 } },
  { id: 'v_kpi1', type: 'card', x: 24, y: 84, w: 292, h: 120, title: { text: 'Revenue', themeBg: 1, radius: 12 }, projections: [{ role: 'Values', field: measure('_Measures', 'Total Revenue') }] },
  { id: 'v_kpi2', type: 'card', x: 336, y: 84, w: 292, h: 120, title: { text: 'Orders', themeBg: 3, radius: 12 }, projections: [{ role: 'Values', field: measure('_Measures', 'Order Count') }] },
  { id: 'v_kpi3', type: 'card', x: 648, y: 82, w: 292, h: 120, title: { text: 'Avg Basket', themeBg: 4, radius: 14 }, projections: [{ role: 'Values', field: measure('_Measures', 'Avg Basket') }] },
  { id: 'v_kpi4', type: 'card', x: 960, y: 84, w: 296, h: 120, title: { text: 'Margin %', themeBg: 5, radius: 12 }, projections: [{ role: 'Values', field: measure('_Measures', 'Margin Pct') }] },
  { id: 'v_bar', type: 'clusteredBarChart', x: 24, y: 224, w: 616, h: 280, borderColor: '#4C6EF6', title: { text: 'Revenue by Region', radius: 8 }, projections: [{ role: 'Category', field: column('Region', 'Name') }, { role: 'Y', field: measure('_Measures', 'Total Revenue') }] },
  { id: 'v_line', type: 'lineChart', x: 656, y: 224, w: 600, h: 280, title: { text: 'Revenue Trend', radius: 8 }, projections: [{ role: 'Category', field: column('Date', 'Month') }, { role: 'Y', field: measure('_Measures', 'Total Revenue') }] },
  { id: 'v_donut', type: 'donutChart', x: 24, y: 524, w: 400, h: 176, title: { text: 'Sales by Channel', radius: 8 }, projections: [{ role: 'Legend', field: column('Channel', 'Name') }, { role: 'Values', field: measure('_Measures', 'Total Revenue') }] },
  { id: 'v_slicer', type: 'slicer', x: 440, y: 524, w: 240, h: 176, title: { text: 'Region', radius: 8 } },
  { id: 'v_btn', type: 'actionButton', x: 700, y: 524, w: 160, h: 48 },
]

// --- Page 2: Details -------------------------------------------------------
const page2Visuals: VisualSpec[] = [
  { id: 'v_tbl', type: 'tableEx', x: 24, y: 24, w: 760, h: 500, title: { text: 'Orders Detail', radius: 6 }, projections: [{ role: 'Values', field: column('Orders', 'OrderId') }, { role: 'Values', field: measure('_Measures', 'Total Revenue') }] },
  { id: 'v_gauge', type: 'gauge', x: 808, y: 24, w: 448, h: 240, title: { text: 'Target Attainment', radius: 12 }, projections: [{ role: 'Y', field: measure('_Measures', 'Attainment') }] },
  { id: 'v_card2', type: 'card', x: 808, y: 288, w: 448, h: 120, title: { text: 'YoY Growth', themeBg: 6, radius: 12 }, projections: [{ role: 'Values', field: measure('_Measures', 'YoY Growth') }] },
  { id: 'v_grp', type: 'visualGroup', x: 808, y: 428, w: 448, h: 96 },
]

function pageJson(id: string, displayName: string, bgThemeId: number): JsonObject {
  return {
    $schema: SCHEMA.page,
    name: id,
    displayName,
    displayOption: 'FitToPage',
    height: 720,
    width: 1280,
    objects: {
      background: [
        {
          properties: {
            color: makeThemeColor(bgThemeId, -0.7),
            transparency: makeLiteral(0),
          },
        },
      ],
    },
  }
}

const PAGE1 = 'a1a1a1a1a1a1a1a1a1a1'
const PAGE2 = 'b2b2b2b2b2b2b2b2b2b2'

const theme = {
  name: 'Sample Studio',
  dataColors: ['#4C6EF5', '#12B886', '#FAB005', '#FA5252', '#7048E8', '#1098AD', '#E64980', '#82C91E'],
  background: '#FFFFFF',
  foreground: '#212529',
  tableAccent: '#4C6EF5',
}

/** Build the { path -> text } file map for the synthetic report. */
export function buildSampleFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  const s = (o: unknown) => JSON.stringify(o, null, 2)
  const base = 'Sample_Sales.Report/definition'

  files['Theme.json'] = s(theme)
  files[`${base}/report.json`] = s({ $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/schema.json', themeCollection: {} })
  files[`${base}/pages/pages.json`] = s({ $schema: SCHEMA.pages, pageOrder: [PAGE1, PAGE2], activePageName: PAGE1 })

  files[`${base}/pages/${PAGE1}/page.json`] = s(pageJson(PAGE1, 'Overview', 1))
  for (const v of page1Visuals) {
    const json = v.type === 'visualGroup' ? groupJson(v.id, 'Group', v.x, v.y, v.w, v.h) : visualJson(v)
    files[`${base}/pages/${PAGE1}/visuals/${v.id}/visual.json`] = s(json)
  }

  files[`${base}/pages/${PAGE2}/page.json`] = s(pageJson(PAGE2, 'Details', 2))
  for (const v of page2Visuals) {
    const json = v.type === 'visualGroup' ? groupJson(v.id, 'KPI Group', v.x, v.y, v.w, v.h) : visualJson(v)
    files[`${base}/pages/${PAGE2}/visuals/${v.id}/visual.json`] = s(json)
  }

  return files
}

export const SAMPLE_REPORT_NAME = 'Sample_Sales'
