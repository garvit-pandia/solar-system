import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import type { SolarSystem } from "./solar-system";
import type { InfoPanel } from "./info-panel";

/** Bodies visited by the tour, in order. */
export const TOUR_SEQUENCE: string[] = [
  "Sun",
  "Mercury",
  "Venus",
  "Earth",
  "Moon",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
];

const FLIGHT_MS = 2200;
const DWELL_MS = 2500;

export interface CinematicTourOptions {
  camera: THREE.PerspectiveCamera;
  fakeCamera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  solarSystem: SolarSystem;
  changeFocus: (oldFocus: string, newFocus: string) => void;
  infoPanel: InfoPanel;
  getCurrentFocus: () => string;
}

/**
 * Cinematic auto-tour: flies the fakeCamera along quadratic bezier arcs
 * between bodies, snapping into a focused orbit at each arrival.
 *
 * The tour drives the fakeCamera only — the main tick loop copies it into
 * the real camera every frame. The real `camera` is accepted in the options
 * for API completeness but is never touched here.
 */
export class CinematicTour {
  private readonly fakeCamera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly solarSystem: SolarSystem;
  private readonly changeFocus: (oldFocus: string, newFocus: string) => void;
  private readonly infoPanel: InfoPanel;
  private readonly getCurrentFocus: () => string;

  private running = false;
  private rafId = 0;
  private timeoutId = 0;
  private hasArrived = false;
  private savedMinDistance = 0;
  private savedMaxDistance = 0;

  constructor(options: CinematicTourOptions) {
    this.fakeCamera = options.fakeCamera;
    this.controls = options.controls;
    this.solarSystem = options.solarSystem;
    this.changeFocus = options.changeFocus;
    this.infoPanel = options.infoPanel;
    this.getCurrentFocus = options.getCurrentFocus;

    // Esc aborts the tour (ignore while typing in form fields).
    document.addEventListener("keydown", this.onKeyDown);
    // Any user interaction during the tour aborts it (capture phase).
    document.addEventListener("pointerdown", this.onPointerDown, true);
  }
  start(): void {
    if (this.running) return;

    this.running = true;
    this.hasArrived = false;

    this.controls.enabled = false;

    // Save the pre-tour limits so a mid-flight stop can restore them.
    this.savedMinDistance = this.controls.minDistance;
    this.savedMaxDistance = this.controls.maxDistance;
    // Widen the limits so controls.update() (which clamps every frame,
    // even while disabled) never fights the flight path.
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 500;

    this.infoPanel.close();

    this.flyTo(0);
  }

  stop(): void {
    const wasRunning = this.running;

    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timeoutId !== 0) {
      clearTimeout(this.timeoutId);
      this.timeoutId = 0;
    }

    // Only restore the saved limits if no arrival has happened yet — once a
    // body has been reached, changeFocus already set the correct per-body
    // limits for the current focus, and the saved pre-tour values are stale.
    if (wasRunning && !this.hasArrived) {
      this.controls.minDistance = this.savedMinDistance;
      this.controls.maxDistance = this.savedMaxDistance;
    }

    this.controls.enabled = true;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private onPointerDown = (): void => {
    if (this.running) this.stop();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target.isContentEditable) return;
    }
    if (this.running) this.stop();
  };

  private flyTo(index: number): void {
    if (!this.running) return;
    if (index >= TOUR_SEQUENCE.length) {
      this.finish();
      return;
    }

    const targetName = TOUR_SEQUENCE[index];
    const target = this.solarSystem[targetName];

    // P0: current camera world position.
    const p0 = new THREE.Vector3();
    this.fakeCamera.getWorldPosition(p0);

    // T: target body world position (also the orbit-centre lerp destination).
    const targetWorldPos = new THREE.Vector3();
    target.mesh.getWorldPosition(targetWorldPos);

    // P2: arrival point, offset from the body at a comfortable viewing
    // distance derived from the body's minimum orbit distance.
    const minDistance = target.getMinDistance();
    const p2 = targetWorldPos
      .clone()
      .add(new THREE.Vector3(minDistance * 2.4, minDistance * 0.8, 0));

    // P1: control point — midpoint of P0/P2, lifted on Y by 40% of the
    // P0→P2 distance for a gentle arc over the orbital plane.
    const p1 = p0.clone().add(p2).multiplyScalar(0.5);
    p1.y += p0.distanceTo(p2) * 0.4;

    const startTime = performance.now();

    const frame = (now: number): void => {
      if (!this.running) return;

      const progress = Math.min((now - startTime) / FLIGHT_MS, 1);
      const eased = progress * progress * (3 - 2 * progress); // smoothstep

      // Quadratic bezier B(e) = (1-e)^2·P0 + 2(1-e)e·P1 + e^2·P2.
      const position = new THREE.Vector3()
        .copy(p0)
        .multiplyScalar((1 - eased) * (1 - eased))
        .addScaledVector(p1, 2 * (1 - eased) * eased)
        .addScaledVector(p2, eased * eased);
      this.fakeCamera.position.copy(position);

      // Drift the orbit centre toward the body as we approach it.
      this.controls.target.lerp(targetWorldPos, 0.06);

      if (progress >= 1) {
        this.arrive(targetName, index);
      } else {
        this.rafId = requestAnimationFrame(frame);
      }
    };

    this.rafId = requestAnimationFrame(frame);
  }

  private arrive(targetName: string, index: number): void {
    // Snaps the camera into the focused orbit and restores the per-body
    // min/max distance limits (changeFocus does both itself).
    this.changeFocus(this.getCurrentFocus(), targetName);
    this.hasArrived = true;

    this.infoPanel.open(this.solarSystem[targetName].mesh.userData.body);

    // Dwell, then move on.
    this.timeoutId = window.setTimeout(() => {
      this.timeoutId = 0;
      this.flyTo(index + 1);
    }, DWELL_MS);
  }

  private finish(): void {
    this.rafId = 0;
    this.timeoutId = 0;
    this.controls.enabled = true;
    this.running = false;
  }
}
