# Planet Info Panel & Tutorial Walkthrough

Date: 2026-08-07

## Goal

Two features on the existing Three.js solar system model:

1. **Planet info panel** — clicking a planet in the 3D scene focuses the camera on it (existing `changeFocus`) and opens a facts card (radius, day length, year, temperature).
2. **Tutorial** — first-time visitors get a welcome card with an obvious Skip button; "Quick guide" launches a spotlight walkthrough of every button/feature; a "?" button reopens the guide anytime; hover tooltips on all buttons.

## Design decisions (from brainstorm, approved)

- Info card: **bottom-left corner glass card** (option A), compact, no description text.
- Click behavior: **focus + open card** — clicking a planet both flies the camera (existing `changeFocus`) and opens facts.
- Tutorial: **hybrid (option C)** — welcome card with Skip, optional spotlight tour, "?" reopen button, hover tooltips.
- Moons and the Saturn ring are clickable for their facts even if not `traversable`.
- **No new dependencies** — hand-rolled DOM + SCSS, matching the app's dark glass aesthetic.

## Data

`planets.json` gains a `temp` field (mean surface temperature, °C) for every body:

| Body | Temp | Body | Temp |
|---|---|---|---|
| Sun | 5500 | Uranus | -195 |
| Mercury | 167 | Neptune | -200 |
| Venus | 464 | Ganymede | -163 |
| Earth | 15 | Titan | -179 |
| Moon | -20 | Callisto | -139 |
| Mars | -63 | Io | -130 |
| Jupiter | -110 | Europa | -160 |
| Saturn | -140 | Triton | -235 |

Rings of Saturn: not traversable, but clickable — give it a sensible temp value too (omit if odd; card should handle missing `temp` gracefully with "—").

## Components

### `src/setup/info-panel.ts` — `InfoPanel` class
- `open(body: Body): void` — fills and shows the card; `close(): void`; `isOpen: boolean`.
- DOM: static markup in `index.html`, class `info-panel`, fixed bottom-left.
- Closes via ✕ button, `Escape` key, or clicking empty canvas space (pointerup on canvas that doesn't hit a body).
- Handles missing `temp` by rendering "—".
- Fields: Name (title), Radius (km), Day (hrs), Year (days), Temp (°C).

### `src/setup/tutorial.ts` — `Tutorial` class
- **Welcome card**: shown on first visit (localStorage flag `solar-tutorial-seen`). Contains title, one-liner, **Skip** button (corner), and **Quick guide** button.
- **Spotlight tour**: dim overlay + highlight box positioned over the target element; steps:
  1. Prev/Next arrows (caption) — switch planets
  2. Canvas — drag to orbit, scroll to zoom
  3. Ambient button
  4. Labels button
  5. Paths button
  6. Settings button
  7. Click a planet for facts (no highlight target — full-canvas highlight)
- Controls: Next / Skip / step counter (n/7). Positioning recalcs on resize/scroll.
- **"?" button** in `.btn-group` (first position) — reopens welcome card.
- **Hover tooltips** — `data-tooltip` attribute on each button; a single tooltip element positioned above the hovered button via CSS `:hover` or JS mouseenter. Simplest robust approach: one tooltip div, JS mouseenter/mouseleave.
- localStorage unavailable → welcome card shows every load; nothing breaks.

### `index.html` changes
- `.btn-group`: add "?" button (first, svg icon, `id="btn-help"`).
- Add markup: `#welcome-card`, `#spotlight` overlay (dim + highlight + tooltip + controls), `#info-panel`, tooltip element.
- Script tag unchanged (module).

### Styles — new files
- `src/styles/info-panel.scss` — bottom-left glass card, ~220px wide, dark translucent background, 1px white/12 border, rounded 10px, blur backdrop, close ✕, stats rows, subtle slide-up animation.
- `src/styles/tutorial.scss` — welcome card (centered, glass, Skip corner + Quick guide button, amber accent `#ffc850`), spotlight overlay (dim background, highlight box with border glow, bottom-center controls), tooltip (small dark pill above element).
- Import both in `src/style.scss`.

### `src/script.ts` wiring
- `pointerdown`/`pointerup` tracking with movement threshold (~6px) to distinguish click from drag.
- On valid click: `Raycaster` from camera through pointer NDC; `intersectObjects(scene.children, true)`; find first hit whose `userData.body` matches a `PlanetaryObject`; call `changeFocus` + update `options.focus` + `infoPanel.open(body)`.
- `PlanetaryObject` mesh gets `userData.body = planetData entry` at construction (solar-system.ts or planetary-object.ts).
- Escape key + empty-space click close the panel.
- `new Tutorial({ onSkip, onGuide })` init after DOM ready; `new InfoPanel(...)`.

## Error handling

- Raycast no-hit → close card, nothing else.
- localStorage throws (private mode) → try/catch, default to show.
- Missing `temp` → "—".
- WebGL failure: out of scope.

## Verification

- `npm run typecheck` (add `tsc --noEmit` script to package.json).
- `npm run dev` + manual browser check via Playwright screenshots; visual review with vision model.
- Test: welcome card first load; skip; guide steps; click Earth opens card + camera focuses; Esc/✕/empty click closes; tooltips appear; resize works; second load skips welcome (localStorage).
