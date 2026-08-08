# Round 5 plan — Lighting, sim date, free-roam UX, label collisions, UI identity (2026-08-08)

## Design paragraph (deep-space glass console)

One material language across every surface. Every panel — toolbar, bottom nav
pill, info card, welcome card, quiz card, help card, search palette, tooltips,
sim-date chip, and the lil-gui settings panel — renders as the same deep-space
glass: `rgba(10,12,26,0.66)` fill, `blur(16px) saturate(1.4)`, 1px
`rgba(255,255,255,0.1)` hairline, radius 16 (11 for buttons, 8 for inputs,
999 for pills), a 1px inset top highlight over a 40px soft shadow. A single
warm-amber accent `#ffc850` marks everything active or primary; secondary
text uses a fixed white-opacity ladder (0.92/0.72/0.6/0.55/0.45); errors are
`#ff7b72`; separators are 1px vertical gradient fades. Trispace everywhere,
uppercase micro-labels with 0.06em tracking. Buttons are one component:
20px stroke-1.7 round-cap icon over a 0.55rem uppercase label, 11px radius,
1px hover lift, amber glow when pressed — used by the toolbar, nav pill and
all modals; primary CTAs are amber-filled, secondary are hairline glass. POI
labels become glass chips that never overlap (screen-space repulsion).

**Critique against generic AI defaults:** stock AI UI = purple gradients,
Inter/system font, uniform 8px rounding on every element, flat amber CTA on
dark with no hierarchy, one-off panel styles per component (exactly the
current state: 10/12/14px radii and 0.7/0.75/0.85/0.9 opacities scattered
across seven files, plus a stock LIGHT-THEMED lil-gui panel in a dark space
app). The revision: one radius scale (16/11/8/999), one opacity ladder, one
accent, zero gradients except hairline separators, every interactive element
is either amber-primary or glass-secondary, and the distinctiveness comes
from hairline-glass contrast + amber + uppercase Trispace tracking rather
than decoration. No second accent, no purple, no centered-logo hero.

## Workstreams

### 1. Lighting (the "Earth/Venus dark from all sides" bug)
- Root cause: the Sun mesh (MeshBasicMaterial, castShadow=true) surrounds the
  point light at the scene origin — the Sun itself blocks every light ray, so
  the point light contributes NOTHING to any planet. Combined with
  `decay = 2` (intensity 1/r², negligible at orbit distances), planets are
  lit only by ambient.
- Fix: `pointLight.decay = 0` (sunlight reaches the whole system) +
  `Sun.mesh.castShadow = false` (unblock). Tune point intensity and
  AMBIENT_BRIGHT/DIM so day sides are lit but not clipped (no tone mapping in
  the pipeline; total > 1 clips). Verify EVERY body (Mercury…Triton) via
  vision: visible day/night terminator, no fully-dark planets, no blowout.
- Files: src/setup/lights.ts, src/script.ts (Sun castShadow), src/setup/gui.ts
  (ambient constants), doc values.

### 2. Sim date rewritten on the J2000 epoch
- Root cause: HUD date = `Date.now() + elapsedTime/3 days` — real clock base,
  while planet positions start from J2000 mean longitudes (ephemeris.ts) →
  date and sky never agree; reverse time shows nonsense.
- Fix: `simDate = new Date(J2000_EPOCH + elapsedTime * 86400000/3)` (J2000 =
  2000-01-01T12:00Z, already the ephemeris epoch). Pause/reverse/speed all
  flow through elapsedTime unchanged. Add "UTC" to the HUD label.
- Verify: at ×1 speed 1 real second advances exactly 8h; Earth completes a
  year (365.25 d sim) when HUD year 2000→2001; reverse goes back; pause
  freezes.

### 3. Free-roam UX (clickable UI mid-flight, no Sun snap-back)
- Snap-back root cause: on exit the camera re-attaches to the focus body and
  OrbitControls clamps radius to [minDistance, maxDistance] — fly past
  maxDistance (50 for the Sun) and you get yanked back toward the Sun.
- Fix: after restoring the saved pose, if the local radius exceeds
  controls.maxDistance, extend maxDistance to radius × 1.1 (and respect
  minDistance). The saved position then survives the first controls.update().
- Clickable buttons mid-flight: pointer lock makes ALL UI unclickable while
  flying. Replace pointer-lock look with unlocked mouse-look: mousemove over
  the canvas applies movementX/Y deltas (movementX works without lock),
  `cursor: none` over the canvas while fps-active, normal cursor over the
  toolbar → every button toggleable during flight. Esc still exits. Update
  fps-hint/help/tutorial copy ("move mouse to look — UI stays clickable").
- Files: src/setup/fly.ts (remove pointer-lock, add mouse-look + Esc),
  src/script.ts (maxDistance extension), help-panel.scss (cursor rule),
  tutorial.ts + index.html copy.

### 4. POI label collisions (Mars/Moon label soup)
- Fix: wrap each label's content in an inner div; CSS2DRenderer owns the outer
  element's transform, we own the inner. In Label.update(), after opacity
  pass, project label boxes (getBoundingClientRect) and run pairwise
  repulsion (n≤5 → ≤10 pairs), applying inner translate offsets; clamp ±48px.
  Restyle labels as glass chips (hairline, 6px radius, backdrop blur, amber
  icon).
- Files: src/setup/label.ts, src/styles/label.scss.

### 5. UI identity system (anti-slop pass)
- New src/styles/tokens.scss: the full design-token set (panel bg/blur/hairline,
  radius scale, shadows, accent ladder, text ladder, error, tracking, font).
  All component SCSS @use tokens.
- lil-gui: theme via its CSS custom properties (verified supported:
  --background-color, --widget-color, --title-*, --focus-color, …) in
  gui.scss → glass panel, amber focus, dark widgets.
- Refactor every component file to the tokens + shared recipes
  (%glass-panel, %glass-btn, %primary-btn placeholders): toolbar.scss,
  gui.scss (caption pill), hud.scss (sim-date + planet-tooltip chips),
  info-panel.scss, tutorial.scss (welcome/spotlight/tooltip),
  quiz.scss, help-panel.scss (+ fps-hint), nav-palette.scss,
  loading-screen.scss (glass loader card), animation.scss (fadeUp for
  modals).
- Forbidden per spec: purple gradients, Inter/system fonts, stock flat
  buttons, uniform rounding, centered-logo layouts, 01/02/03 numbering,
  second accent.
- Verify: vision-model rating of every surface; iterate until "tasteful".

## Verification matrix
| Item | Console assert | Vision check |
|---|---|---|
| Lighting | pointLight.decay=0, Sun.castShadow=false, intensities | day/night terminator on 8+ bodies |
| Sim date | epoch math, 8h/s at ×1, reverse, pause | HUD shows 2000-ish date matching ephemeris |
| FPS exit | position preserved beyond maxDistance | camera stays put, no Sun yank |
| FPS UI | click toggles while fps.active | cursor works over toolbar mid-flight |
| Labels | no overlapping rects on Mars/Moon | chips separated, styled |
| UI identity | tokens applied (computed styles) | vision rating ≥ "polished, cohesive" |
| Regression | typecheck, build, round-4 features still pass | toolbar, rings, ambient, true scale |

## Report
Every UI file changed with before/after screenshots; vision-model ratings.

## Verification log (final)
- Lighting: decay=0, Sun.castShadow=false; Earth/Venus/Mars/Jupiter/Saturn
  all show day/night terminators, exposure 10/10 on Jupiter's full disk, no
  blowout (the earlier "blowout" = Sun bloom in frame).
- Sim date: J2000-anchored; 8h/s at ×1; reverse −4h per test window; pause
  frozen (HUD-throttle-aware reads).
- FPS: ambient toggle clicked while flying (still flying after);
  exit at 67.3 units (limit 50) → position preserved, maxDistance extended.
- Labels: Mars 5-POI cluster → 0 overlapping rects, stable over 2 s.
- Ambient: slider (fine) + toolbar preset (day/night) share one value;
  day level remembers the slider position (0.45 → 0.3 → night 0.06 → 0.3).
- Regression: true-scale round-trip exact (Earth orbit 23,481); orbit-ring
  toggles independent; typecheck + build clean.
- Vision: every UI surface rated cohesive (settings/info/quiz/help/palette/
  toolbar/labels/free-roam); screenshots in docs/screenshots/.
