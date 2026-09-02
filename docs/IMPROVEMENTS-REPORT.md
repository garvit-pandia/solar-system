# Improvement Report — Solar System Model
*Prepared 2026-09 · scope: everything below is implementable in-repo by the assistant, with no new backend, paid APIs, or external services.*

---

## Executive summary

The app is a Three.js solar-system simulator with three camera modes (focused orbit, first-person free roam, detached free camera), a true-scale mode, ephemeris-accurate *direction* of travel, POI labels, a cinematic tour, quiz, and — as of the latest working session — a redesigned left icon rail, a correct sim-date clock, a smoother Milky Way, and a batch of performance and correctness fixes (raycast filtering, belt flicker, bloom-dispose leak, loader robustness, mobile layout).

What separates it from the best-in-class references — [NASA's Eyes on the Solar System](https://eyes.nasa.gov/apps/solar-system) and [Solar System Scope](https://www.solarsystemscope.com/) — is no longer polish (that gap is largely closed) but **science depth and sensory experience**: orbits are circular and coplanar, the sky is procedural rather than real, planets have no atmosphere scattering or night lights, and nothing is audible or shareable. The list below is ranked by *value per unit of implementation effort*, where value = demo impact × educational credibility × retention.

**Payload note driving #8:** the JS bundle is ~576 KB gzipped to ~151 KB, but `static/textures` is **20 MB** (17.6 MB of JPGs). Textures now dominate load time and, because JPG decompresses to raw RGBA in VRAM, they dominate GPU memory too — a 2048² JPG costs ~16 MB VRAM regardless of its file size ([Utsubo, 100 Three.js Tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)).

---

## Top 10 at a glance

| # | Improvement | Kind | Effort | Impact |
|---|---|---|---|---|
| 1 | Real Keplerian orbits + time travel to any date | Science | Medium | ★★★★★ |
| 2 | Real star sky (HYG catalog) + constellations | Science/Visual | Medium | ★★★★★ |
| 3 | Atmosphere scattering rim + Earth night lights | Visual | Medium | ★★★★☆ |
| 4 | Animated true-scale morph | Wow | Small–Medium | ★★★★☆ |
| 5 | Motion trails + living orbit lines | Feel | Small | ★★★★☆ |
| 6 | Cinematic mode + one-click screenshot | Shareability | Small | ★★★★☆ |
| 7 | Procedural sound design (WebAudio, zero assets) | Immersion | Small | ★★★★☆ |
| 8 | Asset diet: KTX2 textures + sphere LOD | Performance | Medium | ★★★★☆ |
| 9 | Live telemetry HUD | Credibility | Small | ★★★☆☆ |
| 10 | Alignment & eclipse detector | Wild card | Medium | ★★★☆☆ |

Recommended order: quick wins first (**6 → 7 → 9 → 5**), then the science core (**1 → 3 → 4**), then the heavy hitters (**2 → 8**), and the wild card (**10**) last — it builds directly on #1's orbit math.

---

## Detail cards

### 1 — Real Keplerian orbits + time travel to any date
**What.** Replace the circular, coplanar orbits (and the mean-longitude-only ephemeris) with J2000 osculating elements — semi-major axis, eccentricity, inclination, node, perihelion, mean anomaly — solved each frame with a small Newton–Raphson Kepler solver (~60 lines). Add a date picker: "go to any date" (past or future), a "Now" button, and date-based bookmarks ("your birthday's sky").
**Why it's the top item.** Every credible simulator's core promise is *the sky is real*. Today Mercury's orbit is a perfect circle at 0° inclination; with elements, Mercury's 7° tilt and Pluto's 17° tilt become visible, perihelion speed-ups (Kepler's 2nd law) appear at ×100 speed, and the date picker turns the sim into an observatory. This is exactly the feature set both NASA Eyes and Solar System Scope lead with.
**How here.** Extend `setup/ephemeris.ts` (already owns J2000 seeding, done earlier). `PlanetaryObject.tick()` switches from `sin/cos(orbit) × distance` to `element → true anomaly → r → heliocentric (x,y,z)`; the existing `activeDistance`/true-scale machinery multiplies the resulting vector. A ~2 KB JSON adds elements for 8 planets + 6 dwarfs. The sim-date HUD already ticks from a seeded clock — it becomes the single source of truth and the picker writes to it.
**Risk.** Moon orbits stay simplified (circular around parents) — acceptable and honest if labelled.

### 2 — Real star sky: HYG catalog + constellations
**What.** Swap the 10k procedural stars for the real [HYG database](https://www.astronexus.com/projects/hyg) (Hipparcos+Yale+Gliese; use its ~9k "bright" subset). RA/Dec/magnitude/color-index → a ~300 KB prebuilt JSON → the existing `BufferGeometry` points shader (it already supports per-star color and size — only the data source changes). Add toggleable constellation lines from Stellarium-derived line data, and a "look up from Earth" mode (camera pinned to Earth's night side).
**Why.** The procedural sky is pretty but says nothing; the real one answers "what am I actually looking at?" — Orion over there, Sirius brightest, constellations drawn. Huge educational + wow delta for an audience that will screenshot it. Precedent: [three-starmap](https://github.com/mathiasbno/three-starmap) renders HYG + 88 constellations as a single three.js point mesh.
**How here.** One-time script (run by me) generates `static/data/stars.json` + `constellations.json`; `starfield.ts` gains a data-loader path with the procedural field as fallback. Constellation lines are one `LineSegments` on the same sky shell.

### 3 — Atmosphere rim-light + Earth night lights
**What.** Two shader upgrades: (a) a Fresnel rim-scatter shell per atmosphere planet (Rayleigh-ish tint: blue Earth, yellow Venus, faint blue gas giants) instead of today's inset cloud-sphere hack; (b) Earth's night side gets an emissive city-lights mask blended by the sun-direction dot product (inject via `onBeforeCompile`, no full custom shader).
**Why.** Atmosphere is the single biggest "this looks real" cue missing. Planets currently have hard, toy-like edges against space; a soft scattering rim is the difference between a textured ball and a world. City lights give the dark side something to look at (today it's flat black) and are a beloved NASA-Eyes detail.
**How here.** `planetary-object.ts → createAtmosphereMesh()` swaps the textured Phong sphere for a back-side additive Fresnel shell (uniforms: color, power, intensity). Earth material gains a night-lights texture (public domain NASA Black Marble) + a small shader chunk.

### 4 — Animated true-scale morph
**What.** The true-scale toggle currently snaps every body instantly. Instead, animate scales, orbit distances and the camera over ~1.5 s with easing — the Sun visibly swells ×109, orbits stream outward, planets shrink to specks — with counter annotations ("Sun = 109 × Earth") fading in during the morph.
**Why.** True scale is the app's best "teachers love this" feature and the snap throws the moment away. The *transition* is the story: it communicates the emptiness of space viscerally. Cheap to build on the existing `applyTrueScale` machinery.
**How here.** Wrap `applyTrueScale` in a lerp: store start/end scale + `activeDistance` per body, tween in `tick()`, retarget the camera via a slow dolly. Reuses the PathFader config switch already in place.

### 5 — Motion trails & living orbit lines
**What.** Give each body a fading comet-tail trail (rolling world-position history → ribbon with alpha gradient) and let orbit rings keep their declutter fader but add a subtle animated dash "flow" showing travel direction.
**Why.** At the default speed the system reads as static; motion is what makes a simulation feel alive. Trails also teach Kepler's 2nd law for free once #1 lands (trails visibly stretch at perihelion).
**How here.** One `TrailRenderer`-style class (fixed-length `Float32` ring buffer, one `MeshLine`/ribbon per body, ~200 lines). Trails only for planets + dwarfs; moons inherit short ones. Rings already have materials per body via `PathFader` — add `dashOffset` animation there.

### 6 — Cinematic mode + one-click screenshot
**What.** One key (`H` / rail button): fade out every UI layer, letterbox bars, and take a screenshot; a second key restores. Screenshot button saves a PNG at native resolution.
**Why.** This app's best marketing is its users' screenshots. Today that's impossible (WebGL canvas can't be right-click-saved without `preserveDrawingBuffer`), and UI can't be hidden short of entering free roam. Cheapest shareability win available.
**How here.** A `cinematic.ts` that toggles a `body.cinematic` class (CSS handles fades/letterbox) and, for capture, runs `bloomComposer.render()` then `canvas.toDataURL()` synchronously in the same task — no renderer flag needed. ~120 lines total.

### 7 — Procedural sound design (WebAudio, zero payload)
**What.** A mute-by-default-able ambient layer: deep-space drone (two detuned oscillators through a slow-swept lowpass), soft ticks on UI buttons, a sub-bass whoosh on focus flights, gentle chimes on quiz answers. All synthesized at runtime — no audio files.
**Why.** Every reference product sells *presence*; silence breaks the spell in free roam more than any visual flaw. Synthesis means zero download cost and no licensing questions.
**How here.** A small `audio.ts` (AudioContext lazily created on first user gesture — browser policy), ~10 synth presets as functions, wired into existing events (`changeFocus`, tour `flyTo`, quiz `answerWith`). Persisted mute in `localStorage` next to the tutorial key.

### 8 — Asset diet: KTX2 textures + LOD spheres
**What.** Convert the 20 MB texture folder to KTX2/Basis (GPU-native compression: BC7/ASTC/ETC2), transcode via `KTX2Loader`, and give bodies distance-based sphere LOD (64-seg for the focused body, ≤16-seg beyond a threshold) instead of today's uniform 64×64.
**Why.** Biggest remaining real perf lever: JPG/PNG "decompress fully in GPU memory — a 200 KB PNG can occupy 20 MB+ of VRAM" ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)); Basis stays compact and transcodes at load ([Reddit r/threejs](https://www.reddit.com/r/threejs/comments/1tseqjc/threejs_textureheavy_scenes_hit_vram_limits_fast/)). Expected: 20 MB → ~4–6 MB download, ~70–90% VRAM reduction, faster loads on phones, headroom for #3's shaders. LOD guidance per [Codrops](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/).
**How here.** I script `gltf-transform`/`toktx` conversion into `scripts/build-textures.mjs`, wire `KTX2Loader` into `textures.ts` with JPG fallback, and add a tiny distance-swap in `PlanetaryObject.tick()` (or `THREE.LOD` per body).

### 9 — Live telemetry HUD
**What.** A monospace strip under the sim date: distance camera→focus (km + AU, live), focus orbital velocity (km/s), current scale ("1 px ≈ N km"), and sim rate. Updates on the existing 500 ms throttle.
**Why.** Turns pretty into *instrumented*. Numbers ticking as you zoom (watch AU flip to km) is quietly delightful, costs ~80 lines, and reinforces the true-scale lesson. It's the dashboard-feel that makes NASA Eyes feel authoritative.
**How here.** Pure readout from state the app already computes (`focusAimPos`, `options.speed`, `getWorldScale`). No new subsystems.

### 10 — Alignment & eclipse detector (wild card)
**What.** A throttled background scan of the *actual* simulated positions: "Venus, Earth and Mars within 5° of alignment as seen from the Sun", "lunar eclipse: Moon entering Earth's shadow", "superior conjunction: Mercury behind the Sun" → a toast with a "fly there" button.
**Why.** The wildcard that turns a model into an observatory — the sim *notices things before you do*. Strong retention story ("it pinged me that a transit was starting"), and with #1's real elements the detections are scientifically meaningful (angular-separation checks only — no new math beyond dot products).
**How here.** `events.ts` runs every ~500 ms over body world positions (already cached for PathFader), raises toasts via the existing tooltip/HUD idiom, and reuses `NavPalette.onSelect` for "fly there".

---

## Honorable mentions (not top-10, noted for the roadmap)
- **Spacecraft mission layer** (Voyager 1/2, Apollo, Perseverance as flyable POIs) — the signature NASA Eyes feature; big data/acquisition effort.
- **Size-comparison mode** — two bodies side by side with a scale bar; cheap, educational, fun.
- **PWA/offline install** — manifest + service worker so the sim opens offline; easy after #8.
- **Gamepad flight** for free roam — the Gamepad API maps eerily well to the existing WASD+mouse controller.
- **WebGPU renderer** — future-proofing only; WebGL2 remains the right target for a portfolio piece today.

## Sources
- [NASA Eyes on the Solar System](https://eyes.nasa.gov/apps/solar-system) · [NASA's Eyes overview](https://science.nasa.gov/eyes/)
- [Solar System Scope](https://www.solarsystemscope.com/) · [TheSkyLive 3D Solar System](https://theskylive.com/3dsolarsystem)
- [100 Three.js Tips That Actually Improve Performance (2026) — Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Building Efficient Three.js Scenes — Codrops (2025)](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)
- [Three.js texture-heavy scenes & VRAM — r/threejs](https://www.reddit.com/r/threejs/comments/1tseqjc/threejs_textureheavy_scenes_hit_vram_limits_fast/)
- [Draw Calls: The Silent Killer — Three.js Roadmap](https://threejsroadmap.com/blog/draw-calls-the-silent-killer)
- [HYG Database — Astronexus](https://www.astronexus.com/projects/hyg)
- [three-starmap — HYG + 88 constellations in three.js](https://github.com/mathiasbno/three-starmap)
- [gltfpack / meshoptimizer](https://meshoptimizer.org/gltf/) · [gltf-progressive — Needle Engine](https://engine.needle.tools/docs/gltf-progressive/)
