import * as THREE from "three";

const STAR_COUNT = 10000;

// Temperature-inspired star palette: warm K/M dwarfs, orange, white,
// blue-white and blue O/B stars.
const STAR_PALETTE: [number, number, number][] = [
  [1.0, 0.82, 0.58], // orange (K/M)
  [1.0, 0.95, 0.82], // warm white
  [1.0, 0.99, 0.94], // white
  [0.82, 0.88, 1.0], // blue-white
  [0.6, 0.72, 1.0], // blue (O/B)
];

const PALETTE_WEIGHTS = [0.16, 0.24, 0.3, 0.2, 0.1];

const pickColor = (): [number, number, number] => {
  const roll = Math.random();
  let acc = 0;
  for (let i = 0; i < STAR_PALETTE.length; i++) {
    acc += PALETTE_WEIGHTS[i];
    if (roll <= acc) return STAR_PALETTE[i];
  }
  return STAR_PALETTE[0];
};

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uStarScale;

  varying vec3 vColor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Subtle per-star twinkle: 72%..100% of the base brightness.
    float twinkle = 0.72 + 0.28 * sin(uTime * aSpeed + aPhase);
    vColor = aColor * twinkle;
    gl_PointSize = uPixelRatio * (uStarScale * aSize) / max(-mvPosition.z, 0.001);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    // Soft quadratic falloff: bright core, gentle edge.
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - r) * (1.0 - r);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/**
 * Procedural starfield + Milky Way band.
 *
 * Replaces the flat cube-map background with ~10k instanced star points
 * (temperature colours, magnitude-based brightness, per-star twinkle) plus a
 * faint additive Milky Way band. Both follow the camera so they always sit
 * "at infinity" — the shell radius derives from the camera far plane, which
 * keeps them inside the frustum in both view and true-scale modes.
 *
 * The env map is still loaded as `scene.environment` (reflections), but the
 * background itself becomes the starfield.
 */
export class Starfield {
  group: THREE.Group;
  private stars: THREE.Points;
  private milkyWay: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private currentKey = "";

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    // Hidden until the first update() sizes the shell (avoids a first-frame
    // flash of unsized unit-radius points).
    this.group.visible = false;

    // --- Stars -----------------------------------------------------------
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);
    const speeds = new Float32Array(STAR_COUNT);

    // Fibonacci sphere: even, clustering-free distribution.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < STAR_COUNT; i++) {
      const y = 1 - (i / (STAR_COUNT - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = golden * i;
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius;

      const [r, g, b] = pickColor();
      // Magnitude-like brightness: most stars dim, a few bright.
      const brightness = 0.5 + 0.6 * Math.pow(Math.random(), 2.2);
      colors[i * 3] = r * brightness;
      colors[i * 3 + 1] = g * brightness;
      colors[i * 3 + 2] = b * brightness;

      sizes[i] = 0.45 + 1.15 * Math.pow(Math.random(), 3.2);
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.6 + Math.random() * 2.4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uStarScale: { value: 100 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(geometry, this.material);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // --- Milky Way band --------------------------------------------------
    // A procedural Gaussian glow around the galactic plane: exp falloff
    // guarantees a perfectly smooth fade with no hard edges or density
    // seams, plus a subtle low-frequency mottle for texture. (A real
    // sky-map band kept showing its own sharp edges and star-density
    // boundaries against the procedural starfield.)
    const bandCanvas = document.createElement("canvas");
    bandCanvas.width = 512;
    bandCanvas.height = 256;
    const bandCtx = bandCanvas.getContext("2d")!;
    const bandImg = bandCtx.createImageData(512, 256);
    // sigma of the vertical Gaussian, in texture-v units (~17° half-width
    // on the cap, matching the real band's apparent width)
    const SIGMA = 0.08;
    // peak texture value: ~0.32 so that ×1.7 colour lands at ~0.55
    // luminance in the band core (visible glow, never saturating)
    const PEAK = 0.32;
    const mottle = (x: number, y: number): number => {
      // two octaves of cheap value noise for subtle dust mottling
      const n1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const n2 = Math.sin(x * 31.144 + y * 47.912) * 12543.123;
      const f1 = n1 - Math.floor(n1);
      const f2 = n2 - Math.floor(n2);
      return 0.82 + 0.18 * (0.6 * f1 + 0.4 * f2);
    };
    for (let y = 0; y < 256; y++) {
      const lat = y / 256 - 0.5;
      const glow = Math.exp(-(lat * lat) / (2 * SIGMA * SIGMA));
      for (let x = 0; x < 512; x++) {
        const m = mottle(x / 512, y / 256);
        const v = Math.min(1, glow * m * PEAK);
        const i = (y * 512 + x) * 4;
        bandImg.data[i] = Math.round(255 * v);
        bandImg.data[i + 1] = Math.round(245 * v);
        bandImg.data[i + 2] = Math.round(232 * v);
        bandImg.data[i + 3] = Math.round(255 * v); // opaque; alpha via luminance
      }
    }
    bandCtx.putImageData(bandImg, 0, 0);
    const bandTexture = new THREE.CanvasTexture(bandCanvas);
    bandTexture.wrapS = THREE.ClampToEdgeWrapping;
    bandTexture.wrapT = THREE.ClampToEdgeWrapping;

    // A spherical cap around the galactic plane (unit sphere; scaled with
    // the shell). Unlike a flat plane it is visible from every direction
    // and never disappears edge-on, and it shows the band as a full
    // 360° great circle like the real galaxy.
    const band = new THREE.MeshBasicMaterial({
      map: bandTexture,
      transparent: true,
      // Peaks around 0.55 in the band core — bright enough to read as a
      // glow, dim enough to stay out of the bloom threshold.
      color: new THREE.Color(1.7, 1.7, 1.7),
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 32, 0, Math.PI * 2, Math.PI * 0.18, Math.PI * 0.64),
      band
    );
    cap.frustumCulled = false;
    // Fixed world orientation — the band stays put in the sky as the
    // camera rotates; only its position follows the camera.
    cap.rotation.set(0.55, 0.85, 0.45);
    this.milkyWay = cap;
    this.group.add(cap);

    scene.add(this.group);
  }

  /**
   * Center the shell on the camera and rescale when the far plane or the
   * camera's parent scale changes (view ↔ true-scale mode, focus changes).
   *
   * `camera` is the driven camera (fakeCamera — parentless, so its world
   * matrix is stale); `renderCamera` is the actual render camera, which
   * lives as a child of the focused body's mesh in orbit mode. The render
   * camera's view space is scaled by that mesh's scale, so shell distances
   * and sprite sizes are expressed in VIEW units (a fixed fraction of the
   * far plane) and converted to world units via the mesh's world scale —
   * this keeps the stars' apparent size and position identical in both
   * scale modes and inside the frustum in all cases.
   */
  update(
    camera: THREE.PerspectiveCamera,
    renderCamera: THREE.PerspectiveCamera,
    timeMs: number,
    pixelRatio: number
  ): void {
    const worldPos = new THREE.Vector3();
    camera.getWorldPosition(worldPos);
    this.group.position.copy(worldPos);

    // Uniform scale of the render camera's world matrix (parent mesh scale;
    // 1 in free-roam, where the camera is detached to the scene root).
    renderCamera.updateWorldMatrix(true, false);
    const camScale = new THREE.Vector3().setFromMatrixScale(
      renderCamera.matrixWorld
    );
    const cameraScale = (camScale.x + camScale.y + camScale.z) / 3 || 1;

    const viewRadius = camera.far * 0.85;
    const key = `${camera.far}|${cameraScale.toFixed(4)}`;
    if (key !== this.currentKey) {
      this.currentKey = key;
      const worldRadius = viewRadius * cameraScale;
      // Star shell radius (world units) — the geometry is a unit sphere.
      this.stars.scale.setScalar(worldRadius);
      // Sprite sizes in view units: fixed fraction of the shell radius.
      this.material.uniforms.uStarScale.value = viewRadius * 1.15;
      // Milky Way cap at the same shell radius (unit-sphere geometry).
      this.milkyWay.scale.setScalar(worldRadius);
    }

    this.material.uniforms.uTime.value = timeMs / 1000;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    this.group.visible = true;
  }
}

export const createStarfield = (scene: THREE.Scene): Starfield => {
  return new Starfield(scene);
};
