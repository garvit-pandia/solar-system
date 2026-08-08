import * as THREE from "three";
import type { SolarSystem } from "./solar-system";

/**
 * Orbit-ring declutter system.
 *
 * Every path's opacity is recomputed per frame as
 *   base × rankFade × distanceFade
 * so that from the default top-down overview only the two or three nearest
 * rings are clearly visible and everything else sinks to a ghost. As the
 * camera approaches a planet its ring "lights up", and the focused body's
 * own ring is always boosted as a home beacon.
 *
 * - rankFade: paths of the same class (sun-orbiting vs moons) sorted by
 *   camera distance → nearest 1.0, 2nd 0.62, 3rd 0.34, rest floor.
 * - distanceFade: smoothstep falloff from near to far (× parent world
 *   scale, so the same numbers work in view AND true-scale mode).
 * - Focus boost: the focused body's ring never drops below focusMin.
 * - True-scale raises the floors — rings double as the reference grid there.
 *
 * Perf: zero per-frame allocations (preallocated rank buffers, temp
 * vectors), and material writes are skipped when the opacity delta is
 * below an epsilon.
 */

interface FadeConfig {
  planetBase: number;
  moonBase: number;
  nearPlanet: number;
  farPlanet: number;
  nearMoon: number;
  farMoon: number;
  rankFloor: number;
  distFloor: number;
  focusMin: number;
}

const VIEW_CONFIG: FadeConfig = {
  planetBase: 0.28,
  moonBase: 0.16,
  nearPlanet: 60,
  farPlanet: 400,
  nearMoon: 20,
  farMoon: 140,
  // Near-invisible ghosts: from the default top view only the 3 nearest
  // rings (plus the focus beacon) read as lines; the rest disappear.
  rankFloor: 0.02,
  distFloor: 0.02,
  focusMin: 0.5,
};

const TRUE_SCALE_CONFIG: FadeConfig = {
  planetBase: 0.3,
  moonBase: 0.2,
  nearPlanet: 60,
  farPlanet: 400,
  nearMoon: 20,
  farMoon: 140,
  rankFloor: 0.3,
  distFloor: 0.35,
  focusMin: 0.55,
};

const OPACITY_EPSILON = 0.004;
const RANK_FADES = [1, 0.62, 0.34];

interface PathEntry {
  path: THREE.Line;
  material: THREE.LineBasicMaterial;
  /** Body this path belongs to (its name matches a solarSystem key). */
  bodyName: string;
  /** Body this path orbits around (Sun or a planet) — for world scale. */
  orbitsName: string;
  /** The body mesh the path is centred on. */
  parent: THREE.Object3D;
  isMoon: boolean;
  /** Cached parent world scale — refreshed on true-scale toggles. */
  parentScale: number;
  /** Last opacity written to the material. */
  opacity: number;
}

export interface PathFaderOptions {
  solarSystem: SolarSystem;
  getWorldScale: (name: string) => number;
  /** Current focus name — the focused body's ring gets the boost. */
  getFocus: () => string;
}

export class PathFader {
  private entries: PathEntry[] = [];
  private focusPath: THREE.Line | null = null;
  private config: FadeConfig = VIEW_CONFIG;

  private readonly getWorldScale: (name: string) => number;
  private readonly getFocus: () => string;

  // Preallocated scratch buffers (no per-frame allocation).
  private readonly distSq: number[] = [];
  private readonly ranks: number[] = [];
  private readonly parentPos = new THREE.Vector3();

  constructor(options: PathFaderOptions) {
    this.getWorldScale = options.getWorldScale;
    this.getFocus = options.getFocus;

    for (const name in options.solarSystem) {
      const object = options.solarSystem[name];
      if (!object.path || !object.orbits) continue;
      const material = object.path.material as THREE.LineBasicMaterial;
      this.entries.push({
        path: object.path,
        material,
        bodyName: name,
        orbitsName: object.orbits,
        parent: options.solarSystem[object.orbits].mesh,
        isMoon: object.orbits !== "Sun",
        parentScale: 1,
        opacity: -1,
      });
    }

    this.distSq.length = this.entries.length;
    this.ranks.length = this.entries.length;
    this.applyFocus(this.getFocus());
  }

  /** Switch the home-beacon ring (called on focus changes). */
  applyFocus = (name: string): void => {
    this.focusPath =
      this.entries.find((entry) => entry.bodyName === name)?.path ?? null;
  };

  /** Re-read parent world scales + config (called on true-scale toggles). */
  applyTrueScale = (enabled: boolean): void => {
    this.config = enabled ? TRUE_SCALE_CONFIG : VIEW_CONFIG;
    for (const entry of this.entries) {
      entry.parentScale = this.getWorldScale(entry.orbitsName);
    }
  };

  /**
   * Per-frame fade update. Camera position in world space.
   */
  update = (cameraWorldPos: THREE.Vector3): void => {
    const n = this.entries.length;
    if (n === 0) return;

    const cfg = this.config;

    // Distance from the camera to each path's centre (its parent body).
    for (let i = 0; i < n; i++) {
      const entry = this.entries[i];
      entry.parent.getWorldPosition(this.parentPos);
      this.distSq[i] = this.parentPos.distanceToSquared(cameraWorldPos);
    }

    // Rank within class by counting nearer paths (n ≤ ~20 → trivial).
    // Ties (e.g. the camera exactly on the orbital axis above the Sun) are
    // broken by entry order — planets.json lists bodies by orbit size, so
    // the inner rings stay brightest from the classic top-down view.
    for (let i = 0; i < n; i++) {
      let rank = 0;
      const isMoon = this.entries[i].isMoon;
      for (let j = 0; j < n; j++) {
        if (this.entries[j].isMoon !== isMoon) continue;
        if (
          this.distSq[j] < this.distSq[i] ||
          (this.distSq[j] === this.distSq[i] && j < i)
        ) {
          rank++;
        }
      }
      this.ranks[i] = rank;
    }

    for (let i = 0; i < n; i++) {
      const entry = this.entries[i];
      // Master switches (Planet Orbits / Moon Orbits toggles) — untouched.
      if (!entry.path.visible) continue;

      const rank = this.ranks[i];
      const rankFade =
        rank < RANK_FADES.length ? RANK_FADES[rank] : cfg.rankFloor;

      const dist = Math.sqrt(this.distSq[i]);
      const near = (entry.isMoon ? cfg.nearMoon : cfg.nearPlanet) * entry.parentScale;
      const far = (entry.isMoon ? cfg.farMoon : cfg.farPlanet) * entry.parentScale;
      const t = Math.min(1, Math.max(0, (far - dist) / Math.max(1e-6, far - near)));
      // smoothstep
      const distFade = cfg.distFloor + (1 - cfg.distFloor) * t * t * (3 - 2 * t);

      let opacity =
        (entry.isMoon ? cfg.moonBase : cfg.planetBase) * rankFade * distFade;
      if (entry.path === this.focusPath) {
        opacity = Math.max(opacity, cfg.focusMin);
      }

      if (Math.abs(opacity - entry.opacity) > OPACITY_EPSILON) {
        entry.material.opacity = opacity;
        entry.opacity = opacity;
      }
    }
  };
}
