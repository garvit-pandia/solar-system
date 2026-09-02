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
  /** Scene used to raycast the zoom baseline (the nearest body ahead). */
  scene: THREE.Scene;
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
  private readonly scene: THREE.Scene;
  private readonly getZoomLimits: () => { min: number; max: number };

  private yaw = 0;
  private pitch = 0;
  /**
   * Zoom state = the camera's CURRENT distance to what's ahead (world
   * units, re-probed on every wheel event). A smaller value means closer.
   */
  private zoom = 30;
  private zoomTarget = 30;
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");

  /** Raycast probe for the wheel-zoom baseline (zero per-frame allocs). */
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndcCenter = new THREE.Vector2(0, 0);

  private dragging = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;

  constructor(options: FreeCameraOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.scene = options.scene;
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
    this.zoom = this.zoomTarget = this.probeDistance();
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
    const factor = e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    // Zoom state IS the distance to what's ahead — re-probe on EVERY event
    // so each step is exactly 25% of the CURRENT distance. A baseline
    // captured once at entry goes stale the moment the camera dollies or the
    // view turns: steps then grow with the stale scalar (zoom-in accelerates
    // into a dive, zoom-out rockets away) — the "glitching" wheel.
    const baseline = this.probeDistance();
    this.zoom = baseline;
    const next = baseline * factor;
    const limits = this.getZoomLimits();
    const inside = baseline >= limits.min && baseline <= limits.max;
    // Direction-aware limits: only the bound the step moves TOWARD may
    // clamp. Clamping the whole target range would dead-end zoom-IN at the
    // max limit (next > max → clamped back to max → zero dolly) and zoom-out
    // at the min. Outside the range (camera entered beyond a limit) nothing
    // clamps until it re-enters — free dolly back into range.
    let target = next;
    if (inside) {
      target =
        next < baseline
          ? Math.max(next, limits.min)
          : Math.min(next, limits.max);
    }
    this.zoomTarget = target;
  };

  /**
   * Distance from the camera to the nearest celestial body along the view
   * axis (world units). In open space (nothing ahead), the camera's distance
   * from the scene origin stands in so dolly stays proportional.
   *
   * Only bodies count (userData.body chain) — belts, the starfield shell and
   * orbit paths never become zoom anchors.
   */
  private probeDistance = (): number => {
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (object.userData.body) return Math.max(hit.distance, 1e-6);
        object = object.parent;
      }
    }
    return Math.max(this.camera.position.length(), 1e-6);
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
      // Zoom = distance to what's ahead: a shrinking zoom moves FORWARD
      // (toward it), a growing one moves back. translateZ is local, so the
      // dolly always follows the current view axis.
      this.camera.translateZ(delta);
    }
  };
}
