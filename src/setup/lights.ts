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

  // Point light — the Sun (intensity tuned so bright cloud bands keep
  // texture: 0.95 sun + 0.45 day ambient ≈ 1.4 max, under the clip point).
  const pointLight = new THREE.PointLight(0xffffff, 0.95, 0, 0);
  pointLight.castShadow = true;
  // 2048² per cube face (6 faces) — PCFSoft + radius 16 already soften the
  // edges; 4096² was measurable fill-rate for no visible gain at planet
  // scale. (Shadows are disabled entirely in true-scale mode — the shadow
  // camera only covers 30 units around the Sun.)
  pointLight.shadow.mapSize.width = 2048;
  pointLight.shadow.mapSize.height = 2048;
  pointLight.shadow.camera.near = 1.5;
  pointLight.shadow.camera.far = 30;
  pointLight.shadow.radius = 16;

  return [ambientLight, pointLight];
};

type Lights = [THREE.AmbientLight, THREE.PointLight];
