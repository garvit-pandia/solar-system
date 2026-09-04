import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { createEnvironmentMap } from "./setup/environment-map";
import { createStarfield } from "./setup/starfield";
import { createLights } from "./setup/lights";
import {
  createSolarSystem,
  applyTrueScale,
  captureScaleState,
  applyScaleState,
  lerpScaleState,
  getWorldScale,
  TRUE_SCALE_VIEW_RANGE,
} from "./setup/solar-system";
import type { ScaleSnapshot } from "./setup/solar-system";
import { initialElapsedTime, simDateMsFromElapsed } from "./setup/ephemeris";
import { enableKTX2 } from "./setup/textures";
import {
  createGUI,
  options,
  applyPathVisibility,
  syncToolbar,
} from "./setup/gui";
import { LAYERS } from "./constants";
import { InfoPanel } from "./setup/info-panel";
import { Tutorial } from "./setup/tutorial";
import { HelpPanel } from "./setup/help-panel";
import { Body, PlanetaryObject } from "./setup/planetary-object";
import { createAsteroidBelt, createKuiperBelt } from "./setup/asteroid-belt";
import { NavPalette } from "./setup/nav-palette";
import { Quiz } from "./setup/quiz";
import { CinematicTour } from "./setup/tour";
import { FreeRoam } from "./setup/fly";
import { FreeCamera } from "./setup/free-camera";
import { PathFader } from "./setup/path-visibility";
import { Cinematic, showToast } from "./setup/cinematic";
import { MotionTrails } from "./setup/trail";
import { createTelemetry, computeKmPerUnit } from "./setup/telemetry";
import { TimeTravel } from "./setup/time-travel";
import { EventScanner } from "./setup/events";
import { updateOrbitFlow } from "./setup/path";

THREE.ColorManagement.enabled = false;

const isEffectivelyVisible = (object: THREE.Object3D | null): boolean => {
  while (object) {
    if (!object.visible) return false;
    object = object.parent;
  }
  return true;
};

const findClickedBody = (hits: THREE.Intersection[]): Body | null => {
  for (const hit of hits) {
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const body = object.userData.body as Body | undefined;
      if (body) {
        // The raycaster ignores visibility — skip bodies hidden by a GUI
        // toggle (e.g. Show Moons off) and keep looking at the next hit.
        if (isEffectivelyVisible(object)) return body;
        break;
      }
      object = object.parent;
    }
  }
  return null;
};

// Canvas
const canvas = document.querySelector("canvas.webgl") as HTMLElement;

// Scene
const scene = new THREE.Scene();

// Environment map — kept for reflections; the background itself is now the
// procedural starfield.
scene.environment = createEnvironmentMap("./textures/environment");
scene.background = new THREE.Color(0x01030a);

// Procedural starfield + Milky Way band (replaces the flat background).
const starfield = createStarfield(scene);
// Upgrade to the real sky (HYG catalog + 88 constellation figures) when the
// data arrives; the procedural field stays as the offline fallback.
void starfield.loadRealSky();

// Lights
const [ambientLight, pointLight] = createLights();
scene.add(ambientLight, pointLight);

// Sizes
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  fakeCamera.aspect = sizes.width / sizes.height;
  fakeCamera.updateProjectionMatrix();

  // Update renderers
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(currentDPR);
  bloomComposer.setSize(sizes.width, sizes.height);
  // The bloom pass's internal mip chain is fixed at construction size —
  // rebuild it so the halo stays half-resolution relative to the window.
  rebuildBloom();
  labelRenderer.setSize(sizes.width, sizes.height);
});

document.getElementById("btn-previous")?.addEventListener("click", () => {
  if (fps.active) return;
  if (detached) {
    // No planet is selected — re-focus the last body first, then step.
    changeFocus(options.focus, options.focus);
  }
  const index = planetNames.indexOf(options.focus);
  const newIndex = index === 0 ? planetNames.length - 1 : index - 1;
  const focus = planetNames[newIndex];
  changeFocus(options.focus, focus);
  options.focus = focus;
});

document.getElementById("btn-next")?.addEventListener("click", () => {
  if (fps.active) return;
  if (detached) {
    changeFocus(options.focus, options.focus);
  }
  const index = (planetNames.indexOf(options.focus) + 1) % planetNames.length;
  const focus = planetNames[index];
  changeFocus(options.focus, focus);
  options.focus = focus;
});

// Renderer — created BEFORE the solar system so the KTX2 support probe can
// run against the GL context before any body loads its textures.
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});

renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
enableKTX2(renderer);

// Solar system
const [solarSystem, planetNames] = createSolarSystem(scene);

// The point light lives at the Sun's centre — if the Sun mesh cast
// shadows it would occlude every ray and black out the whole system.
solarSystem["Sun"].mesh.castShadow = false;

// Asteroid belt
const asteroidBelt = createAsteroidBelt(scene);

// Kuiper belt (icy outer belt, 30–50 AU)
const kuiperBelt = createKuiperBelt(scene);

const FAR_VIEW = 1000;
const FAR_TRUE_SCALE = 2_000_000;

const setCameraFar = (far: number) => {
  camera.far = far;
  camera.updateProjectionMatrix();
  fakeCamera.far = far;
  fakeCamera.updateProjectionMatrix();
};

const updateCameraLimits = (focusName: string) => {
  const object = solarSystem[focusName];
  const worldScale = options.trueScale ? getWorldScale(focusName) : 1;
  // The camera lives as a child of the focused body's mesh, so OrbitControls
  // sees LOCAL units. The mesh scale provides the world-space factor — the
  // local limits therefore stay valid in both scale modes.
  controls.minDistance = object.getMinDistance();
  controls.maxDistance = Math.max(
    50,
    (options.trueScale ? TRUE_SCALE_VIEW_RANGE : 50) / worldScale
  );
};

// When true-scale forces the planet orbit rings on as a reference grid,
// this remembers the user's choice so it can be restored on exit.
let savedPlanetPaths: boolean | null = null;

// ─── Camera mode state machine ────────────────────────────────────────────
// Three modes:
//   focused  — camera is a child of the focused body's mesh, OrbitControls
//              orbits around the body (the classic mode).
//   free roam — camera is a scene-root child, FreeRoam FPS flight drives it.
//   detached — "third mode": after exiting free roam the camera STAYS at the
//              scene root, exactly where it was, and the FreeCamera
//              controller provides drag-look + wheel-dolly. No planet is
//              selected; clicking a planet (or search/prev/next/tour)
//              returns to focused mode. Re-entering free roam continues
//              from the same pose — nothing moves.
let detached = false;
const captionEl = document.querySelector(".caption p") as HTMLElement;

const setDetached = (value: boolean): void => {
  if (detached === value) return;
  detached = value;
  if (value) {
    freeCamera.enter();
    controls.enabled = false;
    solarSystem[options.focus].labels.hidePOI();
    infoPanel.close();
    captionEl.innerHTML = "Free roam";
  } else {
    freeCamera.exit();
    controls.enabled = true;
  }
};

// True-scale morph: the toggle ANIMATES scales, orbit distances and paths
// over ~1.6s (the Sun visibly swells, orbits stream outward) instead of
// snapping — the transition itself teaches the emptiness of space.
const scaleMorph = {
  active: false,
  t: 0,
  duration: 1.6,
  from: null as ScaleSnapshot | null,
  to: null as ScaleSnapshot | null,
  enabled: false,
};

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const applyScaleMode = (enabled: boolean) => {
  // Morph the geometry FIRST: capture the start, let applyTrueScale compute
  // the targets, then reset the visuals to the start — tick() tweens them.
  // (Everything below — belts, bloom, far plane, ring visibility — flips
  // with the toggle immediately; only the geometry eases.)
  const from = captureScaleState(solarSystem);
  applyTrueScale(solarSystem, enabled);
  const to = captureScaleState(solarSystem);
  applyScaleState(solarSystem, from);
  asteroidBelt.setTrueScale(enabled);
  kuiperBelt.setTrueScale(enabled);
  // Fader config + parent-scale cache for the END state (worldScales now
  // describe the target; refreshed again when the tween finishes).
  pathFader.applyTrueScale(enabled);
  // The giant true-scale Sun blows out the bloom halo into a muddy blob —
  // tone the bloom down while true scale is active.
  bloomStrength = enabled ? 0.12 : 0.6;
  bloomPass.strength = bloomStrength;
  setCameraFar(enabled ? FAR_TRUE_SCALE : FAR_VIEW);
  if (enabled) {
    if (savedPlanetPaths === null) {
      savedPlanetPaths = options.showPlanetPaths;
      options.showPlanetPaths = true;
    }
  } else if (savedPlanetPaths !== null) {
    options.showPlanetPaths = savedPlanetPaths;
    savedPlanetPaths = null;
  }
  applyPathVisibility(solarSystem);
  syncToolbar(fakeCamera);
  scaleMorph.active = true;
  scaleMorph.t = 0;
  scaleMorph.from = from;
  scaleMorph.to = to;
  scaleMorph.enabled = enabled;
  updateCameraLimits(options.focus);
  // Snap the camera onto the focused body's orbit so the scale change is
  // immediately visible — but only in focused mode. While free-roaming or
  // detached the camera is a scene-root child in WORLD coordinates; a
  // local-frame snap would teleport it to the Sun's origin.
  if (!fps.active && !detached) {
    const object = solarSystem[options.focus];
    const minDistance = object.getMinDistance();
    setDaysideCameraPosition(object, minDistance);
  }
  showToast(
    enabled
      ? "True scale — the Sun is 109 × Earth · space is mostly emptiness"
      : "View scale restored",
    3200
  );
};

// Land the focus camera on the DAYSIDE: the old fixed local offset ignored
// where the Sun was, so ~half of all focus jumps opened on the night side —
// a featureless black disc (Neptune looked "broken"). Aiming from the Sun
// through the body guarantees a lit view.
const focusAimPos = new THREE.Vector3();
const sunDirLocal = new THREE.Vector3();
// Module-scope scratch: avoid per-call `new THREE.Vector3(0,1,0)` allocations
// in the setDayside path (called on every focus change).
const UP_Y = new THREE.Vector3(0, 1, 0);
const setDaysideCameraPosition = (
  object: PlanetaryObject,
  minDistance: number
): void => {
  const mesh = object.mesh;
  mesh.updateWorldMatrix(true, false);
  sunDirLocal.set(0, 0, 0);
  mesh.worldToLocal(sunDirLocal);
  if (sunDirLocal.lengthSq() > 1e-9) {
    sunDirLocal.normalize();
  } else {
    // The Sun itself has no parent to aim from — keep the classic offset.
    sunDirLocal.set(1, 0.33, 0).normalize();
  }
  fakeCamera.position
    .copy(sunDirLocal)
    .multiplyScalar(minDistance * 1.3)
    .addScaledVector(UP_Y, minDistance * 0.45);
};

const changeFocus = (oldFocus: string, newFocus: string) => {
  // Leave detached/free-camera mode (no-op when already focused).
  setDetached(false);
  // The camera may live under a body mesh (focused) or at the scene root
  // (after free roam). Detach it from wherever it is, then re-parent.
  const oldMesh = solarSystem[oldFocus]?.mesh;
  if (oldMesh && fakeCamera.parent === oldMesh) {
    oldMesh.remove(fakeCamera);
    oldMesh.remove(camera);
  } else {
    scene.remove(fakeCamera);
    scene.remove(camera);
  }
  const mesh = solarSystem[newFocus].mesh;
  mesh.add(fakeCamera);
  mesh.add(camera);
  const object = solarSystem[newFocus];
  const minDistance = object.getMinDistance();
  // Orbit centre = the body's local origin (its centre).
  controls.target.set(0, 0, 0);
  setDaysideCameraPosition(object, minDistance);
  updateCameraLimits(newFocus);
  pathFader.applyFocus(newFocus);
  solarSystem[oldFocus].labels.hidePOI();
  solarSystem[newFocus].labels.showPOI();
  captionEl.innerHTML = newFocus;
};

// Camera — boot pose is a scene-root free-roam view at world (-7.5, 9, 24)
// aimed at the Sun's centre. The cameras are never parented to a body mesh,
// so entering free roam later continues from this exact pose (FreeRoam.enter
// seeds its yaw/pitch from the camera quaternion — no teleport).
const aspect = sizes.width / sizes.height;
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, FAR_VIEW);
camera.position.set(-7.5, 9, 24);
scene.add(camera);

// Controls
const fakeCamera = camera.clone();
scene.add(fakeCamera);
solarSystem["Sun"].mesh.getWorldPosition(focusAimPos);
fakeCamera.lookAt(focusAimPos);
camera.quaternion.copy(fakeCamera.quaternion);
const controls = new OrbitControls(fakeCamera, canvas);
controls.target = solarSystem["Sun"].mesh.position;
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = solarSystem["Sun"].getMinDistance();
controls.maxDistance = 50;

// Label renderer
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(sizes.width, sizes.height);
document.body.appendChild(labelRenderer.domElement);
// Named root so cinematic mode can fade the POI chips via CSS.
labelRenderer.domElement.id = "label-layer";

const renderScene = new RenderPass(scene, camera);

// Bloom renders at HALF resolution — its internal blur chain is built at
// construction size, so ~4× less fill-rate work for a visually identical
// soft halo. rebuildBloom() recreates it on window resize.
// UnrealBloomPass(resolution, strength, radius, threshold): threshold 1.05
// keeps planet whites (~1.0 max) clean while the HDR Sun (gain ~2.0) blooms.
let bloomStrength = 0.6;
let bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width / 2, sizes.height / 2),
  bloomStrength,
  0.35,
  1.05
);

const rebuildBloom = (): void => {
  bloomComposer.removePass(bloomPass);
  bloomPass.dispose();
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(sizes.width / 2, sizes.height / 2),
    bloomStrength,
    0.35,
    1.05
  );
  bloomComposer.addPass(bloomPass);
};

const bloomComposer = new EffectComposer(renderer);
bloomComposer.setSize(sizes.width, sizes.height);
bloomComposer.renderToScreen = true;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

// Cinematic mode + one-click screenshot (H toggles, P captures)
const cinematic = new Cinematic({
  composer: bloomComposer,
  canvas: canvas as HTMLCanvasElement,
  getFocus: () => options.focus,
});

// ─── Adaptive quality: pixel ratio follows the frame budget ─────────────
// Tracks a rolling 30-frame average; drops DPR a step when the frame time
// exceeds ~20 ms and raises it back when there is headroom. This keeps the
// view smooth on slower machines without a permanent quality loss.
const DPR_CAP = Math.min(window.devicePixelRatio || 1, 2);
let currentDPR = DPR_CAP;
let dprFrameCount = 0;
let dprFrameSum = 0;
let lastFrameMs = performance.now();
// Sticky hysteresis for the DPR adaptation: a change is only applied after
// TWO consecutive 30-frame windows agree on the direction. Every pixel-ratio
// change resizes the drawing buffer (a visible one-frame shimmer), and a
// borderline frame budget would otherwise oscillate the DPR back and forth
// while the user zooms.
let dprSticky = 0;

const applyDPR = (dpr: number): void => {
  if (dpr === currentDPR) return;
  currentDPR = dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(sizes.width, sizes.height);
  bloomComposer.setPixelRatio(dpr);
};

const sampleFrameTime = (): void => {
  const now = performance.now();
  dprFrameSum += now - lastFrameMs;
  lastFrameMs = now;
  dprFrameCount++;
  if (dprFrameCount < 30) return;
  const avg = dprFrameSum / dprFrameCount;
  dprFrameSum = 0;
  dprFrameCount = 0;
  // Vote: -1 = frame budget exceeded (drop), +1 = headroom (raise), 0 = no
  // change. Two consecutive votes in the same direction flip the DPR.
  if (avg > 20 && currentDPR > 1) {
    dprSticky = Math.min(-1, dprSticky - 1);
  } else if (avg < 12 && currentDPR < DPR_CAP) {
    dprSticky = Math.max(1, dprSticky + 1);
  } else {
    dprSticky = 0;
  }
  if (dprSticky <= -2) {
    applyDPR(Math.max(1, currentDPR - 0.25));
    dprSticky = 0;
  } else if (dprSticky >= 2) {
    applyDPR(Math.min(DPR_CAP, currentDPR + 0.25));
    dprSticky = 0;
  }
};

// Planet info panel
const infoPanel = new InfoPanel();

// Sim-date HUD
const simDateEl = document.getElementById("sim-date") as HTMLElement;
let lastSimDateUpdate = 0;

// Telemetry strip (distance / velocity / scale / sim rate) — shares the
// sim-date 500 ms throttle.
const telemetry = createTelemetry();
const telFocusPos = new THREE.Vector3();
const telCamPos = new THREE.Vector3();
const telResolvePos = new THREE.Vector3();

// Quiz mode — answer by clicking the chips or the planets in the 3D scene
const quiz = new Quiz();
quiz.init();

// Cinematic auto-tour
const tour = new CinematicTour({
  camera,
  fakeCamera,
  controls,
  solarSystem,
  changeFocus,
  infoPanel,
  getCurrentFocus: () => options.focus,
});
document.getElementById("btn-tour")?.addEventListener("click", () => {
  if (fps.active) fps.exit();
  // The tour flies in world coordinates, which conflicts with true-scale's
  // scaled local camera frame — fall back to view scale for the flight.
  if (options.trueScale) {
    applyScaleMode(false);
    options.trueScale = false;
  }
  tour.start();
});

// Free-roam first-person flight mode
const fps = new FreeRoam({
  camera: fakeCamera,
  canvas,
  // In detached mode the camera has no focus body — fall back to the Sun's
  // world scale so flight speed stays usable across the system.
  getWorldScale: () =>
    detached ? getWorldScale("Sun") : getWorldScale(options.focus),
  onEnter: () => {
    tour.stop();
    controls.enabled = false;
    freeCamera.exit();
    // Preserve the camera's WORLD pose across the reparent (local → world).
    // Without this, entering from a non-Sun focus teleports the camera to
    // the scene origin (verified: 8.8 units when entering from Mars).
    fakeCamera.updateMatrixWorld(true);
    const worldPos = fakeCamera.getWorldPosition(new THREE.Vector3());
    const worldQuat = fakeCamera.getWorldQuaternion(new THREE.Quaternion());
    const mesh = solarSystem[options.focus].mesh;
    if (fakeCamera.parent !== scene) {
      mesh.remove(fakeCamera);
      mesh.remove(camera);
    }
    scene.add(fakeCamera);
    scene.add(camera);
    fakeCamera.position.copy(worldPos);
    fakeCamera.quaternion.copy(worldQuat);
    camera.position.copy(worldPos);
    camera.quaternion.copy(worldQuat);
    document.body.classList.add("fps-active");
    document.body.classList.remove("fps-locked");
    document
      .getElementById("btn-fps")
      ?.setAttribute("data-tooltip", "Exit free roam");
    if (!detached) {
      // The focus body is no longer the anchor — hide its POI labels and
      // close its facts card while flying.
      solarSystem[options.focus].labels.hidePOI();
      infoPanel.close();
    }
  },
  onExit: () => {
    document.body.classList.remove("fps-active");
    document.body.classList.remove("fps-locked");
    document
      .getElementById("btn-fps")
      ?.setAttribute("data-tooltip", "Free roam flight — WASD + mouse");
    // The camera stays EXACTLY where it is — no re-parenting, no re-aiming,
    // no snapping to a planet. Free roam is deselected; the free camera
    // ("third mode") takes over from this very pose. Re-entering free roam
    // later continues from the same place.
    setDetached(true);
    // setDetached no-ops when free roam was entered FROM detached (the flag
    // never left) — re-arm the controller so drag-look + dolly always work
    // after a flight.
    freeCamera.enter();
  },
});
fps.attach();

// Third mode: detached free camera (drag-look + wheel-dolly) after free roam.
const freeCamera = new FreeCamera({
  camera: fakeCamera,
  canvas,
  scene,
  getZoomLimits: () =>
    options.trueScale
      ? { min: 2, max: TRUE_SCALE_VIEW_RANGE * 1.2 }
      : { min: 0.05, max: 500 },
});
freeCamera.attach();

// Orbit-ring declutter: rank + distance fading, focus beacon.
const pathFader = new PathFader({
  solarSystem,
  getWorldScale,
  getFocus: () => options.focus,
});
const pathFaderCameraPos = new THREE.Vector3();

// Fading comet-tail trails behind every planet & dwarf planet (world space).
const trails = new MotionTrails(solarSystem, getWorldScale);
trails.attachTo(scene);
// Boot lands directly in detached free-roam flight from the scene-root boot
// pose (no teleport: the cameras were already placed + aimed at boot, and
// FreeRoam.enter seeds yaw/pitch from the existing quaternion). options.focus
// stays "Sun" as the telemetry fallback; the caption reads "Free roam".
let bootRoamEntered = false;
const enterBootRoam = (): void => {
  if (bootRoamEntered || fps.active) return;
  bootRoamEntered = true;
  if (fakeCamera.parent !== scene) {
    scene.add(fakeCamera);
    scene.add(camera);
  }
  fakeCamera.position.set(-7.5, 9, 24);
  solarSystem["Sun"].mesh.getWorldPosition(focusAimPos);
  fakeCamera.lookAt(focusAimPos);
  camera.position.copy(fakeCamera.position);
  camera.quaternion.copy(fakeCamera.quaternion);
  setDetached(true);
  freeCamera.enter();
  infoPanel.close();
  captionEl.innerHTML = "Free roam";
  const btnFps = document.getElementById("btn-fps");
  if (btnFps) {
    btnFps.setAttribute("aria-pressed", String(false));
    btnFps.classList.toggle("is-active", false);
  }
};
window.addEventListener("loading-dismissed", enterBootRoam, { once: true });
// Fallback: if the loading screen was already dismissed before this
// listener attached, enter immediately (guarded by bootRoamEntered).
const bootLoadEl = document.getElementById("loading");
if (
  bootLoadEl &&
  (bootLoadEl.style.display === "none" ||
    bootLoadEl.style.pointerEvents === "none")
) {
  enterBootRoam();
}

document.getElementById("btn-fps")?.addEventListener("click", () => {
  if (fps.active) {
    fps.exit();
  } else {
    fps.enter();
  }
});

// First-visit tutorial — show only after the loading screen is dismissed
const tutorial = new Tutorial();
window.addEventListener(
  "loading-dismissed",
  () => tutorial.init(),
  { once: true }
);

// Help panel (features & controls reference)
new HelpPanel();

// Click a planet to focus it and view its facts
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = new THREE.Vector2();

canvas.addEventListener("pointerdown", (e) => {
  pointerDown.set(e.clientX, e.clientY);
});

canvas.addEventListener("pointerup", (e) => {
  if (fps.active) return; // flying: no planet picking
  if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
  pointer.x = (e.clientX / sizes.width) * 2 - 1;
  pointer.y = -(e.clientY / sizes.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const body = findClickedBody(hits);
  if (quiz.isActive()) {
    quiz.handlePlanetClick(body);
    return;
  }
  if (body) {
    changeFocus(options.focus, body.name);
    options.focus = body.name;
    infoPanel.open(body);
  } else {
    infoPanel.close();
  }
});

// Hover a planet to reveal its name
const planetTooltip = document.getElementById("planet-tooltip") as HTMLElement;
const hoverRaycaster = new THREE.Raycaster();
const hoverPointer = new THREE.Vector2();
let pointerIsDown = false;
let lastHoverCheck = 0;

canvas.addEventListener("pointerdown", () => {
  pointerIsDown = true;
});

canvas.addEventListener("pointerup", () => {
  pointerIsDown = false;
});

canvas.addEventListener("pointermove", (e) => {
  if (fps.active || pointerIsDown) return;
  const now = performance.now();
  if (now - lastHoverCheck < 50) return;
  lastHoverCheck = now;
  hoverPointer.x = (e.clientX / sizes.width) * 2 - 1;
  hoverPointer.y = -(e.clientY / sizes.height) * 2 + 1;
  hoverRaycaster.setFromCamera(hoverPointer, camera);
  const hits = hoverRaycaster.intersectObjects(scene.children, true);
  const body = findClickedBody(hits);
  if (body) {
    planetTooltip.textContent = body.name;
    planetTooltip.style.display = "block";
    // Keep the chip on-screen near the right edge (it opens to the right).
    planetTooltip.style.left = `${Math.min(e.clientX, sizes.width - 140)}px`;
    planetTooltip.style.top = `${e.clientY}px`;
  } else {
    planetTooltip.style.display = "none";
  }
});

// Animate
const clock = new THREE.Clock();
// Seed the clock with the real current date — the ephemeris places every
// planet at its REAL position for TODAY (Keplerian elements), so the
// sim-date HUD must also start at today to describe the same instant.
let elapsedTime = initialElapsedTime;

// Date travel — clicking the sim-date chip opens the picker; jumping
// rewrites the sim clock (planets re-solve on the next tick) and clears
// the motion trails, which span the old timeline.
const timeTravel = new TimeTravel({
  getElapsed: () => elapsedTime,
  setElapsed: (elapsed) => {
    elapsedTime = elapsed;
    trails.clear();
  },
});

// Observatory events — alignments, conjunctions, eclipses over the real
// positions; "View" reuses the palette's select flow.
const eventScanner = new EventScanner({
  solarSystem,
  getElapsed: () => elapsedTime,
  onSelect: (name) => {
    if (fps.active) fps.exit();
    if (detached || options.focus !== name) {
      changeFocus(options.focus, name);
      options.focus = name;
    }
    infoPanel.open(solarSystem[name].mesh.userData.body);
  },
});

fakeCamera.layers.enable(LAYERS.POILabel);

// GUI
createGUI(solarSystem, clock, fakeCamera, asteroidBelt, kuiperBelt, applyScaleMode);

// Search & quick-nav palette (Ctrl+K / magnifier / number keys)
const palette = new NavPalette({
  bodies: Object.values(solarSystem).map((object) => {
    const body = object.mesh.userData.body as Body;
    return { name: body.name, type: body.type, category: body.category };
  }),
  shortcuts: planetNames,
  onSelect: (name: string) => {
    if (fps.active) fps.exit();
    // While detached, re-focus even when picking the last-focus body
    // (otherwise the selection would silently do nothing).
    if (detached || options.focus !== name) {
      changeFocus(options.focus, name);
      options.focus = name;
    }
    infoPanel.open(solarSystem[name].mesh.userData.body);
  },
});

// Debug hook for automated verification (dev builds only)
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __solar?: unknown }).__solar = {
    THREE,
    scene,
    camera,
    fakeCamera,
    controls,
    solarSystem,
    options,
    infoPanel,
    quiz,
    tour,
    fps,
    freeCamera,
    pathFader,
    pathFaderCameraPos,
    getDetached: () => detached,
    starfield,
    palette,
    asteroidBelt,
    kuiperBelt,
    renderer,
    bloomComposer,
    applyTrueScale,
    getWorldScale,
    cinematic,
    trails,
    telemetry,
    timeTravel,
    eventScanner,
  };
}

(function tick() {
  // Clamp the raw delta so a background tab (huge delta on return) or a
  // frame hitch cannot teleport the simulation date and planet positions.
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsedTime += dt * options.speed;

  // Smooth ambient transitions toward the current target (toolbar preset
  // or GUI slider).
  if (ambientLight.intensity !== options.ambient) {
    ambientLight.intensity +=
      (options.ambient - ambientLight.intensity) * Math.min(1, dt * 6);
  }

  // True-scale morph tween (see applyScaleMode).
  if (scaleMorph.active && scaleMorph.from && scaleMorph.to) {
    scaleMorph.t = Math.min(1, scaleMorph.t + dt / scaleMorph.duration);
    lerpScaleState(
      solarSystem,
      scaleMorph.from,
      scaleMorph.to,
      easeInOutCubic(scaleMorph.t)
    );
    if (scaleMorph.t >= 1) {
      scaleMorph.active = false;
      applyScaleState(solarSystem, scaleMorph.to);
      pathFader.applyTrueScale(scaleMorph.enabled);
      updateCameraLimits(options.focus);
    }
  }

  // Keep the star shell centered on the camera (stars "at infinity").
  starfield.update(
    fakeCamera,
    camera,
    performance.now(),
    renderer.getPixelRatio()
  );

  asteroidBelt.tick(elapsedTime);
  kuiperBelt.tick(elapsedTime);

  // Update the solar system objects
  for (const object of Object.values(solarSystem)) {
    object.tick(elapsedTime);
  }

  // Orbit-ring declutter: fade paths by rank + distance, keep the focus
  // body's ring as the beacon.
  pathFader.update(fakeCamera.getWorldPosition(pathFaderCameraPos));

  // Animate the orbit-ring dash drift (travel-direction flow) and record
  // the motion trails' new world positions.
  updateOrbitFlow(elapsedTime);
  trails.setEnabled(options.showTrails);
  trails.update();
  starfield.setConstellationsVisible(options.showConstellations);

  // Update sim date HUD (throttled).
  // The clock is seeded to the real current date (see initialElapsedTime) —
  // the same instant the Keplerian solver places the planets at — so the HUD
  // date and the sky always agree. At ×1 speed one real second = 8 simulated
  // hours, so a 365-day Earth year takes 1095 real seconds.
  const nowMs = performance.now();
  eventScanner.update(nowMs);
  if (nowMs - lastSimDateUpdate > 500) {
    lastSimDateUpdate = nowMs;
    const simDate = new Date(simDateMsFromElapsed(elapsedTime));
    const pad = (n: number) => String(n).padStart(2, "0");
    simDateEl.textContent = `Sim date · ${simDate.getUTCFullYear()}-${pad(
      simDate.getUTCMonth() + 1
    )}-${pad(simDate.getUTCDate())} ${pad(simDate.getUTCHours())}:${pad(
      simDate.getUTCMinutes()
    )} UTC`;

    // Telemetry readout — camera→focus distance (calibrated to km at the
    // focus body's own heliocentric ratio in view mode; exact in true
    // scale), mean orbital velocity from planets.json, on-screen scale.
    const focusObject = solarSystem[options.focus];
    focusObject.mesh.getWorldPosition(telFocusPos);
    camera.getWorldPosition(telCamPos);
    const kmPerUnit = computeKmPerUnit(
      options.focus,
      options.trueScale,
      (name) => {
        const object = solarSystem[name];
        if (!object) return undefined;
        object.mesh.getWorldPosition(telResolvePos);
        return { distanceKm: object.distanceKm, worldR: telResolvePos.length() };
      }
    );
    const focusBodyData = focusObject.mesh.userData.body as Body;
    const velocityKmS =
      focusBodyData.period > 0 && focusBodyData.distance
        ? (2 * Math.PI * focusBodyData.distance * 1e6) /
          (focusBodyData.period * 86400)
        : NaN;
    telemetry.update({
      worldDistance: telCamPos.distanceTo(telFocusPos),
      kmPerUnit,
      viewportHeight: sizes.height,
      fovDeg: camera.fov,
      orbitalVelocityKmS: velocityKmS,
    });
  }

  // Free-roam flight or the detached free camera drive the fake camera
  // directly; OrbitControls only runs in focused mode (its clamps would
  // fight unconstrained flight, and it has no pivot in detached mode).
  if (fps.active) {
    fps.update(dt);
    // Live flight-speed HUD (compact title readout).
    const speedEl = document.getElementById("fps-speed-value");
    if (speedEl) {
      speedEl.textContent = `· ${Math.round(fps.getSpeed())} u/s`;
    }
  } else if (detached) {
    freeCamera.update(dt);
  }

  camera.copy(fakeCamera);
  // Three-version-proof layer sync: copy() copies position/rotation but not
  // the layer mask, so the rendered camera must mirror fakeCamera's layers.
  camera.layers.mask = fakeCamera.layers.mask;

  // Update controls (skipped during free-roam and detached — see above)
  if (!fps.active && !detached) {
    controls.update();
    // OrbitControls' lookAt() treats its target as a WORLD-space point, but
    // in focused mode the camera lives in the focused body's LOCAL frame —
    // with target (0,0,0) it would aim at the Sun instead of the planet.
    // Re-aim at the body's world centre (lookAt converts back into the
    // parent frame itself).
    solarSystem[options.focus].mesh.getWorldPosition(focusAimPos);
    fakeCamera.lookAt(focusAimPos);
  }

  // Update labels
  const currentBody = solarSystem[options.focus];
  currentBody.labels.update(fakeCamera);

  // Render
  bloomComposer.render();
  labelRenderer.render(scene, camera);

  // Adaptive pixel ratio — one rolling sample per frame.
  sampleFrameTime();

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
})();
