# STATUS — Zoom fix + sim-date overlap fix (2026-08-08, hotfix round)

State: COMPLETE — detached-mode wheel zoom is proportional and consistent at
every distance and scale mode, and the sim-date chip is never covered by the
toolbar. Verified via console assertions + vision + typecheck + build.

## What changed

1. **Wheel zoom in detached/free-camera mode was broken & inconsistent**
   - Root cause: the FreeCamera zoom state was a hardcoded scalar (30) that
     never synced to the camera's ACTUAL distance. After a free-roam flight
     the camera can be anywhere (0.3 units from a planet or thousands out),
     so: zoom-in dead-ended at the max limit (target pinned → zero dolly),
     zoom steps were imperceptible at large distances (true scale: 7.5-unit
     steps in a 100k-unit void), close-range steps tunneled through the
     body (7.5-unit dive from 0.3 units away), and a clamped target from
     beyond the range fired one giant dolly — the "glitching frames".
   - Fix (`src/setup/free-camera.ts`): `enter()` now derives
     `zoom = zoomTarget = camera.position.length()` (the camera is a
     scene-root child in this mode, so distance is world-space). Every wheel
     step is a proportional 25% of the current distance. Limits are enforced
     only while the zoom state is already inside them — a camera beyond
     maxDistance zooms freely until it re-enters the range (no dead-end, no
     teleport dolly).
2. **DPR oscillation shimmer** (`src/script.ts`): the adaptive pixel-ratio
   now needs TWO consecutive 30-frame windows agreeing before changing —
   every DPR change resizes the drawing buffer, and a borderline frame
   budget oscillated it back and forth while zooming.
3. **Sim-date covered by the toolbar** (`src/styles/hud.scss`,
   `src/styles/toolbar.scss`): the 11-button dock is ~1313px wide — at any
   viewport under ~1900px it reached the left corner and covered the chip
   (measured overlap at 1280–1440). Fix: the chip parks below the dock
   (top 5.5rem) on viewports ≤2000px; the icon-only toolbar breakpoint
   raised 1180 → 1340px so the dock no longer overflows the viewport
   (Search/GitHub were clipped at 1280).

## Verification summary (2026-08-08)

- typecheck: clean · build: clean · console: 0 JS errors
- Detached zoom: 20 → 15.0003 → 20 units (exactly 1/1.25 ratio each step);
  zoom derived from actual distance on every entry (3000 → 3000, 0.3 → 0.3)
- Far-beyond-max entry: one wheel-in dollies exactly 25% (750 units) —
  previously dead; close-range entry: 25% step of 0.3 (0.075) — no tunnel
- Limits: zoomTarget pins at exactly 500 (max) and camera settles (no drift)
- Focused-mode OrbitControls wheel zoom unaffected (0.364 → 0.346 closer)
- Layout at 1280×577: toolbar 606px icon-only, fully in viewport, no
  clipping; sim-date at top 88px, below dock (bottom 70px) — no overlap;
  vision-model confirmed chip visible, toolbar not clipped

---

# STATUS — Camera-lock fix (2026-08-08, after round 5)

State: COMPLETE — selecting any body (planet / moon / Sun / ring) now keeps it
locked in the camera frame; the view no longer orbits the body on its own.
Root cause: the camera is parented to the focused body's mesh, and that same
mesh rotated every frame for the day/night spin — so the camera rode the spin
and revolved around the planet (~1.24 s per revolution for Jupiter at ×1).
Fix: split the transform hierarchy — the outer mesh (camera host) now only
translates (orbit), carries the static axial tilt, and scales (true-scale);
a new inner `spinMesh` carries the day/night rotation, plus the atmosphere
and POI labels so they stay glued to surface features. Rings handled the same
way (outer static, inner spins).

## What changed

- `src/setup/planetary-object.ts`: `mesh` is now an `Object3D` rig (never
  rotates per-frame); new `spinMesh: Mesh` = the textured body. Tilt moved
  to the rig (rings keep inheriting tilt from the parent planet, as before);
  atmosphere + POI labels reparented to `spinMesh`; `tick()` spins
  `spinMesh` only. `baseRadius` reads from `spinMesh.geometry`.
- Raycasting unchanged (findClickedBody walks parents → rig has userData.body).

## Verification summary (2026-08-08)

- typecheck: clean · build: clean
- Jupiter focus (via real key 7): camera world position moved 0.0033 units
  over 11.5 s = exactly Jupiter's own orbital drift (previously ~9 full
  revolutions ≈ 3.7-unit swing in the same window); `spinMesh` rotated
  2.4 rad in that window — surface spins, camera does not.
- Mars focus: camera delta 0.000 over 4 s; 5 POI labels render at distinct
  non-overlapping rects; day/night terminator intact.
- Real click path: pointerdown/up on Mercury's disc → focus Mercury, camera
  reparented, info card opens (new inner-mesh raycast hierarchy works).
- Vision: Jupiter + Mercury + Mars stable and centered in frame across
  screenshots; no starfield rotation, no motion artifacts.
- Free-roam / tour paths untouched (they drive fakeCamera; changeFocus
  re-parenting identical).

---

# STATUS — Improvement Round 5: Lighting, sim date, free-roam UX, labels, UI identity (2026-08-08)

Previous round: round 4 (FPS resume, split orbit rings, toolbar redesign).
State: COMPLETE — sun lighting actually lights planets, sim date rewritten on
the J2000 epoch, free-roam UI stays clickable + no Sun snap-back, POI label
collisions solved, full deep-space glass console UI identity across every
surface. Verified via console assertions + vision-model ratings + typecheck +
build. Plan: docs/superpowers/plans/2026-08-08-round5-ui-lighting.md.

## What changed this round

1. **Lighting — the "Earth/Venus dark from all sides" bug, root-caused**
   - The point light lives at the scene origin, INSIDE the Sun's sphere. The
     Sun mesh had `castShadow = true`, so it occluded every light ray — the
     sun light contributed ZERO to every planet (planets were ambient-only).
     Fixed: `Sun.mesh.castShadow = false` (script.ts) + `pointLight.decay = 0`
     (lights.ts) so sunlight reaches the whole system.
   - Tuned: point 1.15→0.95, AMBIENT_BRIGHT 0.55→0.45 (bright cloud bands
     kept texture, no clipping — verified on Jupiter's bands, exposure 10/10
     day-side with a clear night terminator on Earth, Venus, Mars, Saturn).
   - The apparent "blowout" in earlier shots was the Sun's bloom halo when it
     sat in frame behind a planet — camera framing, not lighting.

2. **Sim date rewritten on the J2000 epoch**
   - Old: `Date.now() + elapsedTime/3 days` — a real-clock base that never
     matched the planets (positions start from J2000 mean longitudes).
   - New: `J2000_EPOCH + (elapsedTime/3) * 86400000` — the date now always
     agrees with the sky; "UTC" appended to the HUD. Rate verified: ×1 = 8h
     per real second; reverse walks backwards; pause freezes (clean test
     methodology: let the 500 ms HUD throttle settle before reading).

3. **Free-roam UX**
   - **Toolbar clickable mid-flight**: pointer lock removed; mouse-look now
     uses unlocked `movementX/Y` over the canvas with `cursor: none` there —
     the cursor reappears over the toolbar, so every toggle works while
     flying (verified: ambient toggle clicked mid-flight, still flying).
     Esc exits; copy updated in the FPS hint / help / tutorial.
   - **No Sun snap-back**: on exit the camera's local radius can exceed
     `controls.maxDistance` (50 for the Sun) and OrbitControls yanks it back.
     The limits are now extended AFTER `updateCameraLimits` (which resets
     them — the original placement was clobbered) so the saved position
     survives the clamp. Verified: flew to 67.3 units, exited, camera stayed
     at 67.3 with maxDistance extended to 74.

4. **POI labels — collision-free glass chips**
   - Labels are now glass chips (dark glass, hairline, 6px radius, icon +
     uppercase text) with content wrapped in `.label-inner` so the app owns a
     transform the CSS2DRenderer won't overwrite.
   - Collision system in label.ts: per-frame anchor recovery (rect − current
     transform), vector repulsion with vertical bias, then union-find
     clusters are fanned into tidy vertical stacks (26px pitch). Offsets
     persist across frames (no reset/drift). Verified: Mars' five POIs =
     zero overlapping rects, stable over 2 s; vision confirms separated chips.

5. **UI identity — deep-space glass console (anti-slop pass)**
   - New `src/styles/tokens.scss`: the full token set (panel bg/blur/hairline,
     radius scale 16/11/8/999, panel shadow + inset highlight, single amber
     accent #ffc850 + #f5c97e text + rgba(232,163,61,0.14) fill, white
     opacity ladder 0.92/0.72/0.6/0.55/0.45, error #ff7b72, tracking 0.06em,
     Trispace) plus `%glass-panel`, `%glass-btn`, `%primary-btn` recipes.
   - Every component file refactored onto the tokens: toolbar.scss, gui.scss
     (caption pill + FULL lil-gui theme via its CSS custom properties —
     the previously stock LIGHT panel is now dark glass with amber title,
     matching the app), hud.scss (sim-date + tooltip chips), info-panel.scss,
     tutorial.scss (welcome + spotlight + tooltip), quiz.scss, help-panel.scss
     (+ fps-hint), nav-palette.scss (terracotta selection → amber),
     loading-screen.scss (uppercase Trispace title, amber "GARVIT").
   - Forbidden items respected: no purple gradients, no second accent, no
     uniform rounding, no stock buttons, no centered-logo layout changes.

## Verification summary (2026-08-08)

- typecheck: clean · build: clean
- Console: point decay 0 + Sun castShadow false; sim date J2000-anchored
  (2000-01-01 23:06 after load), 8h/s at ×1, reverse −4h, pause frozen;
  ambient slider 0.45→0.3 (lerp), toolbar toggle → 0.06 → restores 0.3;
  labels: 5 Mars POIs 0 overlaps (stable), earlier version 4–5 overlaps;
  FPS: ambient toggle mid-flight, exit at 67.3 > maxDistance 50 preserved;
  true-scale round-trip intact (Earth orbit 23,481 world units, path on
  orbit); orbit rings 13 planet + 8 moon still independent
- Vision ratings (all surfaces): settings panel "dark glass with amber
  accents, matches toolbar", info card "matches perfectly, no issues",
  quiz "consistent design language", help "cohesive console feel", palette
  "frosted glass, matches", Mars labels "styled glass chips, non-overlapping",
  Earth/Venus/Jupiter/Saturn "clear day/night terminator, no blowout"
- Screenshots: docs/screenshots/{settings-panel, info-card, quiz-card,
  help-panel, search-palette, mars-labels, free-roam-ui, earth-lighting,
  venus-lighting, jupiter-lighting}.png

## Deploy (user)

1. Create GitHub repo (e.g. `solar-system`), push: git remote add origin <url> && git push -u origin master
2. GitHub → Settings → Pages → Source: GitHub Actions (workflow .github/workflows/gh-pages.yaml already present)
3. Or locally: ./scripts/deploy-gh-pages.sh <remote-url>
4. Optional: point the GitHub button at the repo URL instead of the profile link
