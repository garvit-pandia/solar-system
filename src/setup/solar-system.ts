import { PlanetaryObject, EARTH_RADIUS_KM, RING_OUTER_KM, normaliseRadius, normaliseDistance } from "./planetary-object";
import type { StylisedValues } from "./planetary-object";
import { AU_KM } from "./ephemeris";
import planetData from "../planets.json";
import { Body } from "./planetary-object";
import { setTextureCount } from "./textures";
import * as THREE from "three";

export type SolarSystem = Record<string, PlanetaryObject>;

/** True-scale world extent cap when zooming out, in Earth radii. */
export const TRUE_SCALE_VIEW_RANGE = 120000;

/** World-space scale of each body (product of mesh scales up the hierarchy,
 * including the Sun root). Updated by applyTrueScale; valid only while the
 * solar system is static (i.e. not during mode switches). */
const worldScales: Record<string, number> = {};

/**
 * View-mode moon guard.
 *
 * The stylised radius (√km) massively inflates small bodies — Earth's Moon
 * renders at 53% of Earth's radius (real: 27%) and Charon at 71% of Pluto —
 * and the stylised orbit distance (km^0.4) parks big moons right on their
 * parent's shoulder (Triton skims 2.1 Neptune radii out), which reads as
 * broken. Clamp each moon's stylised radius and re-space sibling orbits so
 * they never overlap. Raw km values are untouched (info panel + true scale).
 */
const computeMoonStyling = (planets: Body[]): Map<string, StylisedValues> => {
  const styling = new Map<string, StylisedValues>();

  const byParent = new Map<string, Body[]>();
  for (const body of planets) {
    if (body.type !== "moon" || !body.orbits) continue;
    const list = byParent.get(body.orbits) ?? [];
    list.push(body);
    byParent.set(body.orbits, list);
  }

  for (const [parentName, moons] of byParent) {
    const parent = planets.find((p) => p.name === parentName);
    if (!parent) continue;
    const parentRadius = normaliseRadius(parent.radius);

    let prevDistance = 0;
    let prevRadius = 0;
    const sorted = [...moons].sort((a, b) => a.distance - b.distance);
    for (const moon of sorted) {
      const radius = Math.min(
        normaliseRadius(moon.radius),
        parentRadius / 3
      );
      const distance = Math.max(
        normaliseDistance(moon.distance),
        // Keep clear of the parent and of the previous sibling's orbit
        // (both inflated by the same stylisation, so compare stylised units).
        parentRadius * 2.5,
        prevDistance + 4 * (radius + prevRadius)
      );
      styling.set(moon.name, { radius, distance });
      prevDistance = distance;
      prevRadius = radius;
    }
  }

  return styling;
};

export const createSolarSystem = (
  scene: THREE.Scene
): [SolarSystem, string[]] => {
  const solarSystem: SolarSystem = {};
  let textureCount = 0;

  const planets: Body[] = planetData;
  const traversable: string[] = [];
  const moonStyling = computeMoonStyling(planets);

  for (const planet of planets) {
    const name = planet.name;

    if (planet.period === 0 && planet.orbits) {
      planet.period = planet.daylength / solarSystem[planet.orbits].daylength;
    }

    const object = new PlanetaryObject(planet, moonStyling.get(name));

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

      // Keplerian bodies: switch the AU→local factor from the stylised
      // compression to real units (1 unit = 1 Earth radius) — the unit-
      // ellipse path then scales to the real semi-major axis.
      if (object.hasElements) {
        object.orbitUnitScale = AU_KM / EARTH_RADIUS_KM / parentWorld;
        object.activeDistance = object.semiMajorAU * object.orbitUnitScale;
      } else {
        const worldOrbit = object.distanceKm / EARTH_RADIUS_KM;
        object.activeDistance = worldOrbit / parentWorld;
      }

      // The orbit path must sit on the body's orbit: in parent-local space
      // the body orbits at activeDistance, so the path (unit-circle or
      // unit-ellipse geometry scaled by mesh.scale) needs the same local
      // radius. Its world radius is then parentWorld × activeDistance.
      if (object.path) {
        object.path.scale.setScalar(object.activeDistance);
      }
    } else {
      object.mesh.scale.setScalar(1);
      object.activeDistance = object.baseDistance;
      if (object.hasElements) {
        object.orbitUnitScale = object.baseOrbitUnitScale;
      }
      // Restore the view-mode ring radius (NOT 1 — a unit circle would
      // collapse every ring onto the parent body).
      if (object.path) {
        object.path.scale.setScalar(object.baseDistance);
      }
    }

    worldScales[name] = parentWorld * object.mesh.scale.x;
  }
}

/** One body's scale-dependent values (see captureScaleState). */
export interface ScaleSnapshotEntry {
  /** mesh.scale (uniform). */
  scale: number;
  activeDistance: number;
  /** path.scale (0 when the body has no orbit path). */
  pathScale: number;
  /** AU → local-units factor (Keplerian bodies). */
  unitScale: number;
}

export type ScaleSnapshot = Record<string, ScaleSnapshotEntry>;

/** Read every body's current scale-dependent values (for the morph tween). */
export const captureScaleState = (solarSystem: SolarSystem): ScaleSnapshot => {
  const snap: ScaleSnapshot = {};
  for (const name in solarSystem) {
    const object = solarSystem[name];
    snap[name] = {
      scale: object.mesh.scale.x,
      activeDistance: object.activeDistance,
      pathScale: object.path ? object.path.scale.x : 0,
      unitScale: object.orbitUnitScale,
    };
  }
  return snap;
};

const recomputeWorldScales = (solarSystem: SolarSystem): void => {
  // planets.json order (parents before children) is preserved in the record,
  // so each body's parent world scale is already known.
  for (const name in solarSystem) {
    const object = solarSystem[name];
    const parentWorld = object.orbits ? worldScales[object.orbits] ?? 1 : 1;
    worldScales[name] = parentWorld * object.mesh.scale.x;
  }
};

/** Write an exact snapshot back (morph start reset / finish). */
export const applyScaleState = (
  solarSystem: SolarSystem,
  snap: ScaleSnapshot
): void => {
  for (const name in solarSystem) {
    const object = solarSystem[name];
    const entry = snap[name];
    if (!entry) continue;
    object.mesh.scale.setScalar(entry.scale);
    object.activeDistance = entry.activeDistance;
    if (object.path && entry.pathScale) {
      object.path.scale.setScalar(entry.pathScale);
    }
    object.orbitUnitScale = entry.unitScale;
  }
  recomputeWorldScales(solarSystem);
};

/** Morph step: blend two snapshots by k ∈ [0, 1] and refresh world scales. */
export const lerpScaleState = (
  solarSystem: SolarSystem,
  from: ScaleSnapshot,
  to: ScaleSnapshot,
  k: number
): void => {
  for (const name in solarSystem) {
    const object = solarSystem[name];
    const a = from[name];
    const b = to[name];
    if (!a || !b) continue;
    object.mesh.scale.setScalar(a.scale + (b.scale - a.scale) * k);
    object.activeDistance = a.activeDistance + (b.activeDistance - a.activeDistance) * k;
    if (object.path && a.pathScale && b.pathScale) {
      object.path.scale.setScalar(a.pathScale + (b.pathScale - a.pathScale) * k);
    }
    object.orbitUnitScale = a.unitScale + (b.unitScale - a.unitScale) * k;
  }
  recomputeWorldScales(solarSystem);
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
