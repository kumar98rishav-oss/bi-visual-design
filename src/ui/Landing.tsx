import {
  Palette,
  FolderOpen,
  FlaskConical,
  Check,
  Loader2,
  ShieldCheck,
  Layers,
  LayoutGrid,
  Heart,
  Linkedin,
  Mail,
  FileJson,
  Lock,
  EyeOff,
  MousePointerClick,
  MonitorSmartphone,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { WaveSea } from './WaveSea.tsx'

const LINKEDIN = 'https://www.linkedin.com/in/rishav98kumar'
const EMAIL = 'Kumar98rishav@gmail.com'

interface Props {
  canOpen: boolean
  busy: boolean
  onOpenFolder: () => void
  onLoadSample: () => void
}

interface Pillar {
  id: string
  icon: ReactNode
  name: string
  tag?: string
  blurb: string
  points: string[]
}

const PILLARS: Pillar[] = [
  {
    id: 'mirror',
    icon: <Layers size={20} />,
    name: 'Multi-page Mirror',
    blurb: 'Every page and visual, placed exactly where Power BI puts them — from the files on disk.',
    points: [
      'Sub-pixel positions, sizes and z-order',
      'Titles, backgrounds, borders and theme colours',
      'Field bindings shown per visual',
      'Placeholder charts — no data ever needed',
    ],
  },
  {
    id: 'theme',
    icon: <Palette size={20} />,
    name: 'Theme Lab',
    blurb: 'Restyle the whole report live, then deploy the theme back to its file — safely.',
    points: [
      'Edit the palette + structural colours live',
      'Colour-harmony generator and presets',
      'A/B compare original vs edited',
      'Deploy with backup + JSON validation',
    ],
  },
  {
    id: 'next',
    icon: <LayoutGrid size={20} />,
    name: 'Layout Lab & Design Doctor',
    tag: 'Coming',
    blurb: 'Align and distribute visuals, then lint the design for the things that read as sloppy.',
    points: [
      'Drag / resize / align / distribute / snap',
      'Equalise gaps, match KPI cards',
      'Find ~2px misalignments and off-palette colours',
      'One-click fixes, written back to the files',
    ],
  },
]

const PRIVACY = [
  {
    icon: <FileJson size={15} />,
    title: 'The design files hold no rows',
    body: 'PBIR files carry field names, geometry and formatting — never a single row of data. There is literally nothing here for the tool to see.',
  },
  {
    icon: <MonitorSmartphone size={15} />,
    title: 'No server of ours, no account',
    body: 'This is a page that runs in your browser. There is no backend to sign into and nowhere for anything to be sent.',
  },
  {
    icon: <Lock size={15} />,
    title: 'The folder stays on your machine',
    body: 'Your report folder is opened locally through the browser. Its contents are read in memory and never uploaded anywhere.',
  },
  {
    icon: <MousePointerClick size={15} />,
    title: 'Your files change only when you deploy',
    body: 'Nothing is written until you press Deploy — and every write backs up the exact file first and validates the JSON.',
  },
  {
    icon: <EyeOff size={15} />,
    title: 'No telemetry of any kind',
    body: 'No analytics, no error reporting, no third-party scripts, no external fonts. Nothing about you or your report is measured.',
  },
  {
    icon: <ShieldCheck size={15} />,
    title: 'PBIP only, on purpose',
    body: 'v1 works on the file-based PBIP format and refuses to write into .pbix zips, where a bad byte could corrupt the report.',
  },
]

export function Landing({ canOpen, busy, onOpenFolder, onLoadSample }: Props) {
  return (
    <div className="home">
      <WaveSea />

      <div className="home__topbar">
        <span className="home__brand">
          <span className="home__logo">
            <Palette size={16} />
          </span>
          BI Visual Design
        </span>
        <span style={{ flex: 1 }} />
        <span className="home__pill">
          <ShieldCheck size={13} /> Cannot see your data
        </span>
      </div>

      <div className="home__inner">
        <section className="hero">
          <span className="status" data-state="ready">
            <span className="status__dot" />
            File-based · nothing to install
          </span>
          <h1 className="hero__title">
            Design your <em>real</em> Power BI report
          </h1>
          <p className="hero__lede">
            BI Visual Design mirrors the pages, visuals and theme straight from your report's files —
            restyle themes, layout and graphics, then deploy the changes back to disk.
          </p>

          <div className="glass">
            <div className="hero__cta">
              <button className="connect" onClick={onOpenFolder} disabled={busy || !canOpen}>
                {busy ? <Loader2 size={18} className="spin" /> : <FolderOpen size={18} />}
                {busy ? 'Opening…' : 'Open project folder'}
              </button>
              <button className="ghostbtn" onClick={onLoadSample} disabled={busy}>
                <FlaskConical size={16} />
                Try the sample
              </button>
            </div>
            {!canOpen && (
              <p className="glass__warn">Use Chrome or Edge to open a folder — the File System Access API is Chromium-only.</p>
            )}
            <div className="glass__chips">
              <span className="gchip"><b>Mirror</b> · exact pages &amp; visuals</span>
              <span className="gchip"><b>Theme Lab</b> · restyle live, deploy safely</span>
              <span className="gchip">Reads only field names &amp; geometry</span>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="panel">
          <div className="panel__head">
            <span className="panel__icon"><FileJson size={18} /></span>
            <div>
              <h2 className="panel__title">It works on the files, not a plugin</h2>
              <p className="panel__sub">
                Power BI Desktop stores a report's entire design layer as plain JSON (the PBIR format)
                inside the <code>.Report</code> folder of a PBIP project. BI Visual Design reads and
                writes those files directly — nothing to install, nothing running in the background.
              </p>
            </div>
          </div>

          <ol className="steps">
            {[
              { label: 'Save as a PBIP project', body: <>In Power BI Desktop: <strong>File → Save as</strong> and choose the <code>.pbip</code> format.</> },
              { label: 'Open the project folder', body: <>Pick the folder that contains <code>&lt;name&gt;.Report</code>. The mirror builds instantly.</> },
              { label: 'Restyle in Theme Lab', body: <>Edit the palette and structural colours — the whole report recolours live across every page.</> },
              { label: 'Deploy, then reopen', body: <>Deploy writes the theme back (with a backup). Close and reopen the report in Desktop to see it.</> },
            ].map((s, i) => (
              <li className="step" key={s.label}>
                <span className="step__mark">{i + 1}</span>
                <div className="step__body">
                  <span className="step__label">{s.label}</span>
                  <span className="step__hint">{s.body}</span>
                </div>
              </li>
            ))}
          </ol>

          <p className="panel__foot">
            <ShieldCheck size={13} />
            <span>
              Every deploy backs up the exact files it changes and validates the JSON before writing.
              Corrupting a report is the one thing this tool will not do.
            </span>
          </p>
        </section>

        {/* Pillars */}
        <section className="pillars">
          {PILLARS.map((p) => (
            <article className="pillar" key={p.id}>
              <span className="pillar__icon">{p.icon}</span>
              <h3 className="pillar__name">
                {p.name}
                {p.tag && <span className="pillar__tag">{p.tag}</span>}
              </h3>
              <p className="pillar__blurb">{p.blurb}</p>
              <ul className="pillar__list">
                {p.points.map((pt) => (
                  <li key={pt}>
                    <Check size={13} />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        {/* Privacy */}
        <section className="privacy">
          <div className="privacy__head">
            <span className="privacy__icon"><ShieldCheck size={20} /></span>
            <h2 className="privacy__title">It cannot see your data</h2>
            <p className="privacy__lede">
              Not a promise in a policy — a consequence of how it is built. The design files simply do
              not contain your data.
            </p>
          </div>
          <ul className="privacy__list">
            {PRIVACY.map((p) => (
              <li className="priv" key={p.title}>
                <span className="priv__icon">{p.icon}</span>
                <div>
                  <span className="priv__title">{p.title}</span>
                  <span className="priv__body">{p.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className="footer">
          <p className="footer__love">
            Designed with <Heart size={13} className="footer__heart" /> by Rishav K.
          </p>
          <p className="footer__ask">Love to hear about your experience.</p>
          <div className="footer__links">
            <a className="footer__link" href={LINKEDIN} target="_blank" rel="noopener noreferrer">
              <Linkedin size={14} /> linkedin.com/in/rishav98kumar
            </a>
            <a className="footer__link" href={`mailto:${EMAIL}?subject=BI%20Visual%20Design%20feedback`}>
              <Mail size={14} /> {EMAIL}
            </a>
          </div>
          <p className="footer__legal">
            © 2026 BI Visual Design. Built by Rishav K. Not affiliated with or endorsed by Microsoft.
            Power BI is a trademark of Microsoft Corporation.
          </p>
        </footer>
      </div>
    </div>
  )
}
