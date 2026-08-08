import { PlanetaryObject, EARTH_RADIUS_KM, RING_OUTER_KM } from "./planetary-object";
import { initialOrbitAngle } from "./ephemeris";
import planetData from "../planets.json";
import { Body } from "./planetary-object";
import { setTextureCount } from "./textures";
import * as THREE from "three";

export type SolarSystem = Record<string, PlanetaryObject>;

/** True-scale world extent cap when zooming out, in Earth radii. */
export const TRUE_SCALE_VIEW_RANGE = 120000;

/**
 * World-space scale of each body (product of mesh scales up the hierarchy,
 * including the Sun root). Updated by applyTrueScale; valid only while the
 * solar system is static (i.e. not during mode switches).
 */
const worldScales: Record<string, number> = {};

export const createSolarSystem = (
  scene: THREE.Scene
): [SolarSystem, string[]] => {
  const solarSystem: SolarSystem = {};
  let textureCount = 0;

  const planets: Body[] = planetData;
  const traversable: string[] = [];

  for (const planet of planets) {
    const name = planet.name;

    if (planet.period === 0 && planet.orbits) {
      planet.period = planet.daylength / solarSystem[planet.orbits].daylength;
    }

    const object = new PlanetaryObject(planet);

    if (planet.type === "planet") {
      const angle = initialOrbitAngle(planet.name);
      if (angle !== undefined) {
        object.rng = angle;
      }
    }

    solarSystem[name] = object;

    textureCount += Object.keys(planet.textures).length;

    if (object.orbits) {
      const parentMesh = solarSystem[object.orbits].mesh;
      parentMesh.add(object.mesh);
      object.path && parentMesh.add(object.path);
    }

    if (planet.traversable) {
      traversable.push(planet.name);
    }
  }

  scene.add(solarSystem["Sun"].mesh);
  setTextureCount(textureCount);

  return [solarSystem, traversable];
};

/**
 * Get the current world-space scale of a body (product of all mesh scales
 * from the Sun root down to the body itself). In view mode this is 1 for
 * everything; in true-scale mode it reflects real size ratios.
 */
export const getWorldScale = (name: string): number => {
  return worldScales[name] ?? 1;
};

/**
 * Apply (or revert) true-scale mode.
 *
 * In true-scale mode one world unit equals one Earth radius (6371 km):
 * - every body's SIZE is scaled so world size = real radius / 6371
 *   (Earth = 1, Sun ≈ 109),
 * - every ORBIT distance is scaled so world distance = real distance / 6371
 *   (Moon ≈ 60 Earth radii from Earth, Neptune ≈ 705,000).
 *
 * Because the camera lives as a child of the focused body's mesh, its
 * local-space clamps stay valid at any scale (the mesh scale cancels out).
 * Bodies are processed in planets.json order, which lists parents before
 * their children, so each body's parent world scale is already known.
 */
export const applyTrueScale = (
  solarSystem: SolarSystem,
  enabled: boolean
): void => {
  for (const name in solarSystem) {
    const object = solarSystem[name];
    const parentWorld = object.orbits
      ? worldScales[object.orbits] ?? 1
      : 1;

    if (enabled) {
      const worldRadiusKm =
        object.type === "ring" ? RING_OUTER_KM : object.mesh.userData.body.radius;
      const worldRadius = worldRadiusKm / EARTH_RADIUS_KM;
      object.mesh.scale.setScalar(worldRadius / (object.baseRadius * parentWorld));

      const worldOrbit = object.distanceKm / EARTH_RADIUS_KM;
      object.activeDistance = worldOrbit / parentWorld;

      if (object.path) {
        object.path.scale.setScalar(
          object.activeDistance / Math.max(object.baseDistance, 1e-9)
        );
      }
    } else {
      object.mesh.scale.setScalar(1);
      object.activeDistance = object.baseDistance;
      if (object.path) {
        object.path.scale.setScalar(1);
      }
    }

    worldScales[name] = parentWorld * object.mesh.scale.x;
  }
};

/**
 * Max camera zoom-out distance in world units, for the given focus.
 * In view mode this matches the classic 50-unit limit; in true-scale mode
 * the camera may pull back far enough to see a whole neighbourhood.
 */
export const getMaxZoomOut = (focusName: string, trueScale: boolean): number => {
  const worldScale = worldScales[focusName] ?? 1;
  return trueScale ? TRUE_SCALE_VIEW_RANGE / worldScale : 50;
};
