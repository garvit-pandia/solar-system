# STATUS — Improvement Round 2 (2026-08-08)

Previous round: feature pack (2026-08-07) — see git history.
State: COMPLETE — all items implemented & verified (console assertions + vision-model checks + typecheck + build)

## What changed this round

1. **Rebrand — fully Garvit's project**
   - GitHub button now links to https://github.com/garvit-pandia (upstream fork link removed)
   - All upstream author references removed (README, index.html, plan doc); loading screen credits Garvit
   - README rewritten with current features + local screenshots (docs/screenshots/*.png)

2. **True scale fixed (was: messy / out of proportion)**
   - Real NASA/JPL data: all radii now real mean radii (Earth 6371, Sun 696000, Jupiter 69911…), distances = real semi-major axes (Mercury 57.9e6 km … Neptune 4495.1e6 km)
   - True-scale mode now scales SIZES *and* ORBITS: 1 world unit = 1 Earth radius — verified exact: Mercury orbit 9088, Earth 23481, Neptune 705556, Moon 60.3 units from Earth, Sun 109 Earth radii, Saturn ring 22 units
   - Orbit paths auto-enabled as reference grid in true scale; far plane 2e6, zoom speed 2×, zoom-out range 120,000 units (belt visible from the Sun)
   - Fixed stale camera-limit bug (changeFocus read the old focus's limits — prev/next left wrong min-distance)

3. **Asteroid belt: off by default + realistic**
   - Starts hidden (GUI toggle opts in)
   - 3 rock geometries (dodeca/icosa/octahedron), power-law size distribution, grey/brown/tan palette w/ per-instance brightness scatter, varied band thickness, plus a faint procedural dust ring
   - Scales correctly in true-scale mode (inner edge lands at real 329e6 km)
   - Vision-verified: diffuse dusty band at distance; varied angular rocks close-up

4. **Free-roam first-person camera** (new rocket button)
   - Pointer-lock mouse look, WASD, Space/C vertical, Shift boost, scroll speed adjust (×1.25 steps, 1/4096…4096)
   - Speed scales with the focused body's world scale; HUD hint with live speed; Esc or button exits back to orbit
   - Guards: no planet picking while flying, prev/next disabled, tour auto-exits, unhandled pointer-lock rejection caught

5. **Quiz fixed** — answer chips are now real clickable buttons (were inert divs)
   - Chips highlight correct/wrong, keyboard-focusable; 3D planet clicking still works as an alternative
   - Verified full round: 5/6 scoring, result screen, best-score persistence (localStorage solar-quiz-best)

6. **Sim date verified + hardened**
   - Advance rate consistent with orbital motion (8h/sim-second at ×1), pause freezes it, reverse runs it backwards, presets work
   - dt clamped to 0.1 s so a background-tab resume can't teleport the date/planets

7. **Controls & features reference** (help button / welcome card)
   - New help panel: camera & navigation, every simulation control (Ambient Intensity, Show Moons, Run, Speed Preset, Reverse Time, Speed, True Scale, Asteroid Belt), every toolbar button, sim date explainer, Guided tour link, GitHub footer
   - Tutorial extended with Free roam + Controls & features steps; welcome card gains "Controls & features" button

8. **Controls audit** — every GUI control and toolbar button exercised via the real UI (values/state asserted): Ambient Intensity, Show Moons, Run, Speed Preset, Reverse Time, Speed, True Scale, Asteroid Belt, tour, quiz, FPS, help, prev/next, ambient/labels/paths/settings buttons

## Verification summary (2026-08-08)
- typecheck: clean · build: clean
- Vision checks: Sun, Earth (6,371 km card), Saturn (58,232 km card + rings), Mars (POI labels), true-scale (point-Sun + orbit grid + belt band), belt close-up (varied rocks), help panel — all clean, no artifacts
- Console assertions: exact true-scale world distances, GUI toggles, quiz round, FPS enter/exit/movement/boost, sim date pause/reverse/rate, tour start/cancel, belt default off
- Screenshots saved to docs/screenshots/ (sun, earth, saturn, mars, true-scale) for the README

## Deploy (user)
1. Create GitHub repo (e.g. `solar-system`), push: git remote add origin <url> && git push -u origin master
2. GitHub → Settings → Pages → Source: GitHub Actions (workflow .github/workflows/gh-pages.yaml already present)
3. Or locally: ./scripts/deploy-gh-pages.sh <remote-url>
4. Optional: point the GitHub button at the repo URL instead of the profile link
