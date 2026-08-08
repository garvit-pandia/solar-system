import * as THREE from "three";

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_SPEED = 5;
const BOOST_MULTIPLIER = 10;
const SPEED_STEP = 1.25;

export interface FreeRoamOptions {
  /** Camera driven by the controller (a scene-root child while active). */
  camera: THREE.PerspectiveCamera;
  /** Canvas that requests pointer lock. */
  canvas: HTMLElement;
  /**
   * World-scale multiplier for the base speed — keeps free-roam feel
   * proportional in both view mode (scale 1) and true-scale mode.
   */
  getWorldScale: () => number;
  /** Called after the controller has fully detached itself. */
  onEnter?: () => void;
  /** Called when the user exits (Esc) so the app can restore orbit mode. */
  onExit?: () => void;
}

/**
 * Free-roaming first-person flight mode.
 *
 * Pointer-lock mouse look + WASD movement, Space/C for vertical motion,
 * Shift to boost. Scroll adjusts the flight speed while active. The camera
 * is driven directly (position + quaternion); the main loop's
 * `camera.copy(fakeCamera)` keeps the render camera in sync.
 */
export class FreeRoam {
  active = false;

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

    this.onEnter?.();

    // In browsers that return a promise (Chrome 87+), a denied request must
    // be caught — e.g. automation or iframe contexts without a user gesture.
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          /* pointer lock unavailable — fly with keyboard only */
        });
      }
    } catch {
      /* older browsers throw synchronously when lock is impossible */
    }
  };

  exit = (): void => {
    if (!this.active) return;
    this.active = false;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }

    this.keys.clear();
    this.onExit?.();
  };

  private onPointerLockChange = (): void => {
    if (this.active && document.pointerLockElement !== this.canvas) {
      this.exit();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.active || document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return;
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
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.active) return;
    e.preventDefault();
    this.speedMultiplier *= e.deltaY > 0 ? 1 / SPEED_STEP : SPEED_STEP;
    this.speedMultiplier = Math.min(4096, Math.max(1 / 4096, this.speedMultiplier));
  };

  /** Attach input listeners. Called once at startup; listeners self-gate. */
  attach = (): void => {
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
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

    const speed = this.getSpeed() * dt;

    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) {
      this.camera.translateZ(-speed);
    }
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) {
      this.camera.translateZ(speed);
    }
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) {
      this.camera.translateX(-speed);
    }
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) {
      this.camera.translateX(speed);
    }
    // Vertical motion is world-space (up/down), so flying over the orbital
    // plane feels natural.
    if (this.keys.has("Space")) {
      this.camera.position.y += speed;
    }
    if (this.keys.has("KeyC")) {
      this.camera.position.y -= speed;
    }
  };
}
