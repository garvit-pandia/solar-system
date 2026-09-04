import * as THREE from "three";

/**
 * Sun-direction lighting for the whole system.
 *
 * Two hard-won constraints:
 * - decay MUST be 0: with the default physically-correct falloff (1/r²), the
 *   light is negligible at orbit distances (Earth is ~7 units out, Neptune
 *   ~29) and every planet reads as ambient-only — "dark from all sides".
 * - The Sun mesh must NOT cast shadows: the light lives at the scene origin,
 *   inside the Sun's sphere, so the Sun itself occludes every ray and the
 *   whole system falls into its shadow. castShadow is disabled on the Sun
 *   mesh in script.ts (kept here as a documented invariant).
 */
export const createLights = (): Lights => {
  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);

  // Point light — the Sun (warm key that keeps texture: 0.7 sun + 0.32 day
  // ambient ≈ 1.0 max, at the clip point so daysides hold detail).
  const pointLight = new THREE.PointLight(0xfff2d8, 0.7, 0, 0);
  // 2048² per cube face (6 faces) — PCFSoft + radius 16 already soften the
  // edges; 4096² was measurable fill-rate for no visible gain at planet
  // scale. (Shadows are disabled entirely in true-scale mode — the shadow
  // camera only covers 45 units around the Sun, wide enough to reach
  // the Pluto view-mode orbit at ~32 units.)
  pointLight.shadow.mapSize.width = 2048;
  pointLight.shadow.mapSize.height = 2048;
  pointLight.shadow.camera.near = 1.5;
  pointLight.shadow.camera.far = 45;
  pointLight.shadow.radius = 16;

  return [ambientLight, pointLight];
};

type Lights = [THREE.AmbientLight, THREE.PointLight];
