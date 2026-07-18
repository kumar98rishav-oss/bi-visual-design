// Expands a StylePack into a full Power BI theme: palette + typography
// (textClasses) + per-visual-type formatting (visualStyles). One deploy of this
// file restyles every visual in the report.
//
// NOTE the format difference from visual.json: inside a THEME, colours are
// plain `{"solid":{"color":"#RRGGBB"}}` — no expression trees. Verified against
// the report's real Frontier theme.

import type { JsonObject } from '../pbir/types.ts'
import type { StylePack } from './packs.ts'

const solid = (hex: string) => ({ solid: { color: hex } })

/** The `visualStyles` block: `{ visualType: { selector: { property: [ {...} ] } } }`. */
export function buildVisualStyles(p: StylePack): JsonObject {
  // Container chrome shared by every visual type.
  const common: JsonObject = {
    background: [{ show: true, color: solid(p.cardBg), transparency: 0 }],
    border: [{ show: !!p.cardBorder, color: solid(p.cardBorder || p.gridColor), radius: p.cardRadius }],
    dropShadow: [{ show: p.shadow, preset: 'BottomRight' }],
    visualHeader: [{ show: false }],
    title: [
      {
        show: true,
        fontColor: solid(p.titleColor),
        background: solid(p.cardBg),
        fontFamily: p.fontFace,
        fontSize: p.titleSize,
        alignment: 'left',
        titleWrap: true,
      },
    ],
    labels: [{ color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize }],
    categoryAxis: [{ color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize, gridlineShow: false }],
    valueAxis: [
      {
        color: solid(p.labelColor),
        fontFamily: p.fontFace,
        fontSize: p.labelSize,
        gridlineShow: true,
        gridlineColor: solid(p.gridColor),
        gridlineStyle: 'solid',
        gridlineThickness: 1,
      },
    ],
    legend: [{ show: true, position: 'Right', fontColor: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize, showTitle: false }],
  }

  const tableLike: JsonObject = {
    grid: [
      {
        gridVertical: false,
        gridHorizontal: true,
        gridHorizontalColor: solid(p.gridColor),
        outlineColor: solid(p.gridColor),
        outlineWeight: 1,
        rowPadding: 4,
        textSize: p.labelSize,
      },
    ],
    columnHeaders: [
      { fontColor: solid(p.titleColor), backColor: solid(p.headerBg), fontFamily: p.fontFace, fontSize: p.labelSize, bold: true, outline: 'BottomOnly' },
    ],
    values: [
      { fontColor: solid(p.foreground), backColor: solid(p.cardBg), fontFamily: p.fontFace, fontSize: p.labelSize, urlIcon: false },
    ],
    total: [{ fontColor: solid(p.titleColor), backColor: solid(p.headerBg), bold: true, fontSize: p.labelSize }],
  }

  return {
    '*': { '*': common },
    // The page canvas itself.
    page: { '*': { background: [{ color: solid(p.background), transparency: 0 }], outspace: [{ color: solid(p.background) }] } },
    // Big-number cards: the callout is the hero of a KPI.
    card: {
      '*': {
        labels: [{ color: solid(p.foreground), fontFamily: p.fontFace, fontSize: p.calloutSize, bold: true }],
        categoryLabels: [{ show: true, color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize }],
        wordWrap: [{ show: true }],
      },
    },
    cardVisual: {
      '*': {
        calloutValue: [{ color: solid(p.foreground), fontFamily: p.fontFace, fontSize: p.calloutSize, bold: true }],
        labels: [{ color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize }],
      },
    },
    multiRowCard: {
      '*': {
        dataLabels: [{ color: solid(p.foreground), fontFamily: p.fontFace, fontSize: Math.round(p.calloutSize * 0.65) }],
        categoryLabels: [{ color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize }],
      },
    },
    slicer: {
      '*': {
        background: [{ show: true, color: solid(p.cardBg), transparency: 0 }],
        header: [{ show: true, fontColor: solid(p.titleColor), background: solid(p.cardBg), fontFamily: p.fontFace, fontSize: p.labelSize, bold: true, outline: 'None' }],
        items: [{ fontColor: solid(p.foreground), background: solid(p.cardBg), fontFamily: p.fontFace, fontSize: p.labelSize }],
        selection: [{ selectedColor: solid(p.dataColors[0]) }],
      },
    },
    tableEx: { '*': tableLike },
    pivotTable: { '*': tableLike },
    // Doughnut/pie read best with a clean centre and outside labels.
    donutChart: { '*': { slices: [{ innerRadiusRatio: 60 }], labels: [{ color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize, labelStyle: 'Category, percent of total' }] } },
    pieChart: { '*': { labels: [{ color: solid(p.labelColor), fontFamily: p.fontFace, fontSize: p.labelSize }] } },
    lineChart: { '*': { lineStyles: [{ strokeWidth: 3, lineStyle: 'solid', showMarker: false }] } },
    columnChart: { '*': { labels: [{ show: false }] } },
    clusteredColumnChart: { '*': { labels: [{ show: false }] } },
    barChart: { '*': { labels: [{ show: true, color: solid(p.foreground), fontSize: p.labelSize }] } },
    clusteredBarChart: { '*': { labels: [{ show: true, color: solid(p.foreground), fontSize: p.labelSize }] } },
    gauge: { '*': { axis: [{ min: 0 }], labels: [{ color: solid(p.foreground), fontSize: p.labelSize }] } },
    actionButton: {
      '*': {
        fill: [{ show: true, fillColor: solid(p.dataColors[0]), transparency: 0 }],
        text: [{ fontColor: solid(p.cardBg), fontFamily: p.fontFace, fontSize: p.labelSize, bold: true }],
        border: [{ show: false }],
        visualHeader: [{ show: false }],
      },
    },
  }
}

/** Typography classes Power BI applies across the report. */
export function buildTextClasses(p: StylePack): JsonObject {
  return {
    callout: { fontFace: p.fontFace, fontSize: p.calloutSize, color: p.foreground },
    title: { fontFace: p.fontFace, fontSize: p.titleSize, color: p.titleColor },
    header: { fontFace: p.fontFace, fontSize: p.titleSize, color: p.titleColor },
    label: { fontFace: p.fontFace, fontSize: p.labelSize, color: p.labelColor },
  }
}

/**
 * Apply a pack onto an existing theme's raw JSON: palette, structural colours,
 * typography and per-visual formatting are replaced; anything else in the file
 * (name, custom keys) is preserved.
 */
export function applyStylePack(themeRaw: JsonObject, p: StylePack): JsonObject {
  return {
    ...themeRaw,
    dataColors: [...p.dataColors],
    background: p.background,
    foreground: p.foreground,
    tableAccent: p.tableAccent,
    good: p.good,
    bad: p.bad,
    neutral: p.neutral,
    textClasses: buildTextClasses(p),
    visualStyles: buildVisualStyles(p),
  }
}
