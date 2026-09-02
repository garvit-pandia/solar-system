import * as THREE from "three";

const rotationSpeed = 0.05;

export interface BeltConfig {
  /** Real inner-edge distance of the belt, in km (true-scale anchor). */
  realInnerKm: number;
  /** Number of rocks per instanced geometry. */
  instanceCount: number;
  /** Orbit band inner radius, in view-mode units. */
  minRadius: number;
  /** Orbit band outer radius, in view-mode units. */
  maxRadius: number;
  /** Rock size range, in view-mode units. */
  minSize: number;
  maxSize: number;
  /** Angular speed factor (inner rocks orbit faster, Kepler's third law). */
  orbitSpeedFactor: number;
  /** Half-thickness of the band (orbital inclinations). */
  bandHalf: number;
  /** Rock colour palette (per-instance brightness scatter applied on top). */
  rockColors: number[];
  /** Dust-disc gradient colours: [centre, inner glow, peak, outer glow]. */
  dustColors: [string, string, string, string];
  /** Dust-disc opacity. */
  dustOpacity: number;
}

const randomBetween = (min: number, max: number): number => {
  return min + Math.random() * (max - min);
};

/**
 * A stylised debris belt: instanced rocks on near-Keplerian orbits plus a
 * faint additive dust disc. The same class drives both the main asteroid
 * belt and the Kuiper belt — only the config differs.
 *
 * View mode: the band sits at the given stylised radii. True-scale mode:
 * the whole group is scaled so its inner edge lands at the real
 * inner-edge distance (realInnerKm / 6371 world units).
 */
export class InstancedBelt {
  mesh: THREE.Group;
  private config: BeltConfig;
  private radii: number[] = [];
  private omegas: number[] = [];
  private ys: number[] = [];
  private phases: number[] = [];
  private sizes: number[] = [];
  private zScales: number[] = [];
  private dummy: THREE.Object3D = new THREE.Object3D();
  private instanced: THREE.InstancedMesh[] = [];

  constructor(scene: THREE.Scene, config: BeltConfig) {
    this.config = config;
    const { instanceCount, minRadius, maxRadius } = config;

    const group = new THREE.Group();
    this.mesh = group;
    scene.add(group);

    // Three rock shapes, each an instanced mesh, so the belt is not a
    // single uniform blob.
    const geometries = [
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
    ];

    for (let i = 0; i < instanceCount; i++) {
      const radius = randomBetween(minRadius, maxRadius);
      this.radii.push(radius);
      // Inner rocks orbit faster (Kepler's third law, approximated).
      this.omegas.push(config.orbitSpeedFactor / Math.sqrt(radius));
      this.ys.push(randomBetween(-config.bandHalf, config.bandHalf));
      this.phases.push(Math.random() * Math.PI * 2);
      this.sizes.push(this.powerSize());
      // Fixed per-rock flattening — randomising it per FRAME would make every
      // rock visibly pulse/flicker as its shape changes each tick.
      this.zScales.push(randomBetween(0.7, 1.3));
    }

    for (const geometry of geometries) {
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        flatShading: true,
      });

      const instanced = new THREE.InstancedMesh(
        geometry,
        material,
        instanceCount
      );
      // Sub-pixel rocks gain nothing from the 6-face point-light shadow
      // map — skip it entirely (a large per-frame fill-rate saving while a
      // belt is visible).
      instanced.castShadow = false;
      instanced.receiveShadow = false;
      // Belts are scenery, never click targets — keep them out of every
      // raycast (pick, hover, zoom-probe). InstancedMesh raycast walks ALL
      // instances per test, which is wasted work for thousands of rocks.
      instanced.raycast = () => {};

      // Per-instance colour variation from the rock palette.
      for (let i = 0; i < instanceCount; i++) {
        const color = new THREE.Color(
          config.rockColors[Math.floor(Math.random() * config.rockColors.length)]
        );
        // Slight brightness scatter keeps the band from looking flat.
        color.multiplyScalar(randomBetween(0.85, 1.15));
        instanced.setColorAt(i, color);
      }
      if (instanced.instanceColor) {
        instanced.instanceColor.needsUpdate = true;
      }

      group.add(instanced);
      this.instanced.push(instanced);
    }

    // Faint dust disc: a radial-gradient ring that reads as the belt's
    // diffuse glow when the individual rocks are too small to see.
    group.add(this.createDustRing());

    this.writeMatrices(0);

    // Belts start hidden — opt in from the GUI.
    group.visible = false;
  }

  /** A size distribution weighted toward small rocks — a handful of large
   * bodies (Vesta, Ceres-scale) and a long tail of small ones. */
  private powerSize = (): number => {
    const { minSize, maxSize } = this.config;
    return minSize + (maxSize - minSize) * Math.pow(Math.random(), 2.6);
  };

  private createDustRing = (): THREE.Mesh => {
    const { minRadius, maxRadius, dustColors, dustOpacity } = this.config;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.1,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, dustColors[0]);
    gradient.addColorStop(0.68, dustColors[1]);
    gradient.addColorStop(0.82, dustColors[2]);
    gradient.addColorStop(0.92, dustColors[3]);
    gradient.addColorStop(1, dustColors[0]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.RingGeometry(minRadius, maxRadius, 128, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: dustOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1;
    ring.raycast = () => {};
    return ring;
  };

  private writeMatrices = (elapsedTime: number) => {
    for (let i = 0; i < this.config.instanceCount; i++) {
      const angle = this.phases[i] + this.omegas[i] * elapsedTime;
      const size = this.sizes[i];

      this.dummy.position.set(
        Math.sin(angle) * this.radii[i],
        this.ys[i],
        Math.cos(angle) * this.radii[i]
      );
      this.dummy.rotation.set(
        Math.sin(this.phases[i]) * 0.8,
        rotationSpeed * elapsedTime + this.phases[i],
        Math.cos(this.phases[i]) * 0.8
      );
      this.dummy.scale.set(size, size, size * this.zScales[i]);
      this.dummy.updateMatrix();

      for (const instanced of this.instanced) {
        instanced.setMatrixAt(i, this.dummy.matrix);
      }
    }
    // One flag per mesh after the batch — setting it inside the loop is
    // redundant (it's a boolean, not a counter).
    for (const instanced of this.instanced) {
      instanced.instanceMatrix.needsUpdate = true;
    }
  };

  tick = (elapsedTime: number) => {
    if (!this.mesh.visible) return;
    this.writeMatrices(elapsedTime);
  };

  /**
   * Scale the belt for true-scale mode: the group's inner edge must land at
   * the real belt inner distance. In view mode the group is unscaled.
   */
  setTrueScale = (enabled: boolean) => {
    if (enabled) {
      this.mesh.scale.setScalar(
        this.config.realInnerKm / 6371 / this.config.minRadius
      );
    } else {
      this.mesh.scale.setScalar(1);
    }
  };
}

// ---------------------------------------------------------------------------
// Main asteroid belt — real extent ~329 to ~478 million km from the Sun.
// ---------------------------------------------------------------------------

const ASTEROID_CONFIG: BeltConfig = {
  realInnerKm: 329e6,
  instanceCount: 3600,
  minRadius: 9.6,
  maxRadius: 13.9,
  minSize: 0.02,
  maxSize: 0.12,
  orbitSpeedFactor: 0.08,
  bandHalf: 0.5,
  rockColors: [
    0x8b8b8f, 0x9a9488, 0x7d7d83, 0xa09a8f, 0x8f8578, 0x76767c, 0x968e84,
  ],
  dustColors: [
    "rgba(160, 150, 140, 0)",
    "rgba(160, 150, 140, 0.12)",
    "rgba(170, 158, 145, 0.5)",
    "rgba(160, 150, 140, 0.18)",
  ],
  dustOpacity: 0.35,
};

export const createAsteroidBelt = (scene: THREE.Scene): InstancedBelt => {
  return new InstancedBelt(scene, ASTEROID_CONFIG);
};

// ---------------------------------------------------------------------------
// Kuiper belt — real extent ~30 to ~50 AU (4.49e9 to 7.48e9 km). The
// view-mode radii keep the same 30:50 ratio so the true-scale band lands
// exactly at the real inner/outer edges.
// ---------------------------------------------------------------------------

const KUIPER_CONFIG: BeltConfig = {
  realInnerKm: 4.4879e9, // 30 AU
  instanceCount: 2600,
  minRadius: 30,
  maxRadius: 50,
  minSize: 0.03,
  maxSize: 0.14,
  orbitSpeedFactor: 0.03,
  bandHalf: 0.8,
  rockColors: [
    0x8fa5bb, 0x9db2c6, 0x7e94ab, 0xa5b8ca, 0x8ba0b6, 0x94a9bd, 0x86a0b7,
  ],
  dustColors: [
    "rgba(150, 170, 195, 0)",
    "rgba(150, 170, 195, 0.1)",
    "rgba(165, 185, 210, 0.42)",
    "rgba(150, 170, 195, 0.15)",
  ],
  dustOpacity: 0.28,
};

export const createKuiperBelt = (scene: THREE.Scene): InstancedBelt => {
  return new InstancedBelt(scene, KUIPER_CONFIG);
};
