# AGENTS.md — Solar System Model

Three.js + Vite + TypeScript interactive solar-system simulator (personal portfolio project by Garvit). No test suite, no linter — `npm run typecheck` is the gate, plus visual verification in a browser.

## Commands
- `npm run dev` — Vite dev server at `http://localhost:5173/solar-system/` (base path is `/solar-system/`)
- `npm run build` — production build to `../dist`
- `npm run typecheck` — `tsc --noEmit`; run this after every change

## Layout
- `src/script.ts` — entry: scene, render/bloom pipeline, camera mode state machine, input handlers, main `tick()` loop
- `src/index.html` — ALL DOM UI (tool rail, caption pill, panels, overlays); JS wires elements by ID
- `src/planets.json` — body data (raw km values; shown in the info panel)
- `src/setup/` — one module per subsystem: `planetary-object.ts` (Body class), `solar-system.ts` (hierarchy + true scale), `ephemeris.ts` (JPL Keplerian elements), `starfield.ts` (8.9k HYG stars + 88 constellations), `events.ts` (observatory alignment/conjunction/eclipse scanner), `time-travel.ts`, `cinematic.ts`, `telemetry.ts`, `trail.ts`, `path.ts` + `path-visibility.ts`, `asteroid-belt.ts`, `rings.ts`, `lights.ts`, `environment-map.ts`, `textures.ts` + `texture-manifest.ts` (KTX2 w/ JPG fallback), `loading.ts`, `fly.ts` (FPS mode), `free-camera.ts` (detached mode), `gui.ts` (lil-gui + toolbar wiring), `label.ts`, `tour.ts`, `nav-palette.ts`, `quiz.ts`, `tutorial.ts`, `help-panel.ts`, `info-panel.ts`
- `src/styles/` — SCSS per UI area; design tokens + shared recipes in `tokens.scss`
- `static/textures/` — 30 JPG + 30 KTX2/Basis textures with JPG fallback via generated manifest (`setup/texture-manifest.ts`, built by `scripts/build-textures-ktx2.mjs`); `static/data/` holds `stars.json` (8,913 HYG stars) + `constellations.json` (88 IAU figures, built by `scripts/build-stars.mjs`); `docs/IMPROVEMENTS-REPORT.md` is the roadmap

## Architecture rules (violating these causes subtle bugs — details in code comments)
- **Two cameras**: `fakeCamera` is driven (OrbitControls / FreeRoam / FreeCamera); `camera` (the render camera) is parented to the focused body's mesh and synced via per-frame `camera.copy(fakeCamera)`. Never render with `fakeCamera`.
- **Body rig**: outer `mesh` only translates (orbit) + carries tilt + true-scale scale — it must NEVER spin per-frame (the camera is its child). Day/night spin lives on `spinMesh`. Labels/atmosphere/moons attach to `spinMesh`.
- **View-mode stylization**: radius = √km/500, orbit distance = Mkm^0.4. Raw km stays on `Body` for the info panel; true-scale mode uses real km (1 unit = Earth radius). Moon sizes/orbits are clamped by the guard in `solar-system.ts` — don't remove it.
- **Sim clock ↔ ephemeris coupling**: planets start at *today's* mean longitude (`ephemeris.ts`); the HUD clock is seeded via `initialElapsedTime` (3 elapsed units = 1 sim day; ×1 speed = 8 sim hours/real second). Changing one requires the other.
- **Raycasting ignores `visible=false`**: scenery (belts, starfield, dust ring) has `raycast = () => {}`; `findClickedBody` filters hidden bodies by ancestor visibility. Keep new scenery non-pickable.
- **No per-frame allocations** in the tick path — reuse scratch vectors/buffers (see `starfield.ts`, `label.ts`, `path-visibility.ts`).
- **CSS**: `.label` is the POI chip class (`label.scss`) — rail buttons deliberately use `.tool-label` instead. Tokens (`$accent`, `%glass-panel`, `%glass-btn`) are the design system; don't hardcode colors/shadows.

## Gotchas
- `THREE.ColorManagement.enabled = false` + `LinearSRGBColorSpace` output is the intended legacy look — don't "modernize" it.
- The loading screen completes only when every `loadTexture` settles (success OR error counts) — new textures must go through `loadTexture`/`setTextureCount`.
- Environment: Windows + Git Bash (CRLF warnings are harmless). `node_modules` on this machine suffered junk-file churn from an external process — if tsc/vite vanish, reinstall.
- In-app-browser screenshots can artifact (blank canvas, "capture failed") — before chasing a phantom rendering bug, verify via `window.__solar` (dev-only debug hook: scene, cameras, `options`, controllers incl. `cinematic`, `trails`, `telemetry`, `timeTravel`, `eventScanner`, `starfield`) or framebuffer readback.
- Automated verification recipe: dev server + `window.__solar` (`solarSystem`, `options`, `fps.active`, `palette.onSelect(name)` to jump bodies) + screenshots. Real keyboard events via CUA may silently not reach the page — drive controllers directly instead.
- Commit doc + screenshot updates together with the feature rounds they describe (STATUS.md + README `docs/screenshots/*.png` at 1600×900); don't let them drift a round behind.
