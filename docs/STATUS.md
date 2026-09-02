# STATUS — Feature rounds A/B/C complete (2026-09-03)

State: rounds A, B and C of `docs/IMPROVEMENTS-REPORT.md` are implemented,
verified and pushed to `origin/master`. typecheck ✓ · production build ✓ ·
visually verified in-browser after each round. This round replaces the
previous STATUS (the 2026-09-03 polish/redesign round — all of that work is
in commit `6f209f7`).

Commits: `a390e70` (Round A) · `68c76f2` + `0356707` (chore) · `b4dcce7`
(Round B) · `63b0480` (assets) · `19a4bf4` (Round C).

## Round A — quick wins (report #6, #9, #5)

- **Cinematic mode + one-click screenshot** (`setup/cinematic.ts`):
  rail button or `H` fades every UI layer (CSS `body.cinematic`) and slides
  in letterbox bars; a floating capture chip stays bottom-right. `P` or the
  chip saves a PNG (`solar-system_<body>_<timestamp>.png`) by rendering
  through the bloom composer and reading the framebuffer in the same task —
  no `preserveDrawingBuffer`. Feedback via a bottom-center toast.
- **Live telemetry HUD** (`setup/telemetry.ts`): glass strip under the sim
  date — camera→focus distance (AU/km), focus mean orbital velocity (km/s,
  from planets.json — Earth shows 29.8 ✓), on-screen scale ("1 px ≈ N km",
  pinhole model), sim rate (×0.13 · 1.0 h/s format, reverse/pause aware).
  km-per-unit is calibrated at the focused body's heliocentric ratio in view
  mode and exact (1 unit = 6371 km) in true scale. Hidden ≤620px.
- **Motion trails** (`setup/trail.ts`): fading comet-tails for all 13
  Sun-orbiting bodies. Fixed-length ring buffers (160 pts) per body, ordered
  draw buffer with black-faded colour ramp (additive blending), zero
  per-frame allocations, raycast disabled, jump detection clears the tail on
  mode switches. GUI toggle "Motion Trails" (default on).
- **Orbit dash flow** (`setup/path.ts`): Sun-orbiting rings now use
  `LineDashedMaterial` with an injected `uDashOffset` uniform animated in
  the tick — dashes drift along the ring showing travel direction. Dash
  pattern lives in the unit-geometry line-distance attribute, so it is
  scale-independent (view/true-scale) and PathFader's opacity machinery is
  untouched.

## Round B — the science core (report #1)

- **Real Keplerian orbits** (`setup/ephemeris.ts` rewritten): JPL
  "Approximate Positions of the Major Planets" Table 1 (J2000 elements +
  per-century rates, valid 1800–2050) for the 8 planets + Pluto; Newton–
  Raphson Kepler solver (JPL recipe). Positions are heliocentric ecliptic
  AU mapped into the scene frame (Y-up, north ecliptic pole on +Y).
- **Accuracy verified against JPL Horizons**: Earth @2026-09-05 09:00 —
  solver 342.46°/1.0083 AU vs Horizons 342.47°/1.0081 AU (node replica of
  the sim code matches the browser sim to 0.03°).
- **Ecliptic frame fix**: the Sun's rig carried its axial tilt
  (`rotation.x = 7.25°`), which silently tilted the whole orbital frame —
  invisible before (circular orbits), wrong now. The Sun's rig no longer
  tilts (its visual mesh still spins; planets' real inclinations are now
  visible: Mercury +5.1°, Pluto −4.2° ecliptic latitude at load).
- **Inclined ellipse orbit paths**: unit-ellipse geometry baked from the
  elements (`orbitEllipsePointsAU`), scaled uniformly per mode — view mode
  keeps the stylised √-compression (semi-major = stylised a), true scale
  uses real 1-unit-per-Earth-radius. PathFader/dash-flow work unchanged.
  Remaining dwarfs (Ceres, Eris, Makemake, Haumea) and moons keep stylised
  circular orbits (documented in help).
- **Time travel**: click the sim-date chip → glass popover with a UTC
  datetime picker + "Now" + "Go" (range clamped 1800–2050 with a toast).
  Writing the clock re-solves every Keplerian position on the next tick and
  clears motion trails. HUD date and planet positions share one clock
  (`simDateMsFromElapsed` / `elapsedFromSimDateMs`).

## Round C — sensory (report #3, #4)

- **Fresnel atmosphere rims**: additive back-side shells with a
  `pow(0.62 − dot(N, viewZ), p)` falloff, tinted per world (Rayleigh-blue
  Earth, creamy Venus, dusty Mars, faint haze on the gas giants, orange
  smog on Titan). Earth keeps its rotating cloud sphere under the shell.
- **Earth city lights**: NASA-Black-Marble-style night map (Solar System
  Scope 2k nightmap, CC BY 4.0 — credited in `static/textures/CREDITS.md`)
  injected into Earth's Phong material via `onBeforeCompile`; additive
  city glow masked by a world-normal sun-direction smoothstep, sun
  direction tracked per-frame. Best viewed with the ambient light dimmed
  (toolbar night preset).
- **Animated true-scale morph**: the True Scale toggle now tweens every
  body's scale, activeDistance, path scale and AU-factor over 1.6 s
  (ease-in-out cubic) instead of snapping — the Sun visibly swells while
  orbits stream outward. `captureScaleState` / `applyScaleState` /
  `lerpScaleState` in solar-system.ts; belts/bloom/far-plane flip
  immediately; PathFader caches refresh at tween end. Annotation toast:
  "True scale — the Sun is 109 × Earth · space is mostly emptiness".

## Housekeeping

- Screenshots from automated verification live in
  `docs/screenshots/captures/` (tracked, one folder as requested).
- `.gitignore` now covers `.tmp-stars/` (star-catalog working dir); the
  34 MB temp CSV was removed from the repo after an over-eager `git add -A`.
- `git config core.filemode false` — an external process on this machine
  kept flipping `scripts/deploy-gh-pages.sh` between 644/755; the recorded
  mode is now frozen at 755.
- Data assets for the next round are already in-tree:
  `static/data/stars.json` (8,913 HYG stars ≤ mag 6.5, RA/Dec/mag/B-V-RGB,
  339 proper names) and `static/data/constellations.json` (88 IAU
  constellations, 893 line points), generated by `scripts/build-stars.mjs`.

## Known-not-bugs (verified — do not re-chase)

- The sim date mirrors the OS clock (seeded at page load). This machine's
  clock has been observed jumping ~2 days between sessions — a jumping HUD
  date is the OS clock, not a sim regression.
- Occasional blank-canvas screenshots are in-app-browser capture artifacts;
  the framebuffer renders correctly every frame (verified via readback).
- CUA keyboard events sometimes don't reach the page in the embedded
  browser — drive controllers via `window.__solar` (now also exposes
  `cinematic`, `trails`, `telemetry`, `timeTravel`).
- The camera→focus distance in view mode (~2.7 AU at the Sun) is the honest
  calibration at the focused body's orbit — view mode compresses distances
  non-linearly (Mkm^0.4), so km-per-unit varies across the scene.

## Next (from docs/IMPROVEMENTS-REPORT.md)

1. **Round D #2 — real star sky**: feed `stars.json` into the starfield
   Points shader (RA/Dec → unit vectors, equatorial→ecliptic rotation by
   ε=23.44°, magnitude→size/brightness), add constellation `LineSegments`
   + GUI toggle. Data is ready and validated (Orion/Betelgeuse spot checks
   correct).
2. **Round D #8 — KTX2 asset diet**: convert static/textures JPGs (20 MB)
   to KTX2/Basis + distance LOD. Needs `toktx`/gltf-transform tooling.
3. **Round E #10 — alignment & eclipse detector**: angular-separation scan
   over the (now real) positions every ~500 ms → toasts + "fly there".
4. Final full pass as a user (rate every view, polish), refresh README
   screenshots (still shows the old toolbar), STATUS update.
