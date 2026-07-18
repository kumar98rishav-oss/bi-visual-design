import { Check, Palette } from 'lucide-react'
import { STYLE_PACKS, type StylePack } from '../style/packs.ts'

interface Props {
  selected: string | null
  canDeploy: boolean
  deploying: boolean
  onSelect: (id: string | null) => void
  onDeploy: () => void
}

/** A miniature dashboard drawn in the pack's own colours. */
function PackPreview({ p }: { p: StylePack }) {
  const card = (x: number, y: number, w: number, h: number) => ({
    x, y, width: w, height: h, rx: Math.min(3, p.cardRadius / 2 + 1),
    fill: p.cardBg, stroke: p.cardBorder || 'none', strokeWidth: p.cardBorder ? 0.6 : 0,
  })
  return (
    <svg className="style-pack-preview" viewBox="0 0 120 64" aria-hidden>
      <rect x="0" y="0" width="120" height="64" fill={p.background} />
      {/* KPI row */}
      <rect {...card(5, 5, 25, 17)} />
      <rect x="8" y="9" width="13" height="4" fill={p.foreground} />
      <rect x="8" y="15" width="9" height="2" fill={p.labelColor} />
      <rect {...card(33, 5, 25, 17)} />
      <rect x="36" y="9" width="13" height="4" fill={p.foreground} />
      <rect x="36" y="15" width="9" height="2" fill={p.labelColor} />
      {/* donut */}
      <rect {...card(61, 5, 54, 17)} />
      <circle cx="72" cy="13.5" r="6" fill="none" stroke={p.dataColors[0]} strokeWidth="3.4" />
      <circle cx="72" cy="13.5" r="6" fill="none" stroke={p.dataColors[2]} strokeWidth="3.4" strokeDasharray="12 26" />
      <rect x="82" y="10" width="26" height="2" fill={p.labelColor} />
      <rect x="82" y="15" width="18" height="2" fill={p.labelColor} />
      {/* main chart */}
      <rect {...card(5, 25, 68, 34)} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={11 + i * 12} y={54 - (8 + ((i * 7) % 17))} width="7" height={8 + ((i * 7) % 17)} rx="1" fill={p.dataColors[i % p.dataColors.length]} />
      ))}
      {/* side list */}
      <rect {...card(76, 25, 39, 34)} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="80" y={30 + i * 7} width="14" height="2.4" fill={p.labelColor} />
          <rect x="97" y={30 + i * 7} width={14 - i * 2.5} height="2.4" fill={p.dataColors[1]} />
        </g>
      ))}
    </svg>
  )
}

export function StyleLab({ selected, canDeploy, deploying, onSelect, onDeploy }: Props) {
  return (
    <aside className="themelab">
      <div className="tl-head">
        <div>
          <div className="tl-title">Style Lab</div>
          <div className="tl-sub">
            {selected ? 'Previewing — deploy writes it to the report theme.' : 'Pick a look. It restyles every visual at once.'}
          </div>
        </div>
        {selected && <span className="tl-dirty">● preview</span>}
      </div>

      <section className="tl-section">
        <div className="tl-section-head"><Palette size={13} /> Style packs</div>
        <div className="style-packs">
          {STYLE_PACKS.map((p) => (
            <button
              key={p.id}
              className={`style-pack${selected === p.id ? ' active' : ''}`}
              onClick={() => onSelect(selected === p.id ? null : p.id)}
              title={p.blurb}
            >
              <PackPreview p={p} />
              <span className="style-pack-body">
                <span className="style-pack-name">
                  {p.name}
                  {selected === p.id && <Check size={13} />}
                </span>
                <span className="style-pack-blurb">{p.blurb}</span>
                <span className="style-pack-swatches">
                  {p.dataColors.slice(0, 8).map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <p className="tl-note">
        A pack sets the palette, typography and per-visual formatting (card surfaces, corner radius,
        titles, table grids, slicers) in the report's theme file — so it applies everywhere, and your
        own per-visual overrides still win.
      </p>

      <div className="tl-actions">
        <button className="btn" onClick={() => onSelect(null)} disabled={!selected}>
          Clear
        </button>
        <button
          className="btn primary"
          onClick={onDeploy}
          disabled={!selected || !canDeploy || deploying}
          title={canDeploy ? 'Write this style to the report theme' : 'Open a project folder to deploy'}
        >
          {deploying ? 'Deploying…' : 'Deploy style'}
        </button>
      </div>
      {!canDeploy && <p className="tl-note">Deploy is available once you open a project folder (not the sample).</p>}
    </aside>
  )
}
