# STATUS — Improvement Round 3: P0 pack (2026-08-08)

Previous round: improvement round 2 (true scale, belt, free roam, quiz, help).
State: COMPLETE — all three P0 items from docs/superpowers/plans/2026-08-08-next-version.md
implemented & verified (console assertions + vision-model checks + objective pixel
measurements + typecheck + build). P1/P2 items intentionally NOT touched.

## What changed this round

1. **Search & quick-nav palette (P0 #1)**
   - New `src/setup/nav-palette.ts` + `src/styles/nav-palette.scss`: Ctrl/Cmd+K or the
     new toolbar magnifier button opens a fuzzy-search palette over all 23 bodies.
     Subsequence matching with prefix/word-start/consecutive-run scoring; matched
     characters highlighted; ↑/↓ + Enter to fly; Esc / backdrop to close; type badges
     (Planet / Dwarf planet / Moon / Ring).
   - Number-key shortcuts 1–9/0 jump straight to the ten classic bodies (same order as
     the prev/next buttons) — added in the same pass per the plan.
   - Reuses `changeFocus` + `infoPanel.open`; exits FPS mode before navigating.
   - Bug found & fixed during verification: `#nav-palette { display:flex }` overrode the
     `hidden` attribute, so the palette was visible on load with an empty list. Fixed
     with `&[hidden] { display:none }`.

2. **Dwarf planets + Kuiper belt (P0 #2)**
   - Six new bodies in `planets.json` with real NASA/JPL data: Ceres (2.77 AU),
     Pluto (39.48 AU, 90,560 d, 1,188.3 km, tilt 122.5°), Charon (orbits Pluto at
     19,640 km, tidally locked), Eris (67.7 AU), Makemake (45.4 AU), Haumea (43.2 AU).
     23 bodies total. Pluto added to the ephemeris (J2000 mean longitude 238.96°).
   - Textures: Pluto + Charon are the real NASA New Horizons global maps (public
     domain); Ceres/Eris/Makemake/Haumea use solarsystemscope reconstructed maps
     (CC BY 4.0) — noted honestly in README, since no full surface maps exist.
   - `asteroid-belt.ts` refactored into a config-driven `InstancedBelt`; the Kuiper
     belt is a second instance (cold blue-grey rocks, wider band, 2600 rocks, inner
     edge at the real 30 AU). View-mode radii 30–50 keep the real 30:50 AU ratio so
     true-scale lands exactly (inner edge 704,310 world units = 30 AU, verified).
   - New GUI checkbox "Kuiper Belt" (off by default, like the asteroid belt);
     `setTrueScale` wired into `applyScaleMode`.

3. **Procedural starfield + Milky Way (P0 #5)**
   - New `src/setup/starfield.ts`: 10,000 instanced star points on a Fibonacci sphere,
     temperature palette (orange K/M, white, blue-white, blue O/B), magnitude-based
     brightness, per-star twinkle (phase+speed attributes in a custom ShaderMaterial),
     additive blending, depth-tested so planets occlude stars.
   - Milky Way: a spherical cap around the galactic plane with a procedural Gaussian
     glow texture (exp falloff + subtle value-noise mottle, warm-white tint). The cap
     shows a full 360° great circle like the real galaxy, visible from every angle.
     Design decision: the real-sky map was tried first (solarsystemscope 2k map) but
     its own sharp band edges and faint-map-star density created visible seams against
     the procedural starfield; the procedural Gaussian is mathematically guaranteed
     smooth (verified: max 2–3/255 luminance steps between 2px samples across the band
     edge, vs 16→<6 for the map and 217 at the Sun's limb).
   - The shell follows the camera ("stars at infinity") and scales with the far plane
     so it works in both view and true-scale modes.
   - The env map is kept as `scene.environment` (reflections) per the plan; the
     background is now the starfield (near-black `0x01030a`).
   - **Critical bug found & fixed**: the star shell was never scaled to its radius —
     unit-sphere points rendered ~1000 px full-screen additive discs (10k of them),
     which saturated the frame white and froze the GPU. Fixed by scaling the Points to
     the shell radius AND compensating for the camera's parent-mesh scale in true-scale
     mode (the camera is a child of the focused body's mesh, so view space is scaled by
     that mesh — without the compensation, stars were 65× too large/small depending on
     focus). Verified star sizes identical in both scale modes.

## Verification summary (2026-08-08)

- typecheck: clean · build: clean
- Console assertions: 23 bodies; Pluto view orbit 32.25 (real 32.28), Charon 0.2076;
  palette open→filter("plu"→[Pluto])→Enter→focus Pluto + info card; digits 3→Venus,
  0→Neptune; "ma"→[Makemake, Mars, Haumea] (Makemake correctly outranks Mars); Kuiper
  toggle via real GUI checkbox; true-scale shell math exact (star scale 1.113e8 =
  0.85·far·SunScale, uniform 1.955e6)
- Vision checks: starfield (colored stars + diagonal MW band, no artifacts) in view AND
  true-scale modes; Pluto close-up with Tombaugh Regio + Charon; Kuiper belt (cool grey
  outer band) + asteroid belt (warm inner band) from Pluto; palette UI (badges,
  highlight, selection, footer); Earth (continents/clouds); Saturn (Cassini division);
  Sun; all clean
- Objective pixel measurements: Milky Way band luminance profile is a smooth Gaussian
  (peak 32–44, max 2–3/255 step per 2px) — no hard edges; band core never saturates
- Screenshots refreshed in docs/screenshots/ (sun, earth, saturn, pluto, kuiper-belt,
  search-palette, true-scale) — README updated with the new features, screenshots and
  texture attributions

## Deploy (user)
1. Create GitHub repo (e.g. `solar-system`), push: git remote add origin <url> && git push -u origin master
2. GitHub → Settings → Pages → Source: GitHub Actions (workflow .github/workflows/gh-pages.yaml already present)
3. Or locally: ./scripts/deploy-gh-pages.sh <remote-url>
4. Optional: point the GitHub button at the repo URL instead of the profile link
