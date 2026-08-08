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
  getWorldScale,
  TRUE_SCALE_VIEW_RANGE,
} from "./setup/solar-system";
import {
  createGUI,
  options,
  applyPathVisibility,
  syncToolbar,
  AMBIENT_BRIGHT,
  AMBIENT_DIM,
} from "./setup/gui";
import { LAYERS } from "./constants";
import { InfoPanel } from "./setup/info-panel";
import { Tutorial } from "./setup/tutorial";
import { HelpPanel } from "./setup/help-panel";
import { Body } from "./setup/planetary-object";
import { createAsteroidBelt, createKuiperBelt } from "./setup/asteroid-belt";
import { NavPalette } from "./setup/nav-palette";
import { Quiz } from "./setup/quiz";
import { CinematicTour } from "./setup/tour";
import { FreeRoam } from "./setup/fly";

THREE.ColorManagement.enabled = false;

const findClickedBody = (hits: THREE.Intersection[]): Body | null => {
  for (const hit of hits) {
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const body = object.userData.body as Body | undefined;
      if (body) return body;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  bloomComposer.setSize(sizes.width, sizes.height);
  labelRenderer.setSize(sizes.width, sizes.height);
});

document.getElementById("btn-previous")?.addEventListener("click", () => {
  if (fps.active) return;
  const index = planetNames.indexOf(options.focus);
  const newIndex = index === 0 ? planetNames.length - 1 : index - 1;
  const focus = planetNames[newIndex];
  changeFocus(options.focus, focus);
  options.focus = focus;
});

document.getElementById("btn-next")?.addEventListener("click", () => {
  if (fps.active) return;
  const index = (planetNames.indexOf(options.focus) + 1) % planetNames.length;
  const focus = planetNames[index];
  changeFocus(options.focus, focus);
  options.focus = focus;
});

// Solar system
const [solarSystem, planetNames] = createSolarSystem(scene);

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

const applyScaleMode = (enabled: boolean) => {
  applyTrueScale(solarSystem, enabled);
  asteroidBelt.setTrueScale(enabled);
  kuiperBelt.setTrueScale(enabled);
  // The giant true-scale Sun blows out the bloom halo into a muddy blob —
  // tone the bloom down while true scale is active.
  bloomPass.strength = enabled ? 0.15 : 0.75;
  // The true-scale system spans ~700,000 world units (Neptune's orbit);
  // extend the far plane and speed up zooming so the scale change is usable.
  setCameraFar(enabled ? FAR_TRUE_SCALE : FAR_VIEW);
  controls.zoomSpeed = enabled ? 2.0 : 1.0;
  // Orbit rings act as the reference grid in true scale — without them the
  // planets are sub-pixel dots lost in the void. Force the PLANET rings on
  // for the duration, then restore the user's choice when switching back.
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
  syncToolbar();
  updateCameraLimits(options.focus);
  // Snap the camera onto the focused body's orbit so the scale change is
  // immediately visible.
  const object = solarSystem[options.focus];
  const minDistance = object.getMinDistance();
  fakeCamera.position.set(minDistance, minDistance / 3, 0);
};

const changeFocus = (oldFocus: string, newFocus: string) => {
  solarSystem[oldFocus].mesh.remove(camera);
  solarSystem[newFocus].mesh.add(camera);
  const object = solarSystem[newFocus];
  const minDistance = object.getMinDistance();
  // Orbit centre = the body's local origin (its centre).
  controls.target.set(0, 0, 0);
  fakeCamera.position.set(minDistance, minDistance / 3, 0);
  updateCameraLimits(newFocus);
  solarSystem[oldFocus].labels.hidePOI();
  solarSystem[newFocus].labels.showPOI();
  (document.querySelector(".caption p") as HTMLElement).innerHTML = newFocus;
};

// Camera
const aspect = sizes.width / sizes.height;
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, FAR_VIEW);
camera.position.set(0, 20, 0);
solarSystem["Sun"].mesh.add(camera);

// Controls
const fakeCamera = camera.clone();
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

// Renderer
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});

renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width, sizes.height),
  0.75,
  0,
  1
);

const bloomComposer = new EffectComposer(renderer);
bloomComposer.setSize(sizes.width, sizes.height);
bloomComposer.renderToScreen = true;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

// Planet info panel
const infoPanel = new InfoPanel();

// Sim-date HUD
const simDateEl = document.getElementById("sim-date") as HTMLElement;
let lastSimDateUpdate = 0;

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
  getWorldScale: () => getWorldScale(options.focus),
  onEnter: () => {
    tour.stop();
    controls.enabled = false;
    // Detach both cameras from the focused body so the world-space flight
    // math is not multiplied by the body's scale.
    const mesh = solarSystem[options.focus].mesh;
    mesh.remove(fakeCamera);
    mesh.remove(camera);
    scene.add(fakeCamera);
    scene.add(camera);
    document.body.classList.add("fps-active");
  },
  onExit: () => {
    document.body.classList.remove("fps-active");
    const mesh = solarSystem[options.focus].mesh;
    // Save the world-space flight pose so exiting free roam continues
    // exactly where the user quit (instead of snapping to the default
    // orbit camera position).
    const worldPos = fakeCamera.getWorldPosition(new THREE.Vector3());
    const worldQuat = fakeCamera.getWorldQuaternion(new THREE.Quaternion());
    // Re-attach the cameras to the focused body and resume orbit control.
    scene.remove(fakeCamera);
    scene.remove(camera);
    mesh.add(fakeCamera);
    mesh.add(camera);
    // Convert the saved world pose into the (possibly scaled) local frame
    // of the focused body's mesh.
    fakeCamera.position.copy(mesh.worldToLocal(worldPos));
    const meshWorldQuat = new THREE.Quaternion();
    mesh.getWorldQuaternion(meshWorldQuat);
    fakeCamera.quaternion.copy(meshWorldQuat.invert().premultiply(worldQuat));
    camera.copy(fakeCamera);
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    updateCameraLimits(options.focus);
  },
});
fps.attach();
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
  if (fps.active) return; // pointer-lock flight: no planet picking
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
    planetTooltip.style.left = `${e.clientX}px`;
    planetTooltip.style.top = `${e.clientY}px`;
  } else {
    planetTooltip.style.display = "none";
  }
});

// Animate
const clock = new THREE.Clock();
let elapsedTime = 0;

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
    if (options.focus !== name) {
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
    starfield,
    palette,
    asteroidBelt,
    kuiperBelt,
    renderer,
    bloomComposer,
    applyTrueScale,
    getWorldScale,
  };
}

(function tick() {
  // Clamp the raw delta so a background tab (huge delta on return) or a
  // frame hitch cannot teleport the simulation date and planet positions.
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsedTime += dt * options.speed;

  // Smooth ambient transitions when the toolbar day/night toggle is used.
  const ambientTarget = options.ambientOn ? AMBIENT_BRIGHT : AMBIENT_DIM;
  if (ambientLight.intensity !== ambientTarget) {
    ambientLight.intensity +=
      (ambientTarget - ambientLight.intensity) * Math.min(1, dt * 6);
  }

  // Keep the star shell centered on the camera (stars "at infinity").
  starfield.update(
    fakeCamera,
    camera,
    performance.now(),
    renderer.getPixelRatio()
  );

  asteroidBelt.tick(elapsedTime);

  // Update the solar system objects
  for (const object of Object.values(solarSystem)) {
    object.tick(elapsedTime);
  }

  // Update sim date HUD (throttled)
  const nowMs = performance.now();
  if (nowMs - lastSimDateUpdate > 500) {
    lastSimDateUpdate = nowMs;
    const simDate = new Date(Date.now() + (elapsedTime / 3) * 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    simDateEl.textContent = `Sim date · ${simDate.getUTCFullYear()}-${pad(
      simDate.getUTCMonth() + 1
    )}-${pad(simDate.getUTCDate())} ${pad(simDate.getUTCHours())}:${pad(
      simDate.getUTCMinutes()
    )}`;
  }

  // Free-roam flight drives the fake camera directly.
  if (fps.active) {
    fps.update(dt);
  }

  // Update camera
  camera.copy(fakeCamera);

  // Update controls (skipped during free-roam — its clamps would fight the
  // unconstrained flight path)
  if (!fps.active) {
    controls.update();
  }

  // Update labels
  const currentBody = solarSystem[options.focus];
  currentBody.labels.update(fakeCamera);

  // Render
  bloomComposer.render();
  labelRenderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
})();
