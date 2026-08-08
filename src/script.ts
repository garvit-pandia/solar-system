import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { createEnvironmentMap } from "./setup/environment-map";
import { createLights } from "./setup/lights";
import { createSolarSystem } from "./setup/solar-system";
import { createGUI, options } from "./setup/gui";
import { LAYERS } from "./constants";
import { InfoPanel } from "./setup/info-panel";
import { Tutorial } from "./setup/tutorial";
import { Body } from "./setup/planetary-object";
import { createAsteroidBelt } from "./setup/asteroid-belt";
import { Quiz } from "./setup/quiz";
import { CinematicTour } from "./setup/tour";

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

// Environment map
scene.background = createEnvironmentMap("./textures/environment");

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
  const index = planetNames.indexOf(options.focus);
  const newIndex = index === 0 ? planetNames.length - 1 : index - 1;
  const focus = planetNames[newIndex];
  changeFocus(options.focus, focus);
  options.focus = focus;
});

document.getElementById("btn-next")?.addEventListener("click", () => {
  const index = (planetNames.indexOf(options.focus) + 1) % planetNames.length;
  const focus = planetNames[index];
  changeFocus(options.focus, focus);
  options.focus = focus;
});

// Solar system
const [solarSystem, planetNames] = createSolarSystem(scene);

// Asteroid belt
const asteroidBelt = createAsteroidBelt(scene);

const TRUE_SCALE_BASE = 3959; // Earth radius in km — scale 1 == Earth

const trueScaleFactor = (name: string): number => {
  const body = solarSystem[name].mesh.userData.body as Body;
  if (body.type === "ring" && body.orbits) {
    return trueScaleFactor(body.orbits);
  }
  return body.radius / TRUE_SCALE_BASE;
};

const updateCameraLimits = () => {
  const object = solarSystem[options.focus];
  const factor = options.trueScale ? trueScaleFactor(options.focus) : 1;
  // The camera lives as a child of the focused body's mesh, so OrbitControls
  // sees LOCAL units. The mesh scale provides the world-space factor.
  controls.minDistance = object.getMinDistance();
  controls.maxDistance = Math.max(50 / factor, object.getMinDistance() * 6);
  if (fakeCamera.position.length() < controls.minDistance) {
    fakeCamera.position.set(
      object.getMinDistance(),
      object.getMinDistance() / 3,
      0
    );
  }
};

const applyScaleMode = (enabled: boolean) => {
  for (const name in solarSystem) {
    const object = solarSystem[name];
    object.mesh.scale.setScalar(enabled ? trueScaleFactor(name) : 1);
  }
  // The giant true-scale Sun blows out the bloom halo into a muddy blob —
  // tone the bloom down while true scale is active.
  bloomPass.strength = enabled ? 0.15 : 0.75;
  // Snap the camera onto the focused body's orbit so the scale change is
  // immediately visible (the mesh scale also scales the camera's local frame).
  const object = solarSystem[options.focus];
  const minDistance = object.getMinDistance();
  fakeCamera.position.set(minDistance, minDistance / 3, 0);
  updateCameraLimits();
};

const changeFocus = (oldFocus: string, newFocus: string) => {
  solarSystem[oldFocus].mesh.remove(camera);
  solarSystem[newFocus].mesh.add(camera);
  const object = solarSystem[newFocus];
  const factor = options.trueScale ? trueScaleFactor(newFocus) : 1;
  const minDistance = object.getMinDistance();
  // Local-space clamps: OrbitControls measures fakeCamera.position (local to
  // the parent mesh), while the mesh scale converts them to world units.
  controls.minDistance = minDistance;
  controls.maxDistance = Math.max(50 / factor, minDistance * 6);
  fakeCamera.position.set(minDistance, minDistance / 3, 0);
  solarSystem[oldFocus].labels.hidePOI();
  solarSystem[newFocus].labels.showPOI();
  (document.querySelector(".caption p") as HTMLElement).innerHTML = newFocus;
};

// Camera
const aspect = sizes.width / sizes.height;
const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
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

// Quiz mode — answer by clicking planets in the 3D scene
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
  // The tour flies in world coordinates, which conflicts with true-scale's
  // scaled local camera frame — fall back to view scale for the flight.
  if (options.trueScale) {
    applyScaleMode(false);
    options.trueScale = false;
  }
  tour.start();
});

// First-visit tutorial — show only after the loading screen is dismissed
const tutorial = new Tutorial();
window.addEventListener(
  "loading-dismissed",
  () => tutorial.init(),
  { once: true }
);

// Click a planet to focus it and view its facts
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = new THREE.Vector2();

canvas.addEventListener("pointerdown", (e) => {
  pointerDown.set(e.clientX, e.clientY);
});

canvas.addEventListener("pointerup", (e) => {
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
  if (pointerIsDown) return;
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
createGUI(ambientLight, solarSystem, clock, fakeCamera, asteroidBelt, applyScaleMode);

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
  };
}

(function tick() {
  elapsedTime += clock.getDelta() * options.speed;

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

  // Update camera
  camera.copy(fakeCamera);

  // Update controls
  controls.update();

  // Update labels
  const currentBody = solarSystem[options.focus];
  currentBody.labels.update(fakeCamera);

  // Render
  bloomComposer.render();
  labelRenderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
})();
