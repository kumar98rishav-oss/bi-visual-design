# BI Visual Design

A standalone, file-based **design mirror and editor** for Power BI reports. It
opens a Power BI project's report files, mirrors the pages, visuals and theme,
lets you restyle them, and deploys the changes back to disk.

> 🔒 **It cannot see your data.** BI Visual Design reads only the PBIR design
> files — field *names*, geometry and formatting. There are zero rows of data
> anywhere in these files, so there is nothing for the tool to see.

## Why it works without a plugin

Power BI Desktop stores the entire *design layer* of a report as plain JSON
files on disk (the **PBIR** / enhanced report format) inside the
`<name>.Report` folder of a **PBIP** project. There is no live API into the
Desktop canvas — so instead of a bridge, this tool reads and writes those files
directly through the browser's File System Access API. Nothing is installed and
nothing runs in the background.

## Status — Milestone 1 (mirror) ✅ · Milestone 2 (Theme Lab) ✅

**Mirror**
- **PBIR core** — expression-tree read/write, report/page/visual parser, active
  theme resolution. Verified against a real 12-page / 94-visual report
  (`npm run verify:pbir`).
- **Mirror renderer** — pages at their exact native size, every visual placed at
  its sub-pixel PBIR position with title/background/border chrome and
  theme-resolved colours. Charts render representative placeholder content
  (the files carry bindings, not data — the designer works with "lorem ipsum").
- **Page navigation + inspector** — per-page nav, click any visual to inspect
  its geometry and field bindings.

**Theme Lab**
- Resolves the **active** report theme from `report.json`'s `themeCollection`
  (custom theme merged over the base), not a stray imported `Theme.json`.
- Edit the data-colour palette and structural colours (background / foreground /
  table accent). Every edit re-colours the whole mirror **live**.
- **Colour-harmony generator** (analogous, complementary, split, triadic,
  tetradic, monochromatic) and a **preset gallery**.
- **A/B compare** — original vs edited, side by side.
- **Deploy** writes the edited theme back to its file in `StaticResources`,
  backing up the prior copy first and validating JSON. Colours change;
  `textClasses`, `visualStyles` and structural colours round-trip untouched
  (verified against the real theme).

### Not yet built (next up)

1. **Typography & per-visual-type styles** in Theme Lab (textClasses /
   visualStyles editing).
2. **Layout Lab** — drag/resize/align/distribute/snap; write positions back.
3. **Design Doctor** — a design linter (misalignments, off-palette colours,
   mixed fonts, inconsistent radii) with one-click fixes.

## Requirements

- **Chrome or Edge** (File System Access API is Chromium-only).
- A Power BI **PBIP** project (File → Save as `.pbip` in Desktop). Writing into
  `.pbix` zips is refused in v1 to avoid corrupting security bindings.

## Develop

```bash
npm install
npm run dev            # start the app (Vite)
npm run typecheck      # strict TS, no emit
npm run verify:pbir    # exercise the parser against a real report
npm run build          # production build
```

`npm run verify:pbir [projectRoot]` defaults to the Medical_Legal test project;
pass a path to point it at any PBIP folder.

## Hosting (Render)

The app is a static Vite build — any static host works. A [`render.yaml`](render.yaml)
blueprint is included:

- **Build command:** `npm ci && npm run build`
- **Publish directory:** `dist`
- **SPA fallback:** `/*` → `/index.html`

On [Render](https://render.com): **New + → Blueprint**, connect this repo, and it
reads `render.yaml`. (Or create a **Static Site** manually with the settings
above.) It deploys on every push to `main`.

## How deploy stays safe

Corrupting someone's report is the one unforgivable failure, so every write:

1. **Backs up** the exact prior file to `.bi-visual-design-backup/<timestamp>/`
   before touching it.
2. **Validates** that the new content re-parses as JSON before writing.

Power BI Desktop has no hot-reload for externally edited files, so the rhythm
is: **style freely → deploy once → close and reopen the report once.**
