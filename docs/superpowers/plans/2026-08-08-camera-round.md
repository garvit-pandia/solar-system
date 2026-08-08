# Camera Round — orbit declutter, free-roam 3rd mode, smoothness & perf

Date: 2026-08-08. Owner: Garvit. Branch: master.

## Verified root causes (measured in live browser)

1. **Too many orbit rings from the top view** — every planet/dwarf/moon path renders at
   flat opacity 0.25 whenever `showPlanetPaths`/`showMoonPaths` is on. From the default
   top-ish view (camera ~20 units above the Sun) ALL 10 sun-orbiting rings + moon rings
   are fully visible → visual clutter.
2. **Free-roam exit yanks the camera** — exiting re-parents the camera into the focused
   body's local frame, re-enables OrbitControls with `target = body centre`, and the
   view snaps to look at the planet (plus radius clamping). User perceives "assigned to
   a planet".
3. **Free-roam ENTRY teleports the camera** — `onEnter` reparents `fakeCamera` from the
   body mesh to the scene root WITHOUT local→world conversion. Measured: entering from
   Mars jumped the camera 8.81 world units (to the Sun's vicinity). Only entering from
   the Sun (origin, scale 1) looked correct.
4. **Mouse-look stalls at screen edges** — unlocked `movementX/Y` look stops the moment
   the OS cursor pins at the viewport edge; the user cannot "keep sliding up".

## Design

### A. Orbit path decluttering — `src/setup/path-visibility.ts` (new)
Per-frame per-path opacity = `base × rankFade × distanceFade`, focus path boosted:

- **Class**: sun-orbiting (planets + dwarfs) vs moon paths. Bases 0.28 / 0.16
  (true-scale 0.30 / 0.20 — rings double as the reference grid there).
- **rankFade**: paths of the same class sorted by camera distance → nearest 1.0,
  2nd 0.62, 3rd 0.34, rest 0.08 floor (true-scale floor 0.30). From the default top
  view this leaves Mercury/Venus/Earth rings clearly visible and everything else ghosted.
- **distanceFade**: smoothstep falloff near→far (60→400 × parent world scale; moons
  20→140), floor 0.06 (true-scale 0.35).
- **Focus boost**: the focused body's own ring stays ≥ 0.5 — your "home ring" beacon.
- Cheap: preallocated temp vectors, rank arrays; material writes skipped when the
  delta is < 0.004. `applyPathVisibility` toggles remain the master switch.
- `createPath` gets adaptive segment counts (clamp(radius×96, 256, 2048)) — inner
  rings get lighter geometry; outer rings keep smoothness in true scale.

### B. Third mode: detached free camera — `src/setup/free-camera.ts` (new)
Free-roam exit no longer re-parents or re-aims. The camera STAYS at the scene root,
same position, same orientation. OrbitControls stay disabled; a tiny drag-look +
wheel-dolly controller takes over:

- Drag = look around (yaw/pitch, same sensitivity as free roam, pointer capture).
- Wheel = dolly along the view axis (×1.25/notch, lerped for smooth zoom).
- Limits: view 0.05→500 world units; true-scale 2→1.2×TRUE_SCALE_VIEW_RANGE.
- Clicking a planet (or search palette / prev / next / tour) exits detached → normal
  focused orbit (changeFocus snap).
- Re-entering free roam from detached is a pure pose continuation — nothing moves.
- Caption shows "Free roam" while detached; POI labels hidden; prev/next re-focus
  the last body before navigating (avoids `indexOf(-1)` crash).

### C. Free-roam entry fix (script.ts `onEnter`)
Capture world pose BEFORE reparenting, restore it after `scene.add`. Kills the
8.81-unit teleport. Same for the render camera.

### D. Edge-look assist (fly.ts)
When the cursor pins within 10 px of a viewport edge for >140 ms AND the last mouse
delta was pointing outward toward that edge AND no interactive element (toolbar etc.)
is under the cursor → the look continues drifting in that direction (0→~0.8 rad/s,
ramped over 350 ms). Cancels instantly on any real mouse delta or pointerdown.
No pointer lock → the round-5 "toolbar clickable mid-flight" contract survives.

### E. Flight smoothing (fly.ts)
Velocity-vector flight: target velocity from keys, lerped at ~10/s, applied as
`pos += v·dt`. Smooth accel/decel instead of instant start/stop. Speed HUD unchanged.

### F. Performance (10-round sweep)
1. UnrealBloomPass at half resolution (verify against installed three r153 source).
2. Point-light shadow map 4096 → 2048 in view mode; `castShadow = false` in true-scale
   (the cube shadow only covers 30 local units — useless at 700k-unit orbits; saves
   6 shadow passes).
3. Adaptive pixel ratio: rolling frame-time average raises/lowers DPR between 1 and
   min(devicePixelRatio, 2) (EffectComposer.setPixelRatio if present in r153).
4. Path geometry adaptive segments (above), zero per-frame allocations in faders.
5. Skip `controls.update()` work while detached (enabled=false already early-returns).

## Verification (R10)
- typecheck + build clean.
- Browser asserts: entry pose preserved (±0.01); exit pose preserved; detached parent
  = scene; rank fade opacities from top view; drift engages at edge, cancels on move;
  true-scale shadow flag; adaptive DPR reacts.
- Vision QA: top view (fewer rings), Earth view, free-roam exit/re-enter, true-scale.
- docs/STATUS.md + screenshots, commit.
