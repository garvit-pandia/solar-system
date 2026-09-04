import * as THREE from "three";

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_SPEED = 5;
const BOOST_MULTIPLIER = 10;
const SPEED_STEP = 1.25;
/** Velocity smoothing — accel/decel rate (per second). */
const ACCELERATION = 9;
/** World-space up vector (Space/C motion stays vertical while flying). */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface FreeRoamOptions {
  /** Camera driven by the controller (a scene-root child while active). */
  camera: THREE.PerspectiveCamera;
  /** Canvas that receives mouse-look and scroll input. */
  canvas: HTMLElement;
  /**
   * World-scale multiplier for the base speed — keeps free-roam feel
   * proportional in both view mode (scale 1) and true-scale mode.
   */
  getWorldScale: () => number;
  /** Called after the controller has fully detached itself. */
  onEnter?: () => void;
  /** Called when the user exits (Esc or the button) so the app can restore orbit mode. */
  onExit?: () => void;
}

/**
 * Free-roaming first-person flight mode (click-to-capture model).
 *
 * Enters UNLOCKED: drag-to-look fallback keeps the toolbar clickable.
 * Clicking the canvas requests pointer lock → LOCKED (unbounded deltas).
 * Browser Esc exits the lock back to UNLOCKED (never exits flight);
 * explicit Esc-while-unlocked or the flight button exits.
 *
 * WASD movement with velocity smoothing (accel/decel), Space/C vertical,
 * Shift boost, scroll adjusts flight speed. The camera is driven directly
 * (position + quaternion); the main loop's `camera.copy(fakeCamera)` keeps
 * the render camera in sync.
 */
export class FreeRoam {
  active = false;
  locked = false;

  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLElement;
  private getWorldScale: () => number;
  private onEnter?: () => void;
  private onExit?: () => void;

  private yaw = 0;
  private pitch = 0;
  private speedMultiplier = 1;
  private keys = new Set<string>();
  private euler = new THREE.Euler(0, 0, 0, "YXZ");

  // Velocity smoothing state (world-space velocity, no per-frame allocs).
  private readonly velocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly targetWorldVelocity = new THREE.Vector3();

  // Click-to-capture look state (drag fallback while unlocked).
  private dragging = false;
  private dragPointerId = -1;
  private lastDragX = 0;
  private lastDragY = 0;

  constructor(options: FreeRoamOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.getWorldScale = options.getWorldScale;
    this.onEnter = options.onEnter;
    this.onExit = options.onExit;
  }

  enter = (): void => {
    if (this.active) return;
    this.active = true;

    // Resume the look direction the user had when they last exited free
    // roam (the camera is a scene-root child while flying, so its local
    // quaternion IS the world orientation). Falls back to 0,0 on first use.
    this.euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    this.yaw = this.euler.y;
    this.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, this.euler.x)
    );
    this.speedMultiplier = 1;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.dragging = false;
    this.dragPointerId = -1;
    this.locked = false;
    document.body.classList.remove("fps-locked");

    this.onEnter?.();
  };

  exit = (): void => {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.dragging = false;
    this.dragPointerId = -1;
    if (this.locked && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* stay unlocked */
      }
    }
    this.locked = false;
    document.body.classList.remove("fps-locked");
    this.onExit?.();
  };

  private applyLook(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.active) return;
    if (this.locked) {
      // Locked: unbounded deltas drive the view.
      this.applyLook(e.movementX, e.movementY);
      return;
    }
    if (this.dragging) {
      // Unlocked drag fallback: held primary button drags the view.
      this.applyLook(e.clientX - this.lastDragX, e.clientY - this.lastDragY);
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    }
    // Otherwise passive hover never rotates the view (toolbar clickable).
  };

  private onCanvasClick = (): void => {
    if (!this.active || this.locked) return;
    if (document.pointerLockElement === this.canvas) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown as
        | Promise<void>
        | undefined;
      if (result instanceof Promise) result.catch(() => { /* stay unlocked */ });
    } catch {
      /* stay unlocked */
    }
  };

  private onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    document.body.classList.toggle("fps-locked", this.locked);
  };

  private onPointerLockError = (): void => {
    // Never trap: lock failures leave flight unlocked with drag fallback.
    this.locked = false;
    document.body.classList.remove("fps-locked");
  };

  private onPointerDown = (e: MouseEvent): void => {
    if (!this.active || this.locked || this.dragPointerId !== -1) return;
    if (e.button !== 0) return;
    this.dragging = true;
    this.dragPointerId = 0;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    this.dragPointerId = -1;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (e.code === "Escape") {
      // A locked Esc is consumed by the browser (pointer lock exits via
      // pointerlockchange); only an unlocked Esc exits flight.
      if (!this.locked) this.exit();
      return;
    }
    this.keys.add(e.code);
    // Stop the page/buttons from reacting to game keys while flying
    // (Space would otherwise "press" whatever button has focus).
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code
      )
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.dragging = false;
    this.dragPointerId = -1;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.active) return;
    e.preventDefault();
    this.speedMultiplier *= e.deltaY > 0 ? 1 / SPEED_STEP : SPEED_STEP;
    this.speedMultiplier = Math.min(4096, Math.max(1 / 4096, this.speedMultiplier));
  };

  /** Attach input listeners. Called once at startup; listeners self-gate. */
  attach = (): void => {
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("click", this.onCanvasClick);
    this.canvas.addEventListener("mousedown", this.onPointerDown);
    this.canvas.addEventListener("mouseup", this.onPointerUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  };

  /** Current flight speed in world units/second (for the HUD). */
  getSpeed = (): number => {
    const boost = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? BOOST_MULTIPLIER : 1;
    return BASE_SPEED * this.getWorldScale() * this.speedMultiplier * boost;
  };

  /**
   * Advance the camera by one frame. dt is the clamped simulation delta.
   */
  update = (dt: number): void => {
    if (!this.active) return;

    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    // Build the target velocity from the held keys (normalised so diagonal
    // flight is not faster), then smooth toward it — accel/decel instead of
    // instant start/stop.
    let ix = 0;
    let iy = 0;
    let iz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    if (this.keys.has("Space")) iy += 1;
    if (this.keys.has("KeyC")) iy -= 1;

    const speed = this.getSpeed();
    const inputLen = Math.hypot(ix, iy, iz);
    if (inputLen > 0) {
      this.targetVelocity.set(ix / inputLen, iy / inputLen, iz / inputLen);
    } else {
      this.targetVelocity.set(0, 0, 0);
    }
    // W/A/S/D move in the camera frame (yaw AND pitch, as before), Space/C
    // stay world-vertical. Smooth toward the target — accel/decel flight.
    this.targetWorldVelocity
      .set(this.targetVelocity.x, 0, this.targetVelocity.z)
      .applyQuaternion(this.camera.quaternion)
      .addScaledVector(WORLD_UP, this.targetVelocity.y)
      .multiplyScalar(speed);

    this.velocity.lerp(this.targetWorldVelocity, Math.min(1, dt * ACCELERATION));
    this.camera.position.addScaledVector(this.velocity, dt);
  };
}
