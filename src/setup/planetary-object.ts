import * as THREE from "three";
import { createRingMesh } from "./rings";
import { createPath } from "./path";
import { loadTexture } from "./textures";
import { Label } from "./label";
import { PointOfInterest } from "./label";

export interface Body {
  name: string;
  radius: number;
  distance: number;
  period: number;
  daylength: number;
  textures: TexturePaths;
  type: string;
  category?: string;
  tilt: number;
  temp?: number;
  orbits?: string;
  labels?: PointOfInterest[];
  traversable: boolean;
  offset?: number;
  gravity?: number;
  moons?: number;
  distanceAU?: number;
  escapeVelocity?: number;
  funFact?: string;
}

interface TexturePaths {
  map: string;
  bump?: string;
  atmosphere?: string;
  atmosphereAlpha?: string;
  specular?: string;
}

interface Atmosphere {
  map?: THREE.Texture;
  alpha?: THREE.Texture;
}

const timeFactor = 8 * Math.PI * 2; // 1s real-time => 8h simulation time

// True-scale world unit: 1 unit = 1 Earth radius (6371 km).
export const EARTH_RADIUS_KM = 6371;
// Saturn's ring system outer edge, km (used to size the ring in true scale).
export const RING_OUTER_KM = 140000;

const normaliseRadius = (radius: number): number => {
  return Math.sqrt(radius) / 500;
};

const normaliseDistance = (distance: number): number => {
  return Math.pow(distance, 0.4);
};

/** Exported for the view-mode moon guard in solar-system.ts. */
export { normaliseRadius, normaliseDistance };

/** View-mode stylisation override — see createSolarSystem's moon guard. */
export interface StylisedValues {
  radius: number;
  distance: number;
}

const degreesToRadians = (degrees: number): number => {
  return (Math.PI * degrees) / 180;
};

export class PlanetaryObject {
  radius: number; // in km
  distance: number; // in million km
  period: number; // in days
  daylength: number; // in hours
  orbits?: string;
  type: string;
  tilt: number; // degrees
  /**
   * Outer transform holder — the camera, moons, and orbit paths are parented
   * here. It only TRANSLATES (orbit), carries the static axial tilt, and
   * scales (true-scale). It never rotates per-frame: a rotating parent would
   * drag the attached camera around the body, making the view orbit the
   * planet (day/night spin is applied to {@link spinMesh} instead).
   */
  mesh: THREE.Object3D;
  /**
   * Inner visual mesh — the textured sphere (or ring) that carries the
   * day/night rotation, plus the atmosphere and POI labels glued to the
   * surface. Children of this mesh rotate with the planet's surface.
   */
  spinMesh: THREE.Mesh;
  path?: THREE.Line;
  rng: number;
  map!: THREE.Texture;
  bumpMap?: THREE.Texture;
  specularMap?: THREE.Texture;
  atmosphere: Atmosphere = {};
  labels!: Label;

  /** Base (unscaled) sphere radius of the mesh geometry. */
  baseRadius: number;
  /** Base (unscaled) orbit radius of the path geometry, in parent-local units. */
  baseDistance: number;
  /** Real distance from parent centre in km (0 for the Sun and rings). */
  distanceKm: number;
  /**
   * Orbit radius currently used by tick(), in parent-local units.
   * Equal to baseDistance in view mode; in true-scale mode it is
   * worldDistance / parentWorldScale so the whole hierarchy stays consistent.
   */
  activeDistance: number;

  constructor(body: Body, stylised?: StylisedValues) {
    const { radius, distance, period, daylength, orbits, type, tilt } = body;

    // A moon may carry pre-computed view-mode values (the moon guard in
    // solar-system.ts) — raw km numbers stay untouched for the info panel
    // and true-scale mode either way.
    this.radius = stylised ? stylised.radius : normaliseRadius(radius);
    this.distance = stylised ? stylised.distance : normaliseDistance(distance);
    this.period = period;
    this.daylength = daylength;
    this.orbits = orbits;
    this.type = type;
    this.tilt = degreesToRadians(tilt);
    this.rng = body.offset ?? Math.random() * 2 * Math.PI;

    this.loadTextures(body.textures);

    // Outer rig: orbit translation + static axial tilt + true-scale scaling.
    // The camera, moons and paths attach here. See the `mesh` doc comment —
    // this object must never spin per-frame.
    this.mesh = new THREE.Object3D();
    // Rings inherit their tilt from the parent planet's mesh (as before);
    // only sphere bodies carry their own tilt on the rig.
    if (this.type !== "ring") {
      this.mesh.rotation.x = this.tilt;
    }
    this.mesh.userData.body = body;

    // Inner visual mesh: the textured body that performs the day/night spin.
    this.spinMesh = this.createMesh();
    this.mesh.add(this.spinMesh);

    // Orbit paths: planets & dwarf planets (around the Sun) and moons
    // (around their host). Rings have no orbit (distance 0 → a degenerate
    // zero-radius circle), so they get no path at all.
    if (this.orbits && this.type !== "ring") {
      this.path = createPath(this.distance);
      // Orbit paths must never intercept raycasts — otherwise clicks near a
      // parent body's orbit resolve to the wrong body (e.g. the Moon's path
      // circle around Earth captures every click while the camera orbits Earth).
      this.path.raycast = () => {};
    }

    if (this.atmosphere.map) {
      // Atmosphere rides the spinning visual so clouds rotate with the
      // surface; its tilt is inherited from the outer rig (no own rotation).
      this.spinMesh.add(this.createAtmosphereMesh());
    }

    this.initLabels(body.labels);

    const geometry = this.spinMesh.geometry as
      | THREE.SphereGeometry
      | THREE.RingGeometry;
    const params = geometry.parameters as {
      radius?: number;
      outerRadius?: number;
    };
    this.baseRadius = params.outerRadius ?? params.radius ?? 1;
    this.baseDistance = this.distance;
    this.activeDistance = this.distance;
    this.distanceKm = distance * 1e6;
  }

  /**
   * Creates label objects for each point-of-interest.
   * Labels attach to the SPINNING visual mesh so they stay glued to their
   * surface features as the planet rotates (the camera frame stays fixed).
   * @param labels - List of labels to display.
   */
  private initLabels = (labels?: PointOfInterest[]) => {
    this.labels = new Label(this.spinMesh, this.radius);

    if (labels) {
      labels.forEach((poi) => {
        this.labels.createPOILabel(poi);
      });
    }
  };

  /**
   * Prepare and load textures.
   * @param textures - Object of texture paths to load.
   */
  private loadTextures(textures: TexturePaths) {
    this.map = loadTexture(textures.map);
    if (textures.bump) {
      this.bumpMap = loadTexture(textures.bump);
    }
    if (textures.specular) {
      this.specularMap = loadTexture(textures.specular);
    }
    if (textures.atmosphere) {
      this.atmosphere.map = loadTexture(textures.atmosphere);
    }
    if (textures.atmosphereAlpha) {
      this.atmosphere.alpha = loadTexture(textures.atmosphereAlpha);
    }
  }

  /**
   * Creates the main mesh object with textures.
   * @returns celestial body mesh.
   */
  private createMesh = () => {
    if (this.type === "ring") {
      return createRingMesh(this.map);
    }

    const geometry = new THREE.SphereGeometry(this.radius, 64, 64);
    let material;
    if (this.type === "star") {
      material = new THREE.MeshBasicMaterial({
        map: this.map,
        lightMapIntensity: 2,
        toneMapped: false,
        color: new THREE.Color(2.5, 2.5, 2.5),
      });
    } else {
      material = new THREE.MeshPhongMaterial({
        map: this.map,
        shininess: 5,
        toneMapped: true,
      });

      if (this.bumpMap) {
        material.bumpMap = this.bumpMap;
        material.bumpScale = this.radius / 50;
      }

      if (this.specularMap) {
        material.specularMap = this.specularMap;
      }
    }
    // Smooth-gradient planets (Neptune, Uranus, the ice giants' bands)
    // show hard 8-bit colour stair-stepping without dithering.
    material.dithering = true;

    const sphere = new THREE.Mesh(geometry, material);
    // No rotation.x here — the static axial tilt lives on the outer rig so
    // the camera/moon frame stays untwisted; this mesh only spins on Y
    // (day/night), which then happens around the rig's tilted axis.
    sphere.castShadow = true;
    sphere.receiveShadow = true;

    return sphere;
  };

  /**
   * Creates the atmosphere mesh object with textures.
   * @returns atmosphere mesh.
   */
  private createAtmosphereMesh = () => {
    const geometry = new THREE.SphereGeometry(this.radius + 0.0005, 64, 64);

    const material = new THREE.MeshPhongMaterial({
      map: this.atmosphere?.map,
      transparent: true,
    });
    material.dithering = true;

    if (this.atmosphere.alpha) {
      material.alphaMap = this.atmosphere.alpha;
    }

    const sphere = new THREE.Mesh(geometry, material);
    sphere.receiveShadow = true;
    return sphere;
  };

  private getRotation = (elapsedTime: number) => {
    return this.daylength ? (elapsedTime * timeFactor) / this.daylength : 0;
  };

  private getOrbitRotation = (elapsedTime: number) => {
    return this.period ? (elapsedTime * timeFactor) / (this.period * 24) : 0;
  };

  /**
   * Updates orbital position and rotation.
   * @param elapsedTime - number of seconds elapsed.
   */
  tick = (elapsedTime: number) => {
    // Convert real-time seconds to rotation.
    const rotation = this.getRotation(elapsedTime);
    const orbitRotation = this.getOrbitRotation(elapsedTime);
    const orbit = orbitRotation + this.rng;

    // Circular rotation around orbit.
    this.mesh.position.x = Math.sin(orbit) * this.activeDistance;
    this.mesh.position.z = Math.cos(orbit) * this.activeDistance;

    // Day/night spin on the VISUAL mesh only — never on the outer rig, which
    // hosts the camera (a spinning camera parent would orbit the view around
    // the body every frame).
    if (this.type === "ring") {
      this.spinMesh.rotation.z = rotation;
    } else {
      this.spinMesh.rotation.y = rotation;
    }
  };

  /**
   * @returns the minimum orbital control camera distance allowed.
   */
  getMinDistance = (): number => {
    return this.radius * 3.5;
  };
}
