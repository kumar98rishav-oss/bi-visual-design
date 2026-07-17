// Placeholder content for each Power BI visual type. PBIR files carry field
// bindings but no rows, so — exactly like a print designer working with lorem
// ipsum — we render representative shapes in the theme palette. This is not
// Microsoft's renderer and doesn't claim to be; it mirrors layout, type and
// colour so the design reads true.

import type { Theme, VisualNode } from '../pbir/types.ts'
import { dataColor } from '../pbir/color.ts'

interface Props {
  visual: VisualNode
  theme: Theme | null
  width: number
  height: number
}

// Deterministic pseudo-heights so bars/lines look natural but never move.
function series(n: number, seed: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const v = Math.abs(Math.sin((i + 1) * 1.3 + seed) * 0.6 + Math.cos((i + 2) * 0.7 + seed) * 0.3)
    out.push(0.25 + (v % 1) * 0.7)
  }
  return out
}

function seedFrom(id: string): number {
  let s = 0
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) % 997
  return s / 100
}

export function PlaceholderVisual({ visual, theme, width, height }: Props) {
  const t = visual.visualType
  const seed = seedFrom(visual.id)
  const c0 = dataColor(theme, 0)
  const pad = 8
  const w = Math.max(1, width - pad * 2)
  const h = Math.max(1, height - pad * 2)

  const firstMeasure = visual.projections.find((p) => p.kind === 'Measure')?.property

  // KPI card: big representative number + measure name.
  if (t === 'card' || t === 'cardVisual' || t === 'multiRowCard') {
    return (
      <div className="ph ph-card">
        <div className="ph-card-value" style={{ color: c0 }}>
          {'123.4K'}
        </div>
        {firstMeasure && <div className="ph-card-label">{firstMeasure}</div>}
      </div>
    )
  }

  // Bar charts (clustered / stacked / 100%).
  if (t.toLowerCase().includes('bar') || t.toLowerCase().includes('column')) {
    const bars = series(7, seed)
    const bw = w / bars.length
    return (
      <svg className="ph" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {bars.map((v, i) => (
          <rect
            key={i}
            x={pad + i * bw + bw * 0.15}
            y={pad + h * (1 - v)}
            width={bw * 0.7}
            height={h * v}
            rx={2}
            fill={dataColor(theme, i % 3)}
          />
        ))}
      </svg>
    )
  }

  // Line / area charts.
  if (t.toLowerCase().includes('line') || t.toLowerCase().includes('area')) {
    const pts = series(9, seed)
    const step = w / (pts.length - 1)
    const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${pad + h * (1 - v)}`).join(' ')
    const area = `${d} L ${pad + w} ${pad + h} L ${pad} ${pad + h} Z`
    return (
      <svg className="ph" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={area} fill={c0} opacity={0.14} />
        <path d={d} fill="none" stroke={c0} strokeWidth={2.5} strokeLinejoin="round" />
        {pts.map((v, i) => (
          <circle key={i} cx={pad + i * step} cy={pad + h * (1 - v)} r={2.5} fill={c0} />
        ))}
      </svg>
    )
  }

  // Donut / pie.
  if (t.toLowerCase().includes('donut') || t.toLowerCase().includes('pie')) {
    const vals = series(4, seed)
    const total = vals.reduce((a, b) => a + b, 0)
    const cx = width / 2
    const cy = height / 2
    const r = Math.min(w, h) / 2
    let angle = -Math.PI / 2
    const arcs = vals.map((v, i) => {
      const a0 = angle
      const a1 = angle + (v / total) * Math.PI * 2
      angle = a1
      const large = a1 - a0 > Math.PI ? 1 : 0
      const x0 = cx + r * Math.cos(a0)
      const y0 = cy + r * Math.sin(a0)
      const x1 = cx + r * Math.cos(a1)
      const y1 = cy + r * Math.sin(a1)
      return <path key={i} d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`} fill={dataColor(theme, i)} />
    })
    const isDonut = t.toLowerCase().includes('donut')
    return (
      <svg className="ph" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {arcs}
        {isDonut && <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--art-surface)" />}
      </svg>
    )
  }

  // Gauge.
  if (t.toLowerCase().includes('gauge')) {
    const cx = width / 2
    const cy = height * 0.78
    const r = Math.min(w / 2, h * 0.7)
    const arc = (a0: number, a1: number) => {
      const x0 = cx + r * Math.cos(a0)
      const y0 = cy + r * Math.sin(a0)
      const x1 = cx + r * Math.cos(a1)
      const y1 = cy + r * Math.sin(a1)
      return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`
    }
    const frac = 0.4 + (seed % 1) * 0.4
    return (
      <svg className="ph" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={arc(Math.PI, 2 * Math.PI)} fill="none" stroke="var(--art-track)" strokeWidth={12} strokeLinecap="round" />
        <path d={arc(Math.PI, Math.PI + Math.PI * frac)} fill="none" stroke={c0} strokeWidth={12} strokeLinecap="round" />
      </svg>
    )
  }

  // Slicer.
  if (t.toLowerCase().includes('slicer')) {
    return (
      <div className="ph ph-slicer">
        {['All', 'North', 'South', 'East'].map((label, i) => (
          <label key={i} className="ph-slicer-row">
            <span className="ph-check" style={{ borderColor: c0, background: i === 0 ? c0 : 'transparent' }} />
            {label}
          </label>
        ))}
      </div>
    )
  }

  // Table / matrix.
  if (t.toLowerCase().includes('table') || t.toLowerCase().includes('pivot') || t.toLowerCase().includes('matrix')) {
    const cols = 4
    const rows = Math.max(3, Math.floor(h / 26))
    return (
      <div className="ph ph-table">
        <div className="ph-tr ph-th" style={{ background: c0 }}>
          {Array.from({ length: cols }, (_, i) => (
            <div key={i} className="ph-td" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="ph-tr">
            {Array.from({ length: cols }, (_, i) => (
              <div key={i} className="ph-td">
                <span className="ph-bar-line" style={{ width: `${40 + ((r * 7 + i * 13) % 50)}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Buttons.
  if (t.toLowerCase().includes('button')) {
    return (
      <div className="ph ph-button" style={{ borderColor: c0, color: c0 }}>
        Button
      </div>
    )
  }

  // Textbox — usually a header; the title chrome already shows the text.
  if (t === 'textbox') {
    return <div className="ph ph-textbox" />
  }

  // Navigation / images / shapes / unknown — a labelled block.
  return (
    <div className="ph ph-generic">
      <span className="ph-type-badge">{t}</span>
    </div>
  )
}
