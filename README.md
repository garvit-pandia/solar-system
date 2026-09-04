# Solar System Model

An interactive 3D model of the solar system, built with Three.js. Traverse the
planets, inspect points of interest (Olympus Mons, Apollo 11, the Great Red
Spot…), run the simulation at any speed, fly between worlds in free-roam mode,
and test yourself with the built-in quiz.

🌍 **Live demo:** <https://garvit-pandia.github.io/solar-system/>

Built and maintained by [Garvit](https://github.com/garvit-pandia).

## Features

- **Real Keplerian orbits** — JPL approximate elements (J2000 + rates) for
  the 8 planets + Pluto, solved per-frame; verified against JPL Horizons
- **Orbits & moons** — the eight planets plus the Moon, Ganymede, Titan,
  Callisto, Io, Europa and Triton, all in motion
- **Dwarf planets & the Kuiper belt** — Pluto (with Charon), Ceres, Eris,
  Makemake and Haumea, plus the icy 30–50 AU Kuiper belt (optional, like
  the main belt)
- **Search & quick-nav** — Ctrl+K (or the magnifier button) opens a
  fuzzy-search palette over all 23 bodies; number keys 1–9/0 jump
  straight to the classic planets
- **Real star sky** — ~8,900 HYG catalogue stars (magnitude ≤ 6.5,
  temperature-tinted, twinkling) with all 88 IAU constellation figures over
  a galactic-aligned Milky Way band
- **Observatory event scanner** — predicts alignments, conjunctions and
  eclipses, with fly-there toasts
- **True-scale mode** — real sizes and real distances (1 unit = Earth's
  radius); the Sun becomes 109× Earth and space gets properly vast
- **Free-roam FPS flight** — pointer-lock mouse look, WASD movement, boost,
  adjustable speed; detached free camera included
- **Time controls** — pause, reverse, speed presets (×0.125 … ×100), a
  fine-grained speed slider, time-travel date jumps, and a live
  simulated-date HUD
- **Asteroid belt** — procedurally generated main belt (three rock shapes,
  varied colours and sizes, faint dust disc) between Mars and Jupiter
- **Facts cards** — radius, day length, year length, temperature, gravity,
  moons, distance and a fun fact for every body
- **Quiz mode** — six questions, answered by clicking the on-screen options
  or the planets themselves
- **Cinematic auto-tour** — a guided flight from the Sun to Neptune, plus a
  cinematic UI-hide mode and one-click PNG screenshots
- **Live telemetry HUD** — camera distance, orbital velocity, on-screen
  scale and sim rate
- **Motion trails & orbit dash flow** — comet-like fading trails and
  direction-animated orbit rings
- **Points of interest** — labelled surface features on Earth's Moon, Mars,
  Jupiter, Saturn and Neptune
- **Atmosphere rims & city lights** — Fresnel glow on Venus/Earth/Mars/gas
  giants/Titan, and Earth's night-side city lights
- **Sun-direction lighting** — the Sun actually lights the planets (day
  sides, night terminators) instead of ambient-only flat shading
- **KTX2 texture pipeline** — Basis-compressed textures (~85% less VRAM,
  ~6.7 MB download) with automatic JPG fallback
- **Hover tooltips, click-to-focus camera, orbit paths, bloom lighting
  and shadows**
- **Controls & features reference** — the help button explains every button
  and simulation control

## Prerequisites

| Requirement | Version | Notes |
| ----------- | ------- | ----- |
| [Node.js](https://nodejs.org/en/download) | **20+** (22 recommended, see `.nvmrc`) | Use the LTS installer on Windows; see Ubuntu notes below |
| npm | ships with Node | `npm ci` is used for clean installs |
| A modern desktop browser | Chrome / Edge / Firefox (current) | WebGL2 required |

No global packages, no native build tools, no environment variables are
needed for everyday development — `npm install` + `npm run dev` is the
whole setup. (Only the *optional* texture-rebuild step needs the external
`toktx` binary; the generated `.ktx2` files are already committed.)

## Setup

Works identically on **Windows** and **Ubuntu** (and macOS). Pick your OS
for the Node.js install, then the remaining steps are the same.

### 1. Install Node.js

**Windows** — download the LTS installer from
[nodejs.org](https://nodejs.org/en/download) and run it (accept the
defaults; the installer adds `node` and `npm` to `PATH`). Verify in a new
PowerShell / Command Prompt:

```powershell
node --version   # expect v20+ (v22.x recommended)
npm --version
```

> Tip: to match the repo's pinned version exactly, use
> [nvm-windows](https://github.com/coreybutler/nvm-windows) or
> [fnm](https://github.com/Schniz/fnm) and run `nvm use` / `fnm use` in the
> project folder (reads `.nvmrc`).

**Ubuntu** — install via NodeSource (ships a current Node; the default
`apt install nodejs` on older Ubuntu releases is too old for Vite 4):

```bash
# Node.js 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node --version   # expect v22.x
npm --version
```

> Prefer a version manager? [fnm](https://github.com/Schniz/fnm) and
> [nvm](https://github.com/nvm-sh/nvm) both work — after installing one,
> `cd` into the project and run `fnm use` / `nvm use` to pick up `.nvmrc`.

### 2. Clone and install

```bash
git clone https://github.com/garvit-pandia/solar-system.git
cd solar-system

npm install     # first time (or after pulling dependency changes)
```

> `npm ci` also works and is what CI uses — it installs exactly what's in
> `package-lock.json`. Use `npm install` when you want to add/upgrade
> packages.

### 3. Run the dev server

```bash
npm run dev
```

Open **<http://localhost:5173/solar-system/>** in your browser. (Note the
`/solar-system/` base path — the app is served under it in dev and in
production on GitHub Pages.)

### 4. Typecheck and build

```bash
npm run typecheck   # tsc --noEmit — the project's quality gate, run after every change
npm run build       # production bundle → dist/
npm run preview     # locally serve the production bundle (check the dist/ output)
```

## Controls (quick reference)

| Input | Action |
| ----- | ------ |
| Click a body | Focus camera on it |
| Drag / scroll | Orbit / zoom |
| `1–9`, `0` | Jump to Mercury … Neptune |
| `Ctrl+K` | Search palette (all 23 bodies) |
| `WASD` + mouse | Fly (free-roam mode) |
| `H` | Cinematic mode (hide UI) |
| `P` | Save PNG screenshot |
| Space / slider | Pause, reverse, simulation speed |

The in-app help button (`?`) documents every toolbar button and shortcut.

## Project layout

```text
src/
  script.ts            entry: scene, render/bloom pipeline, camera modes, main tick() loop
  index.html           ALL DOM UI (tool rail, panels, overlays); JS wires elements by ID
  planets.json         body data (raw km values; shown in the info panel)
  setup/               one module per subsystem (orbits, starfield, events,
                       cinematic, telemetry, trails, belts, rings, textures, …)
  styles/              SCSS per UI area; design tokens in tokens.scss
static/
  textures/            30 JPG + 30 KTX2 textures (JPG fallback via generated manifest)
  data/                stars.json (8,913 HYG stars) + constellations.json (88 IAU figures)
  basis/               Basis Universal transcoder (KTX2 decoding in the browser)
scripts/
  build-stars.mjs          regenerate static/data/*.json (needs downloads into .tmp-stars/)
  build-textures-ktx2.mjs  regenerate .ktx2 + texture-manifest.ts (needs toktx; OPTIONAL)
  deploy-gh-pages.sh       manual deploy helper (CI deploys automatically)
docs/
  STATUS.md                what was built in each round, with verification notes
  IMPROVEMENTS-REPORT.md   roadmap / backlog
```

## Optional: regenerating assets

You do **not** need these for normal development — the generated files are
committed. They are documented here for completeness.

```bash
npm run build-stars      # rebuild static/data/*.json
                         # first: download hygdata_v3.csv + d3-celestial JSONs
                         # into .tmp-stars/ (URLs are in the script header)

npm run build-textures   # rebuild .ktx2 files + src/setup/texture-manifest.ts
                         # needs `toktx` — Ubuntu: `sudo apt install ktx-tools`;
                         # Windows: the vendored .tools/ktx/toktx.exe is used automatically
```

## Deployment

Pushes to `master` deploy automatically via
[`.github/workflows/gh-pages.yaml`](.github/workflows/gh-pages.yaml)
(typecheck → build → GitHub Pages). No manual step needed. The manual
helper `./scripts/deploy-gh-pages.sh <remote-url>` exists as a fallback and
requires Git Bash (Windows) or any POSIX shell (Linux).

## Screenshots

![Sun](docs/screenshots/sun.png)
![Earth](docs/screenshots/earth.png)
![Saturn](docs/screenshots/saturn.png)
![Pluto](docs/screenshots/pluto.png)
![Kuiper belt](docs/screenshots/kuiper-belt.png)
![Search palette](docs/screenshots/search-palette.png)
![True scale](docs/screenshots/true-scale.png)

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `npm install` fails / `vite` or `tsc` not found | Your Node is probably too old or the install was partial — check `node --version` (need 20+), delete `node_modules`, and reinstall |
| Dev server starts but the page is blank | Confirm the URL includes the base path: `http://localhost:5173/solar-system/` (not the bare root) |
| Port 5173 already in use | `npx vite --port 5174` (then open `http://localhost:5174/solar-system/`) |
| `Permission denied` running a script on Ubuntu | `chmod +x scripts/*.sh` — or invoke via `bash scripts/…` |
| `toktx` errors from `npm run build-textures` | Skip it — committed `.ktx2` files already cover you; install `ktx-tools` only if you changed a texture |
| CRLF warnings from Git on Windows | Harmless — `.gitattributes` keeps script line endings correct on every OS |
| Screenshot looks blank in an in-app browser capture | Verify via the dev-only `window.__solar` debug hook or a real browser before treating it as a rendering bug |

## Data sources

- **Physical data (radii, distances, periods)** — NASA/JPL planetary fact
  sheets (mean radii, semi-major axes)
- **Orbital elements** — JPL "Approximate Positions of the Major Planets"
  (J2000 elements + per-century rates)
- **Star catalogue** — HYG Database v3 (astronexus/HYG-Database); see
  `scripts/build-stars.mjs` for the pinned source commit
- **Constellation figures** — d3-celestial (ofrohn/d3-celestial, MIT)
- **The Sun, Jupiter, Saturn, Uranus, and Neptune textures** -
  [https://www.solarsystemscope.com/textures/](https://www.solarsystemscope.com/textures/)
- **Terrestrial Planets textures** - [https://planetpixelemporium.com/planets.html](https://planetpixelemporium.com/planets.html)
- **Pluto & Charon textures** — NASA New Horizons global maps (public
  domain, via Wikimedia Commons)
- **Ceres, Eris, Makemake & Haumea textures** —
  [https://www.solarsystemscope.com/textures/](https://www.solarsystemscope.com/textures/)
  (CC BY 4.0; reconstructed maps — no full-resolution surface imaging
  exists for these worlds yet)
- **Ganymede texture** - [https://www.deviantart.com/askaniy/art/Ganymede-Texture-Map-11K-808732114](https://www.deviantart.com/askaniy/art/Ganymede-Texture-Map-11K-808732114)
- **Titan texture** - [https://planet-texture-maps.fandom.com/wiki/Titan](https://planet-texture-maps.fandom.com/wiki/Titan)
- **Callisto texture** - [http://bjj.mmedia.is/data/callisto/](http://bjj.mmedia.is/data/callisto/)
- **Io texture** - [https://phys.org/news/2014-12-solar-worlds-distant-exoplanets.html](https://phys.org/news/2014-12-solar-worlds-distant-exoplanets.html)
- **Europa texture** - [https://www.johnstonsarchive.net/spaceart/cylmaps.html](https://www.johnstonsarchive.net/spaceart/cylmaps.html)
- **Triton texture** - [https://www.go-astronomy.com/planets/neptune-moon-triton.htm](https://www.go-astronomy.com/planets/neptune-moon-triton.htm)
