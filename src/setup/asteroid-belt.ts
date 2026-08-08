import * as THREE from "three";

const instanceCount = 3200;
const minRadius = 9.6;
const maxRadius = 13.9;
const minSize = 0.03;
const maxSize = 0.09;
const bandHeight = 0.35;
const rotationSpeed = 0.05;
const orbitSpeedFactor = 0.08;

const randomBetween = (min: number, max: number): number => {
  return min + Math.random() * (max - min);
};

const randomRockColor = (): number => {
  return 0x6e6e76 + Math.floor(Math.random() * (0x8a8a92 - 0x6e6e76));
};

export class AsteroidBelt {
  mesh: THREE.InstancedMesh;
  radii: number[];
  omegas: number[];
  ys: number[];
  phases: number[];
  sizes: number[];
  private dummy: THREE.Object3D = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    // Shared unit dodecahedron; per-instance size is applied via matrix scale.
    const geometry = new THREE.DodecahedronGeometry(1, 0);

    const material = new THREE.MeshPhongMaterial({
      color: randomRockColor(),
      flatShading: true,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    this.radii = [];
    this.omegas = [];
    this.ys = [];
    this.phases = [];
    this.sizes = [];

    for (let i = 0; i < instanceCount; i++) {
      const radius = randomBetween(minRadius, maxRadius);
      this.radii.push(radius);
      this.omegas.push(orbitSpeedFactor / Math.sqrt(radius));
      this.ys.push(randomBetween(-bandHeight, bandHeight));
      this.phases.push(Math.random() * Math.PI * 2);
      this.sizes.push(randomBetween(minSize, maxSize));
    }

    this.writeMatrices(0);
  }

  private writeMatrices = (elapsedTime: number) => {
    for (let i = 0; i < instanceCount; i++) {
      const angle = this.phases[i] + this.omegas[i] * elapsedTime;
      const size = this.sizes[i];

      this.dummy.position.set(
        Math.sin(angle) * this.radii[i],
        this.ys[i],
        Math.cos(angle) * this.radii[i],
      );
      this.dummy.rotation.y = rotationSpeed * elapsedTime + this.phases[i];
      this.dummy.scale.set(size, size, size);
      this.dummy.updateMatrix();

      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  };

  tick = (elapsedTime: number) => {
    this.writeMatrices(elapsedTime);
  };
}

export const createAsteroidBelt = (scene: THREE.Scene): AsteroidBelt => {
  return new AsteroidBelt(scene);
};
