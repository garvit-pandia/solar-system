# STATUS — Improvement Round 4: UI overhaul + orbit rings + FPS resume (2026-08-08)

Previous round: improvement round 3 (P0 pack — search palette, dwarf planets,
Kuiper belt, starfield). State: COMPLETE — free-roam position resume, single
ambient control, split planet/moon orbit-ring toggles, full toolbar redesign,
two critical orbit-ring bugs fixed; verified via console assertions +
vision-model checks + screenshots + typecheck + build.

## What changed this round

1. **Free-roam FPS resumes where you quit**
   - `script.ts` `onExit` now captures the world-space position AND quaternion
     before re-parenting the camera, then converts them into the focused
     body's local frame (correct under scaled true-scale meshes) instead of
     snapping to `(minDistance, minDistance/3, 0)`.
   - `fly.ts` `enter()` now derives yaw/pitch from the camera's current
     quaternion, so re-entering free roam keeps the same look direction too.
   - The bottom nav pill is hidden while flying (`body.fps-active .caption`)
     — it previously overlapped the FPS hint at the same bottom-centre spot.

2. **Ambient light — one control, working properly**
   - The lil-gui "Ambient Intensity" slider was REMOVED. The toolbar Ambient
     button is now the single canonical control (day `0.55` / night `0.06`,
     `AMBIENT_BRIGHT` / `AMBIENT_DIM` in gui.ts), with a smooth fade in the
     main tick loop instead of an instant jump.
   - The old button logic (`intensity === 0.1 ? 0.5 : 0.1`) was stateful
     hackery that misbehaved after any GUI slider use — gone.

3. **Orbit rings — two separate toggles + two critical bug fixes**
   - `options.showPlanetPaths` (bodies orbiting the Sun: all 8 planets + 5
     dwarf planets = 13 rings) and `options.showMoonPaths` (8 moon rings:
     Moon, Charon, Ganymede, Titan, Callisto, Io, Europa, Triton) replace the
     single broken `showPaths`. Rings of Saturn no longer gets a degenerate
     zero-radius path (`planetary-object.ts` skips `type === "ring"`).
   - **Bug #1 (the "toggle orbit is not working" report):** `applyTrueScale`
     reset every path's scale to `1` when leaving true scale — a unit circle
     — collapsing all orbit rings onto their parent body. Also the true-scale
     ring radius was `activeDistance/baseDistance` instead of
     `activeDistance`, so rings didn't match the real orbits. Fixed: path
     scale = `activeDistance` in true scale (world radius = parentWorld ×
     activeDistance = real orbit, verified Earth = 23,481 = 149.6M km ÷ 6371)
     and `baseDistance` in view mode.
   - **Bug #2:** true-scale force-show of the planet rings (reference grid)
     was never restored on exit — `savedPlanetPaths` now remembers the user's
     choice and restores it (verified: off → true scale on (forced) → off →
     back to off).
   - `applyPathVisibility(solarSystem)` + `syncToolbar()` centralise ring
     visibility and button pressed-states.

4. **Toolbar redesign (modern dock)**
   - Old floating icon row replaced by a glassmorphic dock (`toolbar.scss`):
     grouped sections (Navigation · Orbits · Display · Modes · Extras) with
     separators, icon + label buttons, warm-amber active states
     (`aria-pressed` + `.is-active`), hover lift, focus rings; collapses to
     icon-only below 1180px.
   - All 13 icons redrawn as consistent stroke icons (magnifier, planet-ring,
     moon-ring, sun rays, map pin, rocket, play, lightbulb, gear, help,
     GitHub octocat, chevrons).
   - Bottom focus nav restyled as a matching glass pill with round chevron
     buttons.
   - **Bonus fix:** the Labels toggle was broken since round 1 — it toggled
     the render camera's layers, which `camera.copy(fakeCamera)` overwrote
     every frame (Object3D.copy copies layers). Now toggles the fakeCamera
     (source of truth); verified POI labels hide/show.

5. **Docs & tutorial updated** — tutorial steps re-targeted (`#btn-paths` →
   `#btn-planet-paths` + new Moon Orbits step), help panel rewritten for the
   new toolbar, free-roam resume documented.

## Verification summary (2026-08-08)

- typecheck: clean · build: clean
- Console assertions: 13 planet rings + 8 moon rings all visible; ring
  excluded; toggles independent (planet off → moons still on, and vice
  versa); aria-pressed + is-active synced; ambient smooth fade 0.55 → 0.06;
  labels toggle hides exactly the focused body's POIs; FPS enter → fly →
  exit → world position preserved to <0.01 units (0,20,0 → 0,18,0 → 0,18,0)
  and re-enter continues from the same spot with look direction resumed;
  true-scale round-trip: Earth ring world radius 23,481 = exact real orbit,
  restored to 7.4126 on exit
- Vision checks: toolbar (glass dock, gold active states, labels, no
  overlap), planet orbit rings as full concentric circles with planets on
  them, Earth close-up with Moon sitting on its ring, moon-ring toggle
  (button greyed + ring gone, Earth ring intact), ambient day vs night
  (strong vs muted contrast), free-roam HUD (nav pill hidden)
- Screenshots refreshed: docs/screenshots/{toolbar-ui, orbit-rings,
  moon-orbit-ring, ambient-on, ambient-off, free-roam-hud}.png

## Deploy (user)

1. Create GitHub repo (e.g. `solar-system`), push: git remote add origin <url> && git push -u origin master
2. GitHub → Settings → Pages → Source: GitHub Actions (workflow .github/workflows/gh-pages.yaml already present)
3. Or locally: ./scripts/deploy-gh-pages.sh <remote-url>
4. Optional: point the GitHub button at the repo URL instead of the profile link
