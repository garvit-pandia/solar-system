import GUI from "lil-gui";
import { SolarSystem } from "./solar-system";
import { InstancedBelt } from "./asteroid-belt";
import { LAYERS } from "../constants";
import * as THREE from "three";

/** Ambient intensity in "day" mode (toolbar toggle on). */
export const AMBIENT_BRIGHT = 0.45;
/** Ambient intensity in "night" mode (toolbar toggle off). */
export const AMBIENT_DIM = 0.06;

export const options = {
  // Display toggles (toolbar)
  showPlanetPaths: true,
  showMoonPaths: true,
  showLabels: true,
  ambientOn: true,
  // Ambient intensity target (0–1); the tick loop lerps the light toward it.
  ambient: AMBIENT_BRIGHT,
  // Simulation controls (GUI panel)
  showMoons: true,
  focus: "Sun",
  clock: true,
  speed: 0.125,
  reverse: false,
  speedPreset: "×0.125",
  trueScale: false,
  showBelt: false,
  showKuiper: false,
  zangle: 0,
  yangle: 0,
};

/** Remembered day-mode level, so the toolbar toggle returns to the user's
 *  last slider position instead of a hardcoded value. */
let ambientDayLevel = AMBIENT_BRIGHT;

const SPEED_PRESETS: Record<string, number> = {
  "×0.125": 0.125,
  "×1": 1,
  "×10": 10,
  "×100": 100,
};

/**
 * Apply the current orbit-ring visibility to every body's path.
 *
 * Rings are grouped by what the body orbits: planets and dwarf planets
 * orbit the Sun (one toggle), moons orbit their host body (another toggle).
 * Rings (e.g. Saturn's) are skipped — they have no orbit path.
 */
export const applyPathVisibility = (solarSystem: SolarSystem): void => {
  for (const name in solarSystem) {
    const object = solarSystem[name];
    if (!object.path) continue;
    const isPlanetPath = object.orbits === "Sun";
    object.path.visible = isPlanetPath
      ? options.showPlanetPaths
      : options.showMoonPaths;
  }
};

/** Reflect the current option state on the toolbar toggle buttons. */
export const syncToolbar = (): void => {
  const setPressed = (id: string, on: boolean) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("aria-pressed", String(on));
    el.classList.toggle("is-active", on);
  };
  setPressed("btn-planet-paths", options.showPlanetPaths);
  setPressed("btn-moon-paths", options.showMoonPaths);
  setPressed("btn-ambient", options.ambientOn);
  setPressed("btn-labels", options.showLabels);
};

export const createGUI = (
  solarSystem: SolarSystem,
  clock: THREE.Clock,
  camera: THREE.Camera,
  belt: InstancedBelt | null,
  kuiperBelt: InstancedBelt | null,
  onTrueScale: (value: boolean) => void
) => {
  const gui = new GUI();

  gui.title("Simulation Controls");

  // Note: ambient has BOTH a fine-grained slider here AND a quick day/night
  // toggle in the toolbar. They share one value (options.ambient); the
  // slider is the fine control, the button is the preset.
  gui
    .add(options, "ambient", 0, 1, 0.01)
    .name("Ambient Intensity")
    .onChange((value: number) => {
      ambientDayLevel = value;
      options.ambientOn = value > 0.1;
      syncToolbar();
    });

  // Toggle moons
  gui
    .add(options, "showMoons")
    .name("Show Moons")
    .onChange((value: boolean) => {
      for (const name in solarSystem) {
        const object = solarSystem[name];
        if (object.type === "moon") {
          object.mesh.visible = value;
        }
      }
    });

  // Pause the simulation
  gui
    .add(options, "clock")
    .name("Run")
    .onChange((value: boolean) => {
      value ? clock.start() : clock.stop();
    });

  // Time presets
  gui
    .add(options, "speedPreset", Object.keys(SPEED_PRESETS))
    .name("Speed Preset")
    .onChange((preset: string) => {
      const magnitude = SPEED_PRESETS[preset] ?? 0.125;
      options.speed = options.reverse ? -magnitude : magnitude;
    });

  // Reverse time
  gui
    .add(options, "reverse")
    .name("Reverse Time")
    .onChange((reverse: boolean) => {
      options.speed = Math.abs(options.speed) * (reverse ? -1 : 1);
    });

  // Fine-grained simulation speed
  gui.add(options, "speed", 0.05, 200, 0.05).name("Speed");

  // True scale mode
  gui
    .add(options, "trueScale")
    .name("True Scale")
    .onChange((value: boolean) => onTrueScale(value));

  // Asteroid belt
  if (belt) {
    gui
      .add(options, "showBelt")
      .name("Asteroid Belt")
      .onChange((value: boolean) => {
        belt.mesh.visible = value;
      });
  }

  // Kuiper belt
  if (kuiperBelt) {
    gui
      .add(options, "showKuiper")
      .name("Kuiper Belt")
      .onChange((value: boolean) => {
        kuiperBelt.mesh.visible = value;
      });
  }

  gui.hide();

  // --- Toolbar wiring -------------------------------------------------

  // Orbit rings of the planets & dwarf planets around the Sun
  document.getElementById("btn-planet-paths")?.addEventListener("click", () => {
    options.showPlanetPaths = !options.showPlanetPaths;
    applyPathVisibility(solarSystem);
    syncToolbar();
  });

  // Orbit rings of the moons around their host planets
  document.getElementById("btn-moon-paths")?.addEventListener("click", () => {
    options.showMoonPaths = !options.showMoonPaths;
    applyPathVisibility(solarSystem);
    syncToolbar();
  });

  // Ambient day/night toggle (toolbar). The actual intensity animates
  // smoothly in the main loop's tick toward options.ambient.
  document.getElementById("btn-ambient")?.addEventListener("click", () => {
    if (options.ambientOn) {
      // → night: dim to the night level
      options.ambient = AMBIENT_DIM;
      options.ambientOn = false;
    } else {
      // → day: back to the user's last day level (slider position)
      options.ambient = ambientDayLevel;
      options.ambientOn = true;
    }
    syncToolbar();
  });

  // Points of interest. The camera passed in is the fakeCamera — toggling
  // it propagates to the render camera via the per-frame copy() (which
  // copies layers). Toggling the render camera alone would be overwritten.
  document.getElementById("btn-labels")?.addEventListener("click", () => {
    options.showLabels = !options.showLabels;
    camera.layers.toggle(LAYERS.POILabel);
    syncToolbar();
  });

  // Toggle GUI panel
  document.getElementById("btn-settings")?.addEventListener("click", () => {
    gui.show(gui._hidden);
  });

  applyPathVisibility(solarSystem);
  syncToolbar();
};
