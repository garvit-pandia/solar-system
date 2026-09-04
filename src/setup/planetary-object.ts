import * as THREE from "three";
import { createRingMesh } from "./rings";
import { createPath, createEllipsePath, segmentCount } from "./path";
import { loadTexture } from "./textures";
import { Label } from "./label";
import { PointOfInterest } from "./label";
import {
  hasElements as bodyHasElements,
  semiMajorAxisAU,
  heliocentricSceneAU,
  orbitEllipsePointsAU,
  daysSinceJ2000FromElapsed,
} from "./ephemeris";

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
  composition?: string;
  whyMatters?: string;
  mission?: string;
}

interface TexturePaths {
  map: string;
  bump?: string;
  atmosphere?: string;
  atmosphereAlpha?: string;
  specular?: string;
  night?: string;
}

interface Atmosphere {
  map?: THREE.Texture;
  alpha?: THREE.Texture;
}

const timeFactor = 8 * Math.PI * 2; // 1s real-time => 8h simulation time

// Scratch for the per-frame Keplerian position (no tick-path allocations).
const helioScratch = new THREE.Vector3();
// Scratch for the night-lights sun-direction update.
const nightSunScratch = new THREE.Vector3();

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

/**
 * Fresnel rim-scatter shells — the "this looks real" cue hard planet edges
 * lack. One additive back-side shell per atmosphere-bearing body, tinted per
 * world: Rayleigh-blue Earth, creamy Venus, dusty Mars, faint haze on the
 * gas giants, orange smog on Titan. Power tunes the falloff tightness.
 */
interface RimConfig {
  color: [number, number, number];
  power: number;
  intensity: number;
  /** Shell radius relative to the planet's surface. */
  size: number;
}

const ATMOSPHERE_RIMS: Record<string, RimConfig> = {
  Venus: { color: [0.95, 0.82, 0.55], power: 3.2, intensity: 0.85, size: 1.06 },
  Earth: { color: [0.35, 0.58, 1.0], power: 3.6, intensity: 1.0, size: 1.055 },
  Mars: { color: [0.85, 0.58, 0.38], power: 4.2, intensity: 0.4, size: 1.05 },
  Jupiter: { color: [0.85, 0.76, 0.62], power: 3.8, intensity: 0.4, size: 1.04 },
  Saturn: { color: [0.92, 0.84, 0.62], power: 3.8, intensity: 0.38, size: 1.04 },
  Uranus: { color: [0.55, 0.85, 0.92], power: 3.6, intensity: 0.45, size: 1.05 },
  Neptune: { color: [0.42, 0.62, 1.0], power: 3.6, intensity: 0.5, size: 1.05 },
  Titan: { color: [0.9, 0.68, 0.4], power: 3.4, intensity: 0.55, size: 1.12 },
};

const RIM_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vNormal;
  void main() {
    // Back-side shell: the limb gathers depth, the disc's centre falls off.
    float rim = pow(max(0.0, 0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0))), uPower);
    gl_FragColor = vec4(uColor * rim * uIntensity, rim * uIntensity);
  }
`;

export class PlanetaryObject {
  readonly name: string;
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
  nightMap?: THREE.Texture;
  /** Uniform bucket for the night-lights shader (Earth only). */
  nightUniforms?: { uSunDir: { value: THREE.Vector3 } };
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
   * Circular orbits (moons): the orbit radius. Keplerian bodies: the
   * semi-major axis in local units (the path is a unit ellipse scaled by it).
   */
  activeDistance: number;
  /** True when the body's position comes from J2000 Keplerian elements. */
  readonly hasElements: boolean;
  /** Semi-major axis at J2000, in AU (Keplerian bodies only). */
  readonly semiMajorAU: number;
  /**
   * AU → parent-local units factor currently applied to the Keplerian
   * position: stylised (√-compressed) in view mode, real 1-unit-per-Earth-
   * radius in true scale. Mutable — applyTrueScale rewrites it per mode.
   */
  orbitUnitScale: number;
  /** View-mode AU → local factor (Keplerian bodies only). */
  readonly baseOrbitUnitScale: number;

  constructor(body: Body, stylised?: StylisedValues) {
    const { radius, distance, period, daylength, orbits, type, tilt } = body;

    this.name = body.name;

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
    // only sphere bodies carry their own tilt on the rig. The Sun does NOT
    // tilt: its rig defines the ecliptic frame the Keplerian elements are
    // expressed in — tilting it would rotate every planet's real position
    // by the Sun's 7.25° obliquity (invisible on a glowing sphere, wrong in
    // the sky math).
    if (this.type !== "ring" && this.type !== "star") {
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
      if (bodyHasElements(body.name)) {
        // Real Keplerian ellipse baked from the J2000 elements (unit
        // semi-major axis — scale is applied after baseDistance, below).
        // Solid ring: dashes read as broken arcs from the top-down view.
        const segments = segmentCount(semiMajorAxisAU(body.name));
        this.path = createEllipsePath(
          orbitEllipsePointsAU(body.name, 0, segments)!,
          segments
        );
      } else {
        this.path = createPath(this.distance);
      }
      // Orbit paths must never intercept raycasts — otherwise clicks near a
      // parent body's orbit resolve to the wrong body (e.g. the Moon's path
      // circle around Earth captures every click while the camera orbits Earth).
      this.path.raycast = () => {};
    }

    if (this.atmosphere.map) {
      // Cloud layer rides the spinning visual so clouds rotate with the
      // surface; its tilt is inherited from the outer rig (no own rotation).
      this.spinMesh.add(this.createAtmosphereMesh());
    }

    // Fresnel rim-scatter shell (see ATMOSPHERE_RIMS) — sits just outside
    // the surface, additive, unaffected by the day/night spin.
    const rim = ATMOSPHERE_RIMS[body.name];
    if (rim) {
      this.spinMesh.add(this.createRimShell(rim));
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

    // Keplerian bodies: anchor the AU→local factor so the real ellipse
    // passes through the stylised semi-major axis (view mode keeps the
    // √-compressed distances; true scale rewrites orbitUnitScale).
    this.hasElements = bodyHasElements(body.name);
    this.semiMajorAU = this.hasElements ? semiMajorAxisAU(body.name) : NaN;
    this.baseOrbitUnitScale = this.hasElements
      ? this.baseDistance / this.semiMajorAU
      : 1;
    this.orbitUnitScale = this.baseOrbitUnitScale;
    if (this.hasElements && this.path) {
      this.path.scale.setScalar(this.baseDistance);
    }
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
    if (textures.night) {
      this.nightMap = loadTexture(textures.night);
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
      // Sodium-amber disc with HDR gain ABOVE the bloom threshold (1.2) so
      // only the Sun blooms; planet whites (~1.0 max) stay clean.
      material = new THREE.MeshBasicMaterial({
        map: this.map,
        lightMapIntensity: 2,
        toneMapped: false,
        color: new THREE.Color(2.2, 1.6, 1.1),
      });
    } else {
      // Matte observatory finish: near-zero specular so the sub-solar point
      // never clips to white; bands and storms keep texture at noon.
      material = new THREE.MeshPhongMaterial({
        map: this.map,
        shininess: 0,
        specular: new THREE.Color(0x000000),
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

    // Earth night lights: additive city-lights mask blended in where the
    // sun direction dips below the horizon. Injected via onBeforeCompile so
    // the standard Phong pipeline (bump, specular, shadows) is untouched.
    if (this.nightMap) {
      this.nightUniforms = { uSunDir: { value: new THREE.Vector3(1, 0, 0) } };
      const uniforms = this.nightUniforms;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.nightMap = { value: this.nightMap };
        shader.uniforms.uSunDir = uniforms.uSunDir;
        shader.uniforms.uNightIntensity = { value: 1.6 };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vWorldNormal;"
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);"
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform sampler2D nightMap;\nuniform vec3 uSunDir;\nuniform float uNightIntensity;\nvarying vec3 vWorldNormal;"
          )
          .replace(
            "#include <dithering_fragment>",
            [
              "float dayDot = dot(normalize(vWorldNormal), normalize(uSunDir));",
              "float nightMask = smoothstep(0.08, -0.18, dayDot);",
              "vec3 cityGlow = texture2D(nightMap, vMapUv).rgb;",
              "gl_FragColor.rgb += cityGlow * cityGlow * nightMask * uNightIntensity;",
              "#include <dithering_fragment>",
            ].join("\n")
          );
      };
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

  /**
   * Fresnel rim-scatter shell — an additive back-side sphere just outside
   * the surface that reads as an atmosphere limb (see ATMOSPHERE_RIMS).
   */
  private createRimShell = (rim: RimConfig) => {
    const geometry = new THREE.SphereGeometry(this.radius * rim.size, 48, 48);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(...rim.color) },
        uPower: { value: rim.power },
        uIntensity: { value: rim.intensity },
      },
      vertexShader: RIM_VERTEX,
      fragmentShader: RIM_FRAGMENT,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(geometry, material);
    shell.raycast = () => {};
    return shell;
  };

  private getRotation = (elapsedTime: number) => {
    return this.daylength ? (elapsedTime * timeFactor) / this.daylength : 0;
  };

  private getOrbitRotation = (elapsedTime: number) => {
    return this.period ? (elapsedTime * timeFactor) / (this.period * 24) : 0;
  };

  /**
   * Updates orbital position and rotation.
   *
   * Keplerian bodies (8 planets + Pluto) get their position from the J2000
   * element solver at the sim instant; moons and stylised dwarfs keep the
   * classic circular orbit. The day/night spin applies to the VISUAL mesh
   * only — never the outer rig, which hosts the camera (a spinning camera
   * parent would orbit the view around the body every frame).
   * @param elapsedTime - number of seconds elapsed.
   */
  tick = (elapsedTime: number) => {
    const rotation = this.getRotation(elapsedTime);

    if (this.hasElements) {
      heliocentricSceneAU(
        this.name,
        daysSinceJ2000FromElapsed(elapsedTime),
        helioScratch
      );
      this.mesh.position.copy(helioScratch).multiplyScalar(this.orbitUnitScale);
    } else {
      // Circular rotation around the orbit (moons, stylised dwarfs).
      const orbitRotation = this.getOrbitRotation(elapsedTime);
      const orbit = orbitRotation + this.rng;
      this.mesh.position.x = Math.sin(orbit) * this.activeDistance;
      this.mesh.position.z = Math.cos(orbit) * this.activeDistance;
    }

    // Day/night spin on the VISUAL mesh only — see the `mesh` doc comment.
    if (this.type === "ring") {
      this.spinMesh.rotation.z = rotation;
    } else {
      this.spinMesh.rotation.y = rotation;
    }

    // City-lights shader: track the sun direction in world space (the
    // planet moves along its orbit, so the terminator rotates too).
    if (this.nightUniforms) {
      this.mesh.getWorldPosition(nightSunScratch);
      this.nightUniforms.uSunDir.value.copy(nightSunScratch).multiplyScalar(-1);
    }
  };

  /**
   * @returns the minimum orbital control camera distance allowed.
   */
  getMinDistance = (): number => {
    return this.radius * 3.5;
  };
}
