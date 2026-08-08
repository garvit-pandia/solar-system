import * as THREE from "three";

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const LOOK_SENSITIVITY = 0.0022;
const ZOOM_STEP = 1.25;
/** Zoom lerp rate — wheel zoom eases instead of stepping. */
const ZOOM_SMOOTH = 10;

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export interface FreeCameraOptions {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  /** Zoom range in world units (mode-aware — called per wheel event). */
  getZoomLimits: () => { min: number; max: number };
}

/**
 * The "third mode" — a detached free camera.
 *
 * After exiting free roam the camera stays EXACTLY where it is (scene-root
 * child, same pose — nothing is re-parented or re-aimed). This controller
 * is then the idle interaction: drag to look around (same sensitivity as
 * free-roam flight), wheel to dolly along the view axis. Clicking a planet
 * (or search / prev / next / tour) hands control back to the focused orbit
 * mode; re-entering free roam continues from the same pose seamlessly.
 *
 * No OrbitControls here — no pivot point, so nothing can yank the camera.
 * Zero per-frame allocations.
 */
export class FreeCamera {
  active = false;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLElement;
  private readonly getZoomLimits: () => { min: number; max: number };

  private yaw = 0;
  private pitch = 0;
  private zoom = 30;
  private zoomTarget = 30;
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");

  private dragging = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;

  constructor(options: FreeCameraOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.getZoomLimits = options.getZoomLimits;
  }

  /** Take over from the camera's current pose (called on free-roam exit). */
  enter = (): void => {
    if (this.active) return;
    this.active = true;
    this.euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = this.euler.y;
    this.pitch = clamp(this.euler.x, -PITCH_LIMIT, PITCH_LIMIT);
    // The wheel-zoom state must reflect where the camera ACTUALLY is — after
    // a free-roam flight it can be anywhere (0.3 units from a planet's
    // surface, or thousands of units out in the void). Deriving the baseline
    // from the current distance keeps every wheel step a proportional ~25%
    // of that distance: zooming never dead-ends at a limit and never
    // tunnels through a nearby body.
    this.zoom = this.zoomTarget = Math.max(this.camera.position.length(), 1e-6);
  };

  exit = (): void => {
    this.active = false;
    this.dragging = false;
    this.pointerId = -1;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.active) return;
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active || !this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw -= dx * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch - dy * LOOK_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = -1;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.active) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    const limits = this.getZoomLimits();
    const next = this.zoomTarget * factor;
    // Enforce the limits only while the zoom state already sits inside them.
    // If the camera entered the mode beyond a limit (e.g. flown past
    // maxDistance), the first wheel events move freely until it re-enters
    // the range — clamping there would dead-end zooming in (target pinned at
    // max, zero dolly) or fire a giant one-shot dolly back into the range.
    const inside = this.zoomTarget >= limits.min && this.zoomTarget <= limits.max;
    this.zoomTarget = inside ? clamp(next, limits.min, limits.max) : next;
  };

  /** Attach input listeners. Called once at startup; listeners self-gate. */
  attach = (): void => {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  };

  /**
   * Apply the look direction and the (smoothed) dolly motion.
   */
  update = (dt: number): void => {
    if (!this.active) return;

    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    const prevZoom = this.zoom;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * ZOOM_SMOOTH);
    const delta = this.zoom - prevZoom;
    if (Math.abs(delta) > 1e-6) {
      // Dolly along the view axis: +zoom moves forward (wheel up = zoom in).
      this.camera.translateZ(-delta);
    }
  };
}
