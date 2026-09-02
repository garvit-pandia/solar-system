# STATUS — Polish, redesign & correctness round (2026-09-03)

State: COMPLETE (working tree, uncommitted) — typecheck ✓ · production build ✓ ·
visually verified in-browser on desktop (1600×900) and mobile (390×844).

This round replaces the previous STATUS (the 2026-08-08 zoom/sim-date hotfix —
superseded; those fixes are still in place).

## 1. Tool rail (navbar) redesign + collapse
- Replaced the 11-button top-center dock (icon + tiny label chips) with a
  slim **left icon rail**: icon-only 40px buttons, hairline group separators,
  active toggles marked by an amber edge dot instead of filled chips.
  Tooltips open to the *right* of the rail (top-edge tooltips used to clip
  off-screen).
- **Collapsible**: chevron toggle at the top (or clicking the empty rail)
  expands to icon+name rows; state persists in `localStorage`
  (`solar-rail-expanded`); tooltips are suppressed while expanded; every
  button got a proper `aria-label`.
- Sim-date chip now sits beside the rail — deleted the `max-width: 2000px`
  media-query hack that existed only because the old dock overlapped it.
- Fixed a class collision: rail labels use `.tool-label` (`.label` is the
  POI-chip style and was mis-centering the rail labels).

## 2. Bug fixes
- **Sim date was fiction**: the HUD started at J2000 (2000-01-01) while the
  ephemeris placed planets at *today's* real positions. The clock is now
  seeded with `initialElapsedTime` (ephemeris.ts) so the HUD starts at the
  real current date and matches the sky. Help-panel text updated.
- **Focus camera landed on the night side ~50% of the time** (Neptune looked
  "broken" — a featureless black disc). `changeFocus` and the true-scale
  snap now aim the camera from the Sun through the body
  (`setDaysideCameraPosition` in script.ts).
- **Asteroid-belt flicker**: per-rock z-scale was randomized *per frame*;
  now precomputed per instance.
- **Loading screen could hang forever** on a texture 404 — load errors now
  count toward progress (textures.ts).
- **Free-roam edge-look assist never engaged**: zero-delta mousemove events
  (fired while the cursor is clamped at a screen edge) kept resetting the
  idle timer. Only real motion re-arms it now; edge zone 10→26px; the UI
  block only triggers on interactive elements. Verified with a real-input
  drift test (pitch −0.41 → +0.49 while pinned at the top edge).
- **Moon stylization guard** (`solar-system.ts`): √km radius scaling
  inflated small moons (Moon at 53% of Earth's radius — real 27%) and
  parked Triton 2.1 Neptune-radii out, skimming the planet. Moons now clamp
  to ⅓ parent radius; sibling orbits are re-spaced so they never overlap.
  Raw km values untouched (info panel + true scale stay exact).
- Smooth-gradient planets (Neptune, Uranus) showed 8-bit colour banding —
  `dithering` enabled on planet/atmosphere/ring materials.
- `getOrbitRotation` guarded on `daylength` instead of `period`.
- `rebuildBloom` leaked a render target (now `bloomPass.dispose()`).
- Hidden moons can no longer be clicked/hovered (visibility filter in
  `findClickedBody`); hiding moons also hides their POI labels (CSS2D
  ignores ancestor visibility).
- GUI: Speed slider now syncs when a preset/reverse changes; dead
  `zangle`/`yangle` options removed.

## 3. Performance
- Click/hover/zoom-probe raycasts walked the whole scene — including 10k
  star Points and ~9k hidden belt instances. Belts + starfield + Milky Way
  cap are now non-raycastable.
- Belts no longer cast/receive shadows (sub-pixel rocks in a 6-face 2048²
  point-light shadow map for nothing); `instanceMatrix.needsUpdate` set once
  per mesh instead of per instance.
- Removed per-frame allocations in `starfield.update` and `Label` opacity
  math.

## 4. Visual / UX
- Milky Way band: mottle noise softened (was reading as dirty grey smudges).
- Loading screen: choreography cut from ~5s to <1s (spinner spins
  immediately); loading overlay raised to z-index 100 (app UI was floating
  ABOVE it).
- Global CSS: `box-sizing: border-box` (panels were wider than declared),
  `touch-action: none` on the canvas, `overscroll-behavior: none`,
  `prefers-reduced-motion` support, page background (no white flash), meta
  description / theme-color / color-scheme / `viewport-fit=cover`.
- Tooltips flip below top-edge controls; hover tooltip clamps at the right
  edge; caption buttons 34→40px touch targets.
- Phone layout (≤620px): info panel becomes a bottom sheet; centered
  overlays shift clear of the rail; the rail scrolls vertically if needed.
- Help panel: close button sticky (it used to scroll away), Firefox
  scrollbar styling, focus-visible rings on close buttons.

## 5. Docs & repo hygiene
- `AGENTS.md` created (architecture invariants + gotchas for agents).
- `docs/IMPROVEMENTS-REPORT.md` — researched top-10 roadmap (Keplerian
  orbits + time travel, real star sky, atmosphere shaders, KTX2 asset diet,
  cinematic mode, procedural audio, …).
- Deleted: `docs/superpowers/` (6 outdated plan/spec files), 17
  unreferenced screenshots in `docs/screenshots/` (4.8MB → 1.7MB; README
  keeps 7), root debris PNGs, `.playwright-mcp/`, `.superpowers/`.
- TODO: README's screenshot gallery still shows the OLD toolbar — refresh
  the images when convenient.

## Known-not-bugs (verified — do not re-chase)
- Occasional blank-canvas screenshots are in-app-browser capture artifacts;
  the framebuffer renders correctly every frame (verified via readback).
- CUA keyboard events sometimes don't reach the page in the embedded
  browser — drive controllers via the dev-only `window.__solar` hook
  (e.g. `__solar.palette.onSelect("Neptune")`).

## Next (from docs/IMPROVEMENTS-REPORT.md)
Quick wins: cinematic mode + screenshot (#6), procedural audio (#7),
telemetry HUD (#9), motion trails (#5). Core: Keplerian orbits + time
travel (#1).
