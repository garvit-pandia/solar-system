import GUI from "lil-gui";
import { SolarSystem } from "./solar-system";
import { InstancedBelt } from "./asteroid-belt";
import { LAYERS } from "../constants";
import * as THREE from "three";

export const options = {
  showPaths: false,
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

const SPEED_PRESETS: Record<string, number> = {
  "×0.125": 0.125,
  "×1": 1,
  "×10": 10,
  "×100": 100,
};

export const createGUI = (
  ambientLight: THREE.AmbientLight,
  solarSystem: SolarSystem,
  clock: THREE.Clock,
  camera: THREE.Camera,
  belt: InstancedBelt | null,
  kuiperBelt: InstancedBelt | null,
  onTrueScale: (value: boolean) => void
) => {
  const gui = new GUI();

  gui.title("Simulation Controls");

  gui.add(ambientLight, "intensity", 0, 1, 0.01).name("Ambient Intensity");

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

  // Toggle ambient lights
  document.getElementById("btn-ambient")?.addEventListener("click", () => {
    ambientLight.intensity = ambientLight.intensity === 0.1 ? 0.5 : 0.1;
  });

  // Toggle labels
  document.getElementById("btn-labels")?.addEventListener("click", () => {
    camera.layers.toggle(LAYERS.POILabel);
  });

  // Toggle paths
  document.getElementById("btn-paths")?.addEventListener("click", () => {
    options.showPaths = !options.showPaths;

    for (const name in solarSystem) {
      const object = solarSystem[name];
      if (object.path) {
        object.path.visible = options.showPaths;
      }
    }
  });

  // Toggle GUI panel
  document.getElementById("btn-settings")?.addEventListener("click", () => {
    gui.show(gui._hidden);
  });
};
