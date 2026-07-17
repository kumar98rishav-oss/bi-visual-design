import { AlignHorizontalJustifyCenter, Squircle, Palette, Grid3x3, Check, Wand2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { RULE_LABELS, type DoctorRule, type Finding } from '../doctor/analyze.ts'

interface Props {
  findings: Finding[]
  editedCount: number
  canDeploy: boolean
  deploying: boolean
  onFix: (f: Finding) => void
  onFixAll: (rule?: DoctorRule) => void
  onReset: () => void
  onDeploy: () => void
}

const RULE_ICON: Record<DoctorRule, ReactNode> = {
  misalign: <AlignHorizontalJustifyCenter size={15} />,
  radius: <Squircle size={15} />,
  offpalette: <Palette size={15} />,
  subpixel: <Grid3x3 size={15} />,
}
const RULE_ORDER: DoctorRule[] = ['misalign', 'radius', 'offpalette', 'subpixel']

export function DesignDoctor({ findings, editedCount, canDeploy, deploying, onFix, onFixAll, onReset, onDeploy }: Props) {
  const groups = RULE_ORDER.map((rule) => ({ rule, items: findings.filter((f) => f.rule === rule) })).filter((g) => g.items.length)

  return (
    <aside className="themelab doctor">
      <div className="tl-head">
        <div>
          <div className="tl-title">Design Doctor</div>
          <div className="tl-sub">
            {findings.length === 0 ? (editedCount ? 'All clear — fixes pending' : 'No issues found') : `${findings.length} issue${findings.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {editedCount > 0 && <span className="tl-dirty">● {editedCount} fixed</span>}
      </div>

      {findings.length > 0 && (
        <button className="doc-fixall" onClick={() => onFixAll()}>
          <Wand2 size={15} /> Fix all {findings.length}
        </button>
      )}

      {groups.length === 0 && (
        <div className="doc-clear">
          <Check size={22} />
          <p>{editedCount ? 'Everything the Doctor found has been fixed. Deploy to write it back.' : 'This report passes every design check.'}</p>
        </div>
      )}

      {groups.map((g) => (
        <section className="tl-section" key={g.rule}>
          <div className="tl-section-head">
            <span className="doc-rule">{RULE_ICON[g.rule]} {RULE_LABELS[g.rule]}</span>
            <span className="tl-count">{g.items.length}</span>
            <button className="doc-groupfix" onClick={() => onFixAll(g.rule)}>Fix all</button>
          </div>
          <ul className="doc-list">
            {g.items.map((f) => (
              <li className="doc-item" key={f.id}>
                <div className="doc-item-main">
                  <span className="doc-item-title">{f.title}</span>
                  <span className="doc-item-detail">{f.detail}</span>
                  <span className="doc-item-page">{f.pageName}</span>
                </div>
                <button className="doc-fix" onClick={() => onFix(f)}>Fix</button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="tl-actions">
        <button className="btn" onClick={onReset} disabled={editedCount === 0}>Reset</button>
        <button
          className="btn primary"
          onClick={onDeploy}
          disabled={editedCount === 0 || !canDeploy || deploying}
          title={canDeploy ? 'Write the fixes back to the report' : 'Open a project folder to deploy'}
        >
          {deploying ? 'Deploying…' : `Deploy ${editedCount || ''}`.trim()}
        </button>
      </div>
      {!canDeploy && <p className="tl-note">Deploy is available once you open a project folder (not the sample).</p>}
    </aside>
  )
}
