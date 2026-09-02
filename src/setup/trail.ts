import * as THREE from "three";
import type { PlanetaryObject } from "./planetary-object";
import type { SolarSystem } from "./solar-system";

const TRAIL_POINTS = 160;
/** Record a new point only after the body moved at least this fraction of
 * its own orbit radius — at slow speeds the tail then reads as a bright dot
 * with a stub, instead of a baked-in frozen curve. */
const MIN_STEP_FRACTION = 0.0035;
/** A jump bigger than this fraction of the orbit radius means the world
 * changed under us (true-scale snap, focus jump of the parent) — restart
 * the trail instead of drawing a streak across the map. */
const JUMP_FRACTION = 0.18;
/** Head/tail fade exponent — the tail falls off faster than linearly. */
const FADE_POW = 1.6;
const OPACITY = 0.55;

/** Cool comet-tint, matches the deep-space palette without clashing with
 * the amber UI accent. */
const BASE_COLOR = new THREE.Color(0.62, 0.72, 1.0);

interface TrailEntry {
  line: THREE.Line;
  geometry: THREE.BufferGeometry;
  /** Ring buffer of recorded world positions (TRAIL_POINTS × 3). */
  ring: Float32Array;
  /** Ordered draw buffer (oldest → newest) uploaded to the GPU. */
  positions: Float32Array;
  colors: Float32Array;
  /** Newest point index within the ring buffer. */
  head: number;
  /** Points currently in the buffer. */
  count: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  body: PlanetaryObject;
}

/**
 * Fading comet-tail trails for every Sun-orbiting body (planets, dwarfs).
 *
 * One `Line` per body in WORLD space: a fixed-length ring buffer of recent
 * positions, rewritten each update into an ordered vertex buffer with a
 * black-faded colour ramp (additive blending makes black = invisible, so
 * no per-vertex alpha is needed). Zero per-frame allocations — every buffer
 * is preallocated and mutated in place.
 */
export class MotionTrails {
  private readonly entries: TrailEntry[] = [];
  private readonly scratch = new THREE.Vector3();
  private readonly getWorldScale: (name: string) => number;
  private enabled = true;

  constructor(solarSystem: SolarSystem, getWorldScale: (name: string) => number) {
    this.getWorldScale = getWorldScale;

    for (const name in solarSystem) {
      const body = solarSystem[name];
      // Trails are a heliocentric feature: planets and dwarf planets only
      // (moons would smear with their parent, rings have no orbit).
      if (body.orbits !== "Sun" || name === "Sun") continue;

      const positions = new Float32Array(TRAIL_POINTS * 3);
      const colors = new Float32Array(TRAIL_POINTS * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setDrawRange(0, 0);

      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      // Scenery rule — trails must never intercept raycasts/clicks.
      line.raycast = () => {};
      line.visible = this.enabled;

      this.entries.push({
        line,
        geometry,
        ring: new Float32Array(TRAIL_POINTS * 3),
        positions,
        colors,
        head: 0,
        count: 0,
        lastX: NaN,
        lastY: NaN,
        lastZ: NaN,
        body,
      });
    }
  }

  /** Attach every trail line to the scene (called once after construction). */
  attachTo(scene: THREE.Scene): void {
    for (const entry of this.entries) scene.add(entry.line);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    for (const entry of this.entries) entry.line.visible = enabled;
  }

  /** Drop all recorded history (mode switches, teleporting helpers). */
  clear(): void {
    for (const entry of this.entries) {
      entry.count = 0;
      entry.head = 0;
      entry.lastX = NaN;
    }
  }

  /** Per-frame record + draw-buffer refresh. */
  update(): void {
    for (const entry of this.entries) {
      const { body } = entry;
      body.mesh.getWorldPosition(this.scratch);
      const x = this.scratch.x;
      const y = this.scratch.y;
      const z = this.scratch.z;

      // Step threshold in world units, derived from the body's current
      // orbit radius (works in view AND true scale).
      const parentScale = this.getWorldScale(body.orbits ?? "Sun");
      const orbitWorld = body.activeDistance * parentScale;

      if (!Number.isNaN(entry.lastX)) {
        const dx = x - entry.lastX;
        const dy = y - entry.lastY;
        const dz = z - entry.lastZ;
        const distSq = dx * dx + dy * dy + dz * dz;
        const minStep = orbitWorld * MIN_STEP_FRACTION;
        if (distSq > (orbitWorld * JUMP_FRACTION) ** 2) {
          // World changed under us — restart the tail.
          entry.count = 0;
        } else if (distSq < minStep * minStep) {
          this.draw(entry);
          continue;
        }
      }

      entry.head = (entry.head + 1) % TRAIL_POINTS;
      const ringIndex = entry.head * 3;
      entry.ring[ringIndex] = x;
      entry.ring[ringIndex + 1] = y;
      entry.ring[ringIndex + 2] = z;
      if (entry.count < TRAIL_POINTS) entry.count++;
      entry.lastX = x;
      entry.lastY = y;
      entry.lastZ = z;

      this.draw(entry);
    }
  }

  /** Rewrite the ordered draw buffers from the ring (oldest → newest). */
  private draw(entry: TrailEntry): void {
    const n = entry.count;
    for (let i = 0; i < n; i++) {
      // i = 0 is the oldest point; walk backwards from head.
      const ringSlot = ((entry.head - (n - 1 - i)) % TRAIL_POINTS + TRAIL_POINTS) % TRAIL_POINTS;
      const src = ringSlot * 3;
      const dst = i * 3;
      entry.positions[dst] = entry.ring[src];
      entry.positions[dst + 1] = entry.ring[src + 1];
      entry.positions[dst + 2] = entry.ring[src + 2];

      // Fade: newest (i = n-1) at full base colour, oldest → black.
      const t = n > 1 ? i / (n - 1) : 1;
      const f = Math.pow(t, FADE_POW);
      entry.colors[dst] = BASE_COLOR.r * f;
      entry.colors[dst + 1] = BASE_COLOR.g * f;
      entry.colors[dst + 2] = BASE_COLOR.b * f;
    }
    entry.geometry.setDrawRange(0, n);
    (entry.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (entry.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
