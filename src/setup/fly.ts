import * as THREE from "three";

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_SPEED = 5;
const BOOST_MULTIPLIER = 10;
const SPEED_STEP = 1.25;
/** Velocity smoothing — accel/decel rate (per second). */
const ACCELERATION = 9;
/** Edge-look assist: how long the cursor must sit at the edge (ms). */
const EDGE_IDLE_MS = 140;
/** Edge-look assist: ramp-in duration for the drift (ms). */
const EDGE_RAMP_MS = 350;
/** Edge-look assist: max drift speed (rad/s). */
const EDGE_DRIFT_RATE = 0.8;
/** Distance from a viewport edge that counts as "at the edge" (px). The
 *  old 10px band was nearly impossible to hold — especially with the
 *  cursor hidden during flight. */
const EDGE_MARGIN = 26;
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
 * Free-roaming first-person flight mode.
 *
 * Mouse-look WITHOUT pointer lock: while the cursor is over the canvas,
 * moving the mouse rotates the view (movementX/Y deltas work unlocked) and
 * the cursor hides. Moving the cursor onto the toolbar restores a normal
 * cursor, so every button stays clickable mid-flight.
 *
 * Edge-look assist: when the cursor pins against a viewport edge (e.g. the
 * top of the screen) and the last mouse motion was pointing outward, the
 * view keeps drifting in that direction — you can keep "sliding up" past
 * the edge. Any real mouse delta or click cancels it instantly.
 *
 * WASD movement with velocity smoothing (accel/decel), Space/C vertical,
 * Shift boost, scroll adjusts flight speed. Esc exits. The camera is
 * driven directly (position + quaternion); the main loop's
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

  // Velocity smoothing state (world-space velocity, no per-frame allocs).
  private readonly velocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly targetWorldVelocity = new THREE.Vector3();

  // Edge-look assist state.
  private cursorX = 0;
  private cursorY = 0;
  private lastMoveTime = 0;
  private lastDirX = 0;
  private lastDirY = 0;
  private driftStartTime = 0;

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
    this.driftStartTime = 0;

    this.onEnter?.();
  };

  exit = (): void => {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.driftStartTime = 0;
    this.onExit?.();
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.cursorX = e.clientX;
    this.cursorY = e.clientY;
    // Only REAL motion re-arms the idle timer. While the cursor is clamped
    // against a screen edge, browsers keep delivering zero-delta mousemove
    // events — resetting the timer on those would mean the "cursor parked
    // at the edge" state is never reached and the assist never engages.
    if (e.movementX !== 0 || e.movementY !== 0) {
      this.lastMoveTime = performance.now();
      // Remember the direction of the last REAL mouse motion — used by the
      // edge-look assist to know which way the user was heading when the
      // cursor pinned against the screen edge.
      this.lastDirX = Math.sign(e.movementX);
      this.lastDirY = Math.sign(e.movementY);
    }
    this.driftStartTime = 0;
    if (!this.active) return;
    // Unlocked mouse-look: deltas work without pointer lock; the cursor
    // disappears over the canvas (CSS) but reappears over the toolbar,
    // keeping every button clickable during flight.
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (e.code === "Escape") {
      this.exit();
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
   * True when the cursor is parked within EDGE_MARGIN of a viewport edge,
   * the last mouse motion pointed outward toward that edge, no mouse event
   * has arrived for a while, and nothing interactive sits under the cursor.
   */
  private isEdgeStuck(now: number): boolean {
    if (now - this.lastMoveTime < EDGE_IDLE_MS) return false;
    const { innerWidth, innerHeight } = window;
    const atTop = this.cursorY <= EDGE_MARGIN && this.lastDirY < 0;
    const atBottom = this.cursorY >= innerHeight - EDGE_MARGIN && this.lastDirY > 0;
    const atLeft = this.cursorX <= EDGE_MARGIN && this.lastDirX < 0;
    const atRight = this.cursorX >= innerWidth - EDGE_MARGIN && this.lastDirX > 0;
    if (!atTop && !atBottom && !atLeft && !atRight) return false;
    // Block the drift only when the cursor rests on something
    // INTERACTIVE — buttons and panels along the edges (the tool rail,
    // caption pill, settings panel). Plain glass chrome over the scene
    // (e.g. the HUD chips) is pointer-events:none, so it never shows up
    // here and must not disable edge-look.
    const topEl = document.elementFromPoint(this.cursorX, this.cursorY);
    return (
      !!topEl &&
      !topEl.closest(
        "button, a, input, select, textarea, .toolbar, .caption, .lil-gui, #nav-palette, #info-panel, #help-panel, #quiz-card, #welcome-card"
      )
    );
  }

  /**
   * Edge-look assist: while the cursor is pinned against an edge, keep the
   * view drifting in the direction the user was moving — so "keep sliding
   * up" works even when the OS cursor cannot travel any further.
   */
  private updateEdgeDrift(dt: number, now: number): void {
    if (!this.isEdgeStuck(now)) {
      this.driftStartTime = 0;
      return;
    }
    if (this.driftStartTime === 0) this.driftStartTime = now;
    const ramp = Math.min(1, (now - this.driftStartTime) / EDGE_RAMP_MS);
    const rate = EDGE_DRIFT_RATE * ramp * dt;
    const { innerWidth, innerHeight } = window;
    if (this.cursorY <= EDGE_MARGIN && this.lastDirY < 0) {
      this.pitch -= this.lastDirY * rate; // look up
    } else if (this.cursorY >= innerHeight - EDGE_MARGIN && this.lastDirY > 0) {
      this.pitch -= this.lastDirY * rate; // look down
    }
    if (this.cursorX <= EDGE_MARGIN && this.lastDirX < 0) {
      this.yaw -= this.lastDirX * rate; // look left
    } else if (this.cursorX >= innerWidth - EDGE_MARGIN && this.lastDirX > 0) {
      this.yaw -= this.lastDirX * rate; // look right
    }
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  /**
   * Advance the camera by one frame. dt is the clamped simulation delta.
   */
  update = (dt: number): void => {
    if (!this.active) return;

    const now = performance.now();
    this.updateEdgeDrift(dt, now);

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
