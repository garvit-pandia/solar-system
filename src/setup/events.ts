import * as THREE from "three";
import {
  heliocentricSceneAU,
  daysSinceJ2000FromElapsed,
} from "./ephemeris";
import type { SolarSystem } from "./solar-system";

interface EventScannerOptions {
  solarSystem: SolarSystem;
  /** Current sim clock (elapsed units) — drives the ephemeris lookups. */
  getElapsed: () => number;
  /** "View" button: fly to the event's body (same as a palette select). */
  onSelect: (name: string) => void;
}

interface EventState {
  armed: boolean;
  lastShown: number;
}

const SCAN_INTERVAL = 500;
const COOLDOWN_MS = 90_000;
/** Thresholds in degrees (heliocentric or geocentric angular separations). */
const PAIR_ALIGNMENT = 2.5;
const CLUSTER_ALIGNMENT = 5;
const CLUSTER_MIN = 3;
const CONJUNCTION = 2.5;
const ECLIPSE = 1.2;
/** A separation must rise this far above the threshold before the same
 * event can fire again — no toast flapping while bodies drift. */
const HYSTERESIS = 1.5;

const KEPLERIAN = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
];

const angleDeg = (a: THREE.Vector3, b: THREE.Vector3): number =>
  (Math.acos(
    THREE.MathUtils.clamp(a.dot(b) / (a.length() * b.length()), -1, 1)
  ) *
    180) /
  Math.PI;

/**
 * "The sim notices things before you do."
 *
 * A throttled scan over the REAL planetary positions (Keplerian AU vectors
 * from ephemeris.ts — mode-independent, unlike the stylised scene scales)
 * that raises observatory events:
 *  - planetary alignments as seen from the Sun (pairs and 3+ clusters),
 *  - conjunctions as seen from Earth (two planets 2.5° apart in the sky),
 *  - solar & lunar eclipses (Moon crossing the Sun / Earth's shadow —
 *    approximate in stylised view mode where moon orbits are clamped,
 *    exact in true scale).
 *
 * Events fire once and re-arm only after the bodies separate again, with
 * a per-event real-time cooldown so flying to one never chains toasts.
 */
export class EventScanner {
  private readonly solarSystem: SolarSystem;
  private readonly getElapsed: () => number;
  private readonly onSelect: (name: string) => void;

  private readonly planets: { name: string; v: THREE.Vector3 }[] = KEPLERIAN.map(
    (name) => ({ name, v: new THREE.Vector3() })
  );
  private readonly states = new Map<string, EventState>();
  private lastScan = 0;
  private hideTimer = 0;
  private currentBody = "Earth";

  // Scratch (zero allocations in the scan path).
  private readonly earthV = new THREE.Vector3();
  private readonly moonV = new THREE.Vector3();
  private readonly relA = new THREE.Vector3();
  private readonly relB = new THREE.Vector3();

  constructor(options: EventScannerOptions) {
    this.solarSystem = options.solarSystem;
    this.getElapsed = options.getElapsed;
    this.onSelect = options.onSelect;

    document
      .getElementById("btn-event-view")
      ?.addEventListener("click", () => {
        this.hide();
        this.onSelect(this.currentBody);
      });
    document
      .getElementById("btn-event-close")
      ?.addEventListener("click", this.hide);
  }

  /** Called every frame from the tick — self-throttled to SCAN_INTERVAL. */
  update = (nowMs: number): void => {
    if (nowMs - this.lastScan < SCAN_INTERVAL) return;
    this.lastScan = nowMs;

    const days = daysSinceJ2000FromElapsed(this.getElapsed());
    for (const planet of this.planets) {
      heliocentricSceneAU(planet.name, days, planet.v);
    }

    this.scanAlignments();
    this.scanConjunctions();
    this.scanEclipses(nowMs);
  };

  /** Heliocentric alignments: pairs < 2.5°, clusters of 3+ within 5°. */
  private scanAlignments(): void {
    const n = this.planets.length;

    // Largest cluster: for each planet, how many others sit within 5°.
    let bestCluster = 0;
    let bestClusterName = "";
    // Tightest pair.
    let bestPair = Infinity;
    let bestPairA = "";
    let bestPairB = "";

    for (let i = 0; i < n; i++) {
      let cluster = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const sep = angleDeg(this.planets[i].v, this.planets[j].v);
        if (sep < CLUSTER_ALIGNMENT) cluster++;
        if (j > i && sep < bestPair) {
          bestPair = sep;
          bestPairA = this.planets[i].name;
          bestPairB = this.planets[j].name;
        }
      }
      if (cluster + 1 > bestCluster) {
        bestCluster = cluster + 1;
        bestClusterName = this.planets[i].name;
      }
    }

    if (bestCluster >= CLUSTER_MIN) {
      this.raise(
        `align-cluster-${bestClusterName}`,
        `${bestCluster}-planet alignment`,
        `${bestCluster} planets line up within ${CLUSTER_ALIGNMENT}° as seen from the Sun — fly to ${bestClusterName} and look back. Clusters look tight from the Sun because the planets share a thin orbital plane.`,
        0,
        1
      );
    } else if (bestPair < PAIR_ALIGNMENT) {
      this.raise(
        `align-${bestPairA}-${bestPairB}`,
        "Planetary alignment",
        `${bestPairA} and ${bestPairB} sit ${bestPair.toFixed(1)}° apart as seen from the Sun. Alignments look striking from the Sun because the planets orbit near one plane.`,
        bestPair,
        PAIR_ALIGNMENT
      );
    }
  }

  /** Geocentric conjunctions: two planets close together in Earth's sky. */
  private scanConjunctions(): void {
    const earth = this.planets.find((p) => p.name === "Earth");
    if (!earth) return;
    this.earthV.copy(earth.v);

    let best = Infinity;
    let bestA = "";
    let bestB = "";
    for (const a of this.planets) {
      if (a.name === "Earth") continue;
      this.relA.copy(a.v).sub(this.earthV);
      for (const b of this.planets) {
        if (b.name === "Earth" || b === a) continue;
        this.relB.copy(b.v).sub(this.earthV);
        const sep = angleDeg(this.relA, this.relB);
        if (sep < best) {
          best = sep;
          bestA = a.name;
          bestB = b.name;
        }
      }
    }
    if (best < CONJUNCTION) {
      this.raise(
        `conj-${bestA}-${bestB}`,
        "Conjunction",
        `${bestA} and ${bestB} pass within ${best.toFixed(1)}° of each other in Earth's sky. Conjunctions recur as the faster planet laps the slower one along Earth's line of sight.`,
        best,
        CONJUNCTION
      );
    }
  }

  /**
   * Eclipses: the Moon against the Sun / Earth's shadow. Uses world
   * positions — exact in true scale, approximate in stylised view mode
   * (moon orbit clamps), which the toast wording does not overclaim.
   */
  private scanEclipses(nowMs: number): void {
    const moon = this.solarSystem["Moon"];
    const earth = this.solarSystem["Earth"];
    if (!moon || !earth) return;

    moon.mesh.getWorldPosition(this.moonV);
    earth.mesh.getWorldPosition(this.earthV);
    const moonFromEarth = this.relA.copy(this.moonV).sub(this.earthV);
    // The Sun sits at the scene origin.
    const antiSolar = this.relB.copy(this.earthV); // away from the Sun
    const lunarSep = angleDeg(moonFromEarth, antiSolar);
    this.raise(
      "eclipse-lunar",
      "Lunar eclipse",
      "The Moon is entering Earth's shadow — watch it dim from Earth. It happens at full Moon when the Sun, Earth, and Moon line up.",
      lunarSep,
      ECLIPSE
    );

    const solarSep = 180 - lunarSep;
    this.raise(
      "eclipse-solar",
      "Solar eclipse",
      "The Moon crosses the Sun's face as seen from Earth. It happens at new Moon when the Moon lines up between the Sun and Earth.",
      solarSep,
      ECLIPSE
    );
  }

  /** Fire once; re-arm only after the geometry separates again. */
  private raise(
    key: string,
    title: string,
    body: string,
    separation: number,
    threshold: number
  ): void {
    let state = this.states.get(key);
    if (!state) {
      state = { armed: true, lastShown: 0 };
      this.states.set(key, state);
    }
    if (separation > threshold + HYSTERESIS) state.armed = true;
    if (!state.armed || separation > threshold) return;
    const now = performance.now();
    if (now - state.lastShown < COOLDOWN_MS) return;
    state.armed = false;
    state.lastShown = now;
    this.show(title, body, key);
  }

  private show(title: string, body: string, key: string): void {
    const toast = document.getElementById("event-toast");
    if (!toast) return;
    // "View" flies to the event's vantage: Earth for sky events and
    // eclipses, the cluster anchor for solar alignments.
    this.currentBody = key.startsWith("align-cluster-")
      ? key.replace("align-cluster-", "")
      : "Earth";
    document.getElementById("event-title")!.textContent = title;
    document.getElementById("event-body")!.textContent = body;
    toast.hidden = false;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(this.hide, 9000);
  }

  private hide = (): void => {
    window.clearTimeout(this.hideTimer);
    const toast = document.getElementById("event-toast");
    if (toast) toast.hidden = true;
  };
}
