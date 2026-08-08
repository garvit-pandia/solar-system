# Feature Pack Plan — Solar System (2026-08-07)

Builds on the info-panel/tutorial work. Ten features (user-selected from proposal list:
#1,#2,#3,#4,#5,#6,#7,#8,#9,#11). All must be verified in-browser with vision-model checks
(user preference: ALWAYS vision for verification).

## Feature map

| # | Feature | Lead | Files |
|---|---------|------|-------|
| 1 | GitHub Pages deploy + attribution | controller (end) | vite.config.js (base ok), index.html attribution, deploy script |
| 2 | Asteroid belt | subagent A | NEW src/setup/asteroid-belt.ts |
| 3 | Richer fact card (gravity/moons/AU/escape velocity/fun fact) | subagent B | planets.json, planetary-object.ts (interface), info-panel.ts, info-panel.scss |
| 4 | Real-time planet positions (ephemeris) | subagent C | NEW src/setup/ephemeris.ts, solar-system.ts (rng override) |
| 5 | True-scale toggle | controller | script.ts, gui.ts |
| 6 | 3D hover tooltip | controller | script.ts, NEW styles/hud.scss, index.html (#planet-tooltip) |
| 7 | Moon focus | controller (verify only — code already supports) | — |
| 8 | Time controls (presets, reverse, sim-date HUD) | controller | gui.ts, script.ts, index.html (#sim-date), styles/hud.scss |
| 9 | Quiz mode (click planet in 3D to answer) | subagent D (wave 2) | NEW src/setup/quiz.ts, NEW src/styles/quiz.scss |
| 11 | Cinematic auto-tour | subagent E (wave 2) | NEW src/setup/tour.ts |

Controller (me) owns: script.ts wiring, gui.ts, index.html additions, style.scss imports,
debug hook `window.__solar` (DEV-gated), final verification + vision QA, commits.

## Shared DOM ids (defined by controller BEFORE wave-2 agents start)

- `#btn-quiz` — quiz button, top button row (before #btn-settings), data-tooltip="Quiz"
- `#btn-tour` — auto-tour button, top row (first, before #btn-help), data-tooltip="Auto tour"
- `#quiz-card` — overlay card (hidden default) with: `#quiz-question`, `#quiz-options`
  (3 static text chips, NOT clickable), `#quiz-feedback`, `#quiz-progress`, `#quiz-score`,
  `#btn-quiz-close`; result view: `#quiz-result`, `#quiz-final-score`, `#quiz-best`,
  `#btn-quiz-again`, `#btn-quiz-done`
- `#sim-date` — top-left HUD line: "Sim date · YYYY-MM-DD HH:MM"
- `#planet-tooltip` — floating chip near cursor for 3D planet hover

## Module contracts

### asteroid-belt.ts (A)
```ts
export interface AsteroidBelt { mesh: THREE.InstancedMesh; tick(elapsedTime: number): void; }
export const createAsteroidBelt = (scene: THREE.Scene): AsteroidBelt;
```
~3200 instances, radial band between Mars orbit (~9.1) and Jupiter (~14.1) → radii 9.6–13.9,
y ∈ [-0.35, 0.35], Kepler-ish angular speed ω = k/sqrt(r), DodecahedronGeometry(0.03–0.09),
MeshPhongMaterial gray rock (#6e6e76–#8a8a92). tick() updates instance matrices (position +
slow spin). No other file edits. Must not break `npm run typecheck`.

### Data enrichment (B)
planets.json — add to EVERY body (all 17): `gravity` (m/s²), `moons` (int), `distanceAU`,
`escapeVelocity` (km/s), `funFact` (string). Preserve all existing fields/values EXACTLY.
Rings of Saturn keeps NO `temp` (tests "—" fallback). Reference values:
Sun 274/0/—/617.5; Mercury 3.7/0/0.39/4.25; Venus 8.87/0/0.72/10.36; Earth 9.81/1/1/11.19;
Moon 1.62/0/0.0026/2.38; Mars 3.71/2/1.52/5.03; Jupiter 24.79/95/5.2/59.5;
Saturn 10.44/146/9.54/35.5; Uranus 8.87/28/19.19/21.3; Neptune 11.15/16/30.07/23.5;
Ganymede 1.43/0/5.2/2.74; Titan 1.35/0/9.54/2.64; Callisto 1.24/0/5.2/2.44; Io 1.8/0/5.2/2.56;
Europa 1.31/0/5.2/2.02; Triton 0.78/0/30.07/1.46; Rings of Saturn 0/0/9.54/0.
Fun facts: one truthful, educational sentence each (e.g. Earth: "The only known world with
liquid-water oceans and life.").
Body interface += `gravity? moons? distanceAU? escapeVelocity? funFact?` (all optional).
info-panel.ts open(): existing rows + Gravity/Moons/Distance rows + `#info-fact` block
(funFact, hidden if missing). info-panel.scss: width 230→260px; .info-fact styles:
margin-top 0.6rem, padding-top 0.6rem, border-top 1px solid rgba(255,255,255,0.12),
font-size 0.72rem, font-style italic, color rgba(255,255,255,0.65), line-height 1.5.
Fallback "—" per missing field. Verify: typecheck clean; values match table.

### ephemeris.ts (C)
```ts
export const initialOrbitAngle = (name: string): number | undefined;
```
Mean longitude today for the 8 planets: L = (L0 + n·daysSinceJ2000) mod 360°, n = 360/period
(period read from planets.json), daysSinceJ2000 from Date.now() (J2000 epoch 2000-01-01T12:00Z).
L0 (deg): Mercury 252.25084, Venus 181.97973, Earth 100.46435, Mars 355.45332,
Jupiter 34.40438, Saturn 49.94432, Uranus 313.23218, Neptune 304.88003.
Return radians; undefined for non-planets (moons/Sun/rings keep random/offset).
solar-system.ts: after `new PlanetaryObject(planet)`, if `planet.type === "planet"` and
initialOrbitAngle exists → `object.rng = initialOrbitAngle(name)`. (rng is a public field.)
Verify: typecheck; deterministic per-day (two calls same result).

### quiz.ts (D, wave 2)
```ts
export class Quiz {
  constructor(); init(): void; start(): void; isActive(): boolean;
  handlePlanetClick(body: Body): void;
}
```
Reads planets.json. Round = 6 random questions from pool (12). Options: correct + 2 random
other planets (text chips). Answer = clicking that planet in 3D (script.ts routes clicks).
Feedback: correct → "Correct!" (green, score++), wrong → "Not quite — it was <name>" (red).
Progress "Q 2/6", score "3 pts". Result view: score/6 + best (localStorage `solar-quiz-best`).
Question pool (answers per our planets.json data):
shortest day→Jupiter, longest day→Venus, hottest→Venus, coldest→Neptune, largest→Jupiter,
most moons→Saturn, longest year→Neptune, shortest year→Mercury, closest to Sun→Mercury,
strongest gravity→Jupiter, Red Planet→Mars, most prominent rings→Saturn.
Styles: src/styles/quiz.scss — dark glass matching info-panel/tutorial (rgba(15,15,30,.75),
backdrop blur 10px, border rgba(255,255,255,.12), radius 10px, Trispace).

### tour.ts (E, wave 2)
```ts
export class CinematicTour {
  constructor(deps: { camera: THREE.PerspectiveCamera; fakeCamera: THREE.PerspectiveCamera;
    controls: OrbitControls; solarSystem: SolarSystem; changeFocus: (old: string, new: string) => void;
    infoPanel: InfoPanel; });
  start(): void; stop(): void; isRunning(): boolean;
}
```
Sequence = traversable order (Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn,
Uranus, Neptune). Per leg: quadratic bezier from current fakeCamera position to
planet.getWorldPosition + offset (minDistance·2.4, minDistance·0.8, 0), 2.2s, smoothstep ease,
controls.target lerps to planet world pos, controls.enabled=false; on arrival:
changeFocus(focus, name) + infoPanel.open(body), dwell 2.5s. stop() → controls.enabled=true.
Cancel on canvas pointerdown. Note: changeFocus already snaps fakeCamera into focused orbit.

## Verification plan (controller, after integration)
Per feature: console-assert via `window.__solar` + vision-model screenshot (user preference).
- 2 belt: screenshot shows ring of rocks between Mars & Jupiter; GUI toggle hides/shows
- 3 card: click Earth → rows + fun fact; "—" fallback via Rings of Saturn
- 4 ephemeris: __solar.solarSystem.Earth.rng ≈ formula recomputed in console; two reloads identical
- 5 scale: toggle → Sun becomes huge vs planets (vision); camera clamps ok; toggle back
- 6 hover: pointermove over planet → #planet-tooltip shows name
- 7 moon: click Ganymede/Titan → focus + card
- 8 time: preset 100× → orbit visibly faster; reverse → date counts down in #sim-date
- 9 quiz: start quiz → answer by clicking Jupiter etc. → score + best persisted
- 11 tour: start → camera flies Sun→Neptune, cards auto-open, cancel on click
- Regression: original Task-6 list (tour final step localStorage, Earth click, closes,
  persistence, tooltips, "—" temp) + typecheck + build

## Original pending items (from handoff)
- Commit tutorial.scss (Skip legibility + #spotlight-controls pointer-events fix) + package-lock.json
- Clean .playwright-mcp/, root PNGs, .superpowers/ (stop brainstorm server first)
- Attribution: loading screen "created by Kyle Gough" → "Garvit" (deploy prereq)
- Deploy: check gh auth + git remote; if absent → build + script + instructions for user

## Commits (planned)
1. feat: asteroid belt, real ephemeris positions, richer planet data/card
2. feat: true-scale mode, time controls, hover tooltips, moon focus polish
3. feat: quiz mode + cinematic auto-tour
4. chore: attribution + deploy prep
5. fix: polish issues found during browser verification (skip button + pointer-events)
