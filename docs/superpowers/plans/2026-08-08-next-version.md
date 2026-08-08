# Next Version Plan — Solar System (2026-08-08)

Builds on improvement round 2 (true scale, belt, free roam, quiz, help).
Proposal list for the next version — user selects before implementation.
All features must be verified in-browser with vision-model checks (user preference).

## Prioritisation logic

- P0 = biggest value-per-effort: fixes the #1 usability gap (navigation), the #1 missing
  content (Pluto), and the #1 visual weakness (flat black background).
- P1 = strong value, mostly small-medium effort.
- P2 = wow factor / dependent on P1 work (comet needs elliptical orbits first).
- Aesthetic upgrades are deliberately 4 of 10 — the scene reads "dark void" today;
  the starfield/glow/rings/flare trio is the cheapest path to a portfolio-grade look.

## Feature map

| # | Feature | Priority | Effort | Lead files |
|---|---------|----------|--------|------------|
| 1 | Search & quick-nav palette | P0 | S | NEW nav-palette.ts, index.html, style.scss |
| 2 | Dwarf planets + Kuiper belt | P0 | M | planets.json, asteroid-belt.ts, planetary-object.ts |
| 3 | Elliptical orbits + inclination | P1 | M–H | planetary-object.ts, path.ts, solar-system.ts |
| 4 | Halley's comet + tail | P2 | M | NEW comet.ts (needs #3) |
| 5 | Procedural starfield + Milky Way | P0 | S | NEW starfield.ts, environment-map.ts |
| 6 | Fresnel atmosphere glow | P1 | S–M | NEW atmosphere shader, planetary-object.ts |
| 7 | Saturn ring overhaul | P1 | M | rings.ts, planets.json |
| 8 | Sun lens flare + corona | P2 | S | NEW lens-flare.ts |
| 9 | Screenshot mode | P1 | S | NEW screenshot.ts, index.html, hud.scss |
| 10 | Settings persistence + share links | P1 | S | gui.ts, script.ts, new settings.ts |

## Feature descriptions

### 1. Search & quick-nav palette (P0, S)
Cmd/Ctrl+K (and a toolbar magnifier button) opens a fuzzy-search palette listing all 17
bodies — type "mar" → Mars, arrows + Enter to fly there. With 17 bodies the prev/next
buttons are a long walk; this is the single biggest UX win. Keyboard nav: Esc closes,
typing filters. Reuses changeFocus + infoPanel.open. Add number-key shortcuts (1–9/0)
in the same pass.

### 2. Dwarf planets + Kuiper belt (P0, M)
Add Pluto, Ceres, Eris, Makemake, Haumea (real radius/distance/period/tilt + textures),
Pluto's moon Charon, and a Kuiper-belt ring (reuse the asteroid-belt instancing, colder
blue-grey palette, 30–50 AU band, off by default alongside the belt toggle). Pluto's
inclined, eccentric orbit needs #3 — ship circular + low inclination first, refine after.
Closes the biggest "where's Pluto?" content gap.

### 3. Elliptical orbits + orbital inclination (P1, M–H)
Replace the circular coplanar tick() math with real Kepler elements (eccentricity,
inclination, argument of perihelion) per body in planets.json. Orbit paths become
ellipses (path.ts), planets speed up at perihelion (Kepler's second law). The biggest
scientific-accuracy upgrade in the app; prerequisite for Pluto and the comet. Watch the
true-scale interplay: activeDistance becomes a function of angle, and getWorldScale stays
size-only (orbits are already in world units).

### 4. Halley's comet + tail (P2, M)
Retrograde elliptical orbit (period ~76 y), procedural particle tail that grows near
perihelion and points away from the Sun; comet is invisible/faint far out (toggle or
always-on after a distance threshold). Reuses #3's orbit math; tail = cheap instanced
points or a ribbon geometry. High wow + education value ("next perihelion 2061").

### 5. Procedural starfield + Milky Way (P0, S)
Replace the flat environment map with ~8–12k instanced star points: varied colour
(warm/cool), magnitude-based brightness, subtle twinkle (per-instance phase in a shader),
plus a faint diagonal Milky-Way band (billboarded sprite sheet or additive gradient
plane). Optional depth fade so stars don't render inside planets. Biggest single
aesthetic upgrade; cheap. Keep the env map for reflections.

### 6. Fresnel atmosphere glow (P1, S–M)
Give Earth (and Venus/Titan optionally) a real atmosphere: a slightly larger sphere with
a custom ShaderMaterial doing fresnel rim glow (additive, blue for Earth, orange for
Titan), replacing the current flat translucent cloud shell. Earth's clouds stay as the
rotating cloud layer; the glow layer is new. Small shader, huge look improvement —
especially from space at the terminator.

### 7. Saturn ring overhaul (P1, M)
Replace the single PNG ring with procedural concentric bands: A/B/C rings with the
Cassini division, slight transparency, per-band colour tinting and edge softness; cast a
ring shadow onto the planet (planar shadow trick or a dark quad projected from the
ring plane) — the classic Cassini-style shot. Keep true-scale sizing (RING_OUTER_KM).

### 8. Sun lens flare + corona (P2, S)
Screen-space lens flare (sprite stack: bright core, halo, horizontal streak) rendered
when the Sun is in view; subtle animated corona glow around the disc to complement the
bloom. Reduces the "flat orange circle" feel of the Sun at long zoom-out distances.

### 9. Screenshot mode (P1, S)
Camera button hides all UI, renders one high-res frame (e.g. 2× DPR upscale), downloads
a PNG. Pairs perfectly with #10 for shareable views. Small: composer.render + canvas
toBlob; needs a UI-hide class pass.

### 10. Settings persistence + share links (P1, S)
Persist GUI state (focus, true scale, belt, speed, ambient, paths, labels) to
localStorage so a refresh restores the scene. Optional URL params (?focus=Saturn&ts=1)
generate shareable/deep-linkable views — great for a portfolio piece and for the
verification workflow (deterministic start states).

## Parking lot (later / stretch)

- More moons: Phobos, Deimos, Enceladus, Miranda (cheap — data + textures)
- Date-jump input (set sim date; needs ephemeris-anchored clock)
- Spacecraft layer: Voyager 1/2 trajectories + flyby dates (high effort)
- PWA/offline install (vite-plugin-pwa)
- Mobile touch: on-screen joystick for free roam, larger hit targets
- Quiz expansion: difficulty tiers, more questions, new question types

## Suggested build order

1. Wave 1 (small, independent, high impact): #5 starfield · #9 screenshot · #10 persistence
2. Wave 2 (UI): #1 search palette
3. Wave 3 (content): #2 dwarf planets (circular first)
4. Wave 4 (math): #3 elliptical orbits → refine #2's Pluto → #4 comet
5. Wave 5 (aesthetics): #6 atmosphere glow · #7 rings · #8 lens flare

## Verification (per round-2 convention)

- npm run typecheck && npm run build clean
- Vision-model checks: starfield at zoom-out, Pluto/Kuiper belt, comet tail near
  perihelion, Earth terminator glow, Saturn Cassini division, lens flare, screenshot PNG
- Console assertions: palette fuzzy match + focus switch, localStorage round-trip,
  share-link parse, Kepler speeds (perihelion faster than aphelion)
