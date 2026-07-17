import { useState } from 'react'
import type { Theme } from '../pbir/types.ts'
import { generatePalette, HARMONY_SCHEMES, PRESETS, type HarmonyScheme } from '../theme/harmony.ts'

interface Props {
  theme: Theme
  dirty: boolean
  canDeploy: boolean
  deploying: boolean
  onChange: (next: Theme) => void
  onReset: () => void
  onDeploy: () => void
}

function normalizeHex(v: string): string {
  const s = v.trim()
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : s
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (hex: string) => void
}) {
  const hex = value ?? '#888888'
  return (
    <label className="color-field">
      <span className="cf-label">{label}</span>
      <span className="cf-controls">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#888888'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input
          type="text"
          className="cf-hex"
          value={hex}
          spellCheck={false}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
        />
      </span>
    </label>
  )
}

export function ThemeLab({ theme, dirty, canDeploy, deploying, onChange, onReset, onDeploy }: Props) {
  const [baseColor, setBaseColor] = useState(theme.dataColors[0] ?? '#4C6EF5')
  const [scheme, setScheme] = useState<HarmonyScheme>('analogous')

  const setDataColor = (i: number, hex: string) => {
    const dataColors = theme.dataColors.slice()
    dataColors[i] = hex
    onChange({ ...theme, dataColors })
  }

  const applyPalette = (colors: string[]) => {
    // Keep the theme's length; fill/extend from generated colours.
    const dataColors = theme.dataColors.map((c, i) => colors[i % colors.length] ?? c)
    onChange({ ...theme, dataColors })
  }

  return (
    <aside className="themelab">
      <div className="tl-head">
        <div>
          <div className="tl-title">Theme Lab</div>
          <div className="tl-sub">
            {theme.name}
            {theme.baseName ? ` · base ${theme.baseName}` : ''}
          </div>
        </div>
        {dirty && <span className="tl-dirty" title="Unsaved edits">● edited</span>}
      </div>

      <section className="tl-section">
        <div className="tl-section-head">Structural</div>
        <ColorField label="Background" value={theme.background} onChange={(hex) => onChange({ ...theme, background: hex })} />
        <ColorField label="Foreground" value={theme.foreground} onChange={(hex) => onChange({ ...theme, foreground: hex })} />
        <ColorField label="Table accent" value={theme.tableAccent} onChange={(hex) => onChange({ ...theme, tableAccent: hex })} />
      </section>

      <section className="tl-section">
        <div className="tl-section-head">
          Data colours <span className="tl-count">{theme.dataColors.length}</span>
        </div>
        <div className="tl-swatch-grid">
          {theme.dataColors.map((c, i) => (
            <label key={i} className="tl-swatch" title={`Colour ${i + 1} — ${c}`} style={{ background: c }}>
              <span className="tl-swatch-idx">{i + 1}</span>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#888888'}
                onChange={(e) => setDataColor(i, e.target.value.toUpperCase())}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="tl-section">
        <div className="tl-section-head">Harmony generator</div>
        <div className="tl-harmony">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(baseColor) ? baseColor : '#4C6EF5'}
            onChange={(e) => setBaseColor(e.target.value.toUpperCase())}
            title="Base colour"
          />
          <select value={scheme} onChange={(e) => setScheme(e.target.value as HarmonyScheme)}>
            {HARMONY_SCHEMES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn small" onClick={() => applyPalette(generatePalette(baseColor, scheme, theme.dataColors.length))}>
            Generate
          </button>
        </div>
        <div className="tl-preview-row">
          {generatePalette(baseColor, scheme, 8).map((c, i) => (
            <span key={i} className="tl-mini" style={{ background: c }} />
          ))}
        </div>
      </section>

      <section className="tl-section">
        <div className="tl-section-head">Presets</div>
        <div className="tl-presets">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="tl-preset"
              onClick={() => onChange({ ...theme, dataColors: theme.dataColors.map((c, i) => p.dataColors[i % p.dataColors.length] ?? c), background: p.background, foreground: p.foreground, tableAccent: p.tableAccent })}
            >
              <span className="tl-preset-swatches">
                {p.dataColors.slice(0, 5).map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <div className="tl-actions">
        <button className="btn" onClick={onReset} disabled={!dirty}>
          Reset
        </button>
        <button
          className="btn primary"
          onClick={onDeploy}
          disabled={!dirty || !canDeploy || deploying}
          title={canDeploy ? 'Write the theme back to the project' : 'Open a project folder to deploy'}
        >
          {deploying ? 'Deploying…' : 'Deploy theme'}
        </button>
      </div>
      {!canDeploy && <p className="tl-note">Deploy is available once you open a project folder (not the sample).</p>}
    </aside>
  )
}
