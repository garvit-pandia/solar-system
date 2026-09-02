import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";

interface CinematicOptions {
  /** The bloom composer — re-rendered synchronously right before capture. */
  composer: EffectComposer;
  canvas: HTMLCanvasElement;
  /** Focused body name for the screenshot filename. */
  getFocus: () => string;
  /** Called after the cinematic class flips (used to update the help HUD). */
  onToggle?: (active: boolean) => void;
}

let toastTimer = 0;

/** Small bottom-centre feedback pill ("Screenshot saved", …). */
export const showToast = (message: string): void => {
  const el = document.getElementById("app-toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2400);
};

/**
 * Cinematic mode + one-click screenshot.
 *
 * Cinematic mode fades every DOM UI layer out (CSS on `body.cinematic`) and
 * slides in letterbox bars, leaving just the scene plus a minimal floating
 * capture chip. The screenshot re-renders through the bloom composer and
 * reads the framebuffer back *synchronously in the same task* — that is the
 * only moment the back buffer is valid without `preserveDrawingBuffer`.
 */
export class Cinematic {
  private readonly composer: EffectComposer;
  private readonly canvas: HTMLCanvasElement;
  private readonly getFocus: () => string;
  private readonly onToggle?: (active: boolean) => void;

  constructor(options: CinematicOptions) {
    this.composer = options.composer;
    this.canvas = options.canvas;
    this.getFocus = options.getFocus;
    this.onToggle = options.onToggle;

    document
      .getElementById("btn-cinematic")
      ?.addEventListener("click", this.toggle);
    document
      .getElementById("btn-screenshot")
      ?.addEventListener("click", this.capture);
    document
      .getElementById("btn-cinematic-exit")
      ?.addEventListener("click", this.toggle);

    window.addEventListener("keydown", (e) => {
      // Don't hijack typing (search palette, date picker inputs).
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "h") this.toggle();
      else if (key === "p") this.capture();
    });
  }

  get active(): boolean {
    return document.body.classList.contains("cinematic");
  }

  toggle = (): void => {
    const next = !this.active;
    document.body.classList.toggle("cinematic", next);
    const hud = document.getElementById("cinematic-hud");
    if (hud) hud.hidden = !next;
    const railBtn = document.getElementById("btn-cinematic");
    railBtn?.setAttribute("aria-pressed", String(next));
    railBtn?.classList.toggle("is-active", next);
    this.onToggle?.(next);
  };

  capture = (): void => {
    // Render + read the back buffer in ONE task — between tasks the browser
    // may swap/invalid the drawing buffer (no preserveDrawingBuffer).
    this.composer.render();
    const url = this.canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    const stamp = new Date()
      .toISOString()
      .replace(/[:]/g, "")
      .replace(/\..+$/, "")
      .replace("T", "-");
    anchor.download = `solar-system_${this.getFocus()}_${stamp}.png`;
    anchor.href = url;
    anchor.click();
    showToast("Screenshot saved");
  };
}
