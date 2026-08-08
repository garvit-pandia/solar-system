import * as THREE from "three";

// Real main-belt extent: ~329 to ~478 million km from the Sun. In view mode
// the belt is compressed into a stylised band; in true-scale mode the whole
// group is scaled so its inner edge lands at the real inner-edge distance.
const REAL_INNER_KM = 329e6;

const instanceCount = 3600;
const minRadius = 9.6;
const maxRadius = 13.9;
const minSize = 0.02;
const maxSize = 0.12;
const orbitSpeedFactor = 0.08;
const rotationSpeed = 0.05;

// Per-instance band thickness varies — the real belt is a diffuse, uneven
// band, not a flat disc.
const maxBandHalf = 0.5;

// Rock palette: greys, browns, tans — drawn from real asteroid imaging.
const ROCK_COLORS = [
  0x8b8b8f, 0x9a9488, 0x7d7d83, 0xa09a8f, 0x8f8578, 0x76767c, 0x968e84,
];

const randomBetween = (min: number, max: number): number => {
  return min + Math.random() * (max - min);
};

/**
 * A size distribution weighted toward small rocks — a handful of large
 * bodies (Vesta, Ceres-scale) and a long tail of small ones, like the
 * real belt.
 */
const powerSize = (): number => {
  return minSize + (maxSize - minSize) * Math.pow(Math.random(), 2.6);
};

export class AsteroidBelt {
  mesh: THREE.Group;
  radii: number[];
  omegas: number[];
  ys: number[];
  phases: number[];
  sizes: number[];
  private dummy: THREE.Object3D = new THREE.Object3D();
  private instanced: THREE.InstancedMesh[] = [];

  constructor(scene: THREE.Scene) {
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

    this.radii = [];
    this.omegas = [];
    this.ys = [];
    this.phases = [];
    this.sizes = [];

    for (let i = 0; i < instanceCount; i++) {
      const radius = randomBetween(minRadius, maxRadius);
      this.radii.push(radius);
      // Inner rocks orbit faster (Kepler's third law, approximated).
      this.omegas.push(orbitSpeedFactor / Math.sqrt(radius));
      this.ys.push(randomBetween(-maxBandHalf, maxBandHalf));
      this.phases.push(Math.random() * Math.PI * 2);
      this.sizes.push(powerSize());
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
      instanced.castShadow = true;
      instanced.receiveShadow = true;

      // Per-instance colour variation from the rock palette.
      for (let i = 0; i < instanceCount; i++) {
        const color = new THREE.Color(
          ROCK_COLORS[Math.floor(Math.random() * ROCK_COLORS.length)]
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

    // Belt starts hidden — opt in from the GUI.
    group.visible = false;
  }

  private createDustRing = (): THREE.Mesh => {
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
    gradient.addColorStop(0, "rgba(160, 150, 140, 0)");
    gradient.addColorStop(0.68, "rgba(160, 150, 140, 0.12)");
    gradient.addColorStop(0.82, "rgba(170, 158, 145, 0.5)");
    gradient.addColorStop(0.92, "rgba(160, 150, 140, 0.18)");
    gradient.addColorStop(1, "rgba(160, 150, 140, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.RingGeometry(minRadius, maxRadius, 128, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1;
    return ring;
  };

  private writeMatrices = (elapsedTime: number) => {
    for (let i = 0; i < instanceCount; i++) {
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
      this.dummy.scale.set(size, size, size * randomBetween(0.7, 1.3));
      this.dummy.updateMatrix();

      for (const instanced of this.instanced) {
        instanced.setMatrixAt(i, this.dummy.matrix);
        instanced.instanceMatrix.needsUpdate = true;
      }
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
      this.mesh.scale.setScalar(REAL_INNER_KM / 6371 / minRadius);
    } else {
      this.mesh.scale.setScalar(1);
    }
  };
}

export const createAsteroidBelt = (scene: THREE.Scene): AsteroidBelt => {
  return new AsteroidBelt(scene);
};
