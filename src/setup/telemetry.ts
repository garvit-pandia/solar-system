import { options } from "./gui";
import { AU_KM } from "./ephemeris";

/** One world unit = this many km in TRUE-SCALE mode (1 unit = Earth radius). */
const TRUE_SCALE_KM_PER_UNIT = 6371;
/** ×1 speed = 8 simulated hours per real second (planetary-object timeFactor). */
const SIM_HOURS_PER_REAL_SECOND_AT_X1 = 8;

const formatKm = (km: number): string => {
  if (km < 1e6) return `${Math.round(km).toLocaleString("en-US")} km`;
  if (km < 1e8) return `${(km / 1e6).toFixed(1)}M km`;
  return `${(km / AU_KM).toFixed(2)} AU`;
};

const formatScale = (km: number): string => {
  if (km < 1e6) return `${Math.round(km).toLocaleString("en-US")} km`;
  if (km < 1e8) return `${(km / 1e6).toFixed(1)}M km`;
  return `${(km / AU_KM).toFixed(1)} AU`;
};

const formatRate = (): string => {
  if (!options.clock) return "paused";
  const magnitude = Math.abs(options.speed);
  const hoursPerSec = SIM_HOURS_PER_REAL_SECOND_AT_X1 * magnitude;
  let rate: string;
  if (hoursPerSec < 48) rate = `${hoursPerSec.toFixed(hoursPerSec < 9 ? 1 : 0)} h/s`;
  else if (hoursPerSec < 24 * 365 * 1.5) rate = `${(hoursPerSec / 24).toFixed(0)} d/s`;
  else rate = `${(hoursPerSec / 24 / 365.25).toFixed(1)} y/s`;
  const arrow = options.speed < 0 ? " ◀" : "";
  return `×${magnitude < 10 ? magnitude.toFixed(magnitude % 1 ? 2 : 0) : Math.round(magnitude)} · ${rate}${arrow}`;
};

// Exact defined speed of light. One astronomical unit (AU_KM = 149597870.7)
// divided by c equals about 499.0 seconds (about 8.317 minutes per AU),
// which is why the Sun reads about 8m19s from Earth.
const SPEED_OF_LIGHT_KM_S = 299792.458;

const formatLight = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m${String(s).padStart(2, "0")}s`;
  }
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}m`;
};

export interface TelemetryInput {
  /** Camera → focus distance, in WORLD units. */
  worldDistance: number;
  /**
   * km per world unit, calibrated at the focused body: exact (6371) in
   * true-scale mode, heliocentric-ratio approximation in stylised view mode.
   */
  kmPerUnit: number;
  viewportHeight: number;
  fovDeg: number;
  /** Mean orbital velocity of the focus in km/s (NaN → show "—"). */
  orbitalVelocityKmS: number;
}

/**
 * Live telemetry strip under the sim-date chip: camera→focus distance
 * (AU + km), the focus's mean orbital velocity, the on-screen scale
 * ("1 px ≈ N km" at the focus distance) and the sim rate. Pure readout —
 * it computes nothing the sim doesn't already know. Updated on the same
 * 500 ms throttle as the sim date.
 */
export const createTelemetry = () => {
  const root = document.getElementById("telemetry");
  const distEl = document.getElementById("tel-dist");
  const velEl = document.getElementById("tel-vel");
  const scaleEl = document.getElementById("tel-scale");
  const rateEl = document.getElementById("tel-rate");
  const lightEl = document.getElementById("tel-light");

  return {
    update(input: TelemetryInput): void {
      if (!root || !distEl || !velEl || !scaleEl || !rateEl || !lightEl) return;

      const km = input.worldDistance * input.kmPerUnit;
      const au = km / AU_KM;
      distEl.textContent = au >= 0.01 ? `${au.toFixed(2)} AU` : formatKm(km);

      velEl.textContent = Number.isFinite(input.orbitalVelocityKmS)
        ? `${input.orbitalVelocityKmS.toFixed(1)} km/s`
        : "—";

      // World size of one pixel at the focus distance (pinhole model).
      const worldPerPixel =
        (2 * input.worldDistance *
          Math.tan((input.fovDeg * Math.PI) / 360)) /
        Math.max(1, input.viewportHeight);
      scaleEl.textContent = `1 px ≈ ${formatScale(worldPerPixel * input.kmPerUnit)}`;

      rateEl.textContent = formatRate();
      lightEl.textContent = formatLight(km / SPEED_OF_LIGHT_KM_S);
    },
  };
};

/** Calibrate km-per-world-unit at the focused body.
 *
 * True scale is exact (1 unit = 1 Earth radius everywhere). Stylised view
 * mode compresses distances non-linearly (Mkm^0.4), so km/unit varies
 * across the scene — the honest local answer is the ratio at the focus:
 * its real heliocentric distance in km over its world distance from the
 * Sun. `resolve` supplies that pair (distanceKm, worldR) for a body name;
 * the Sun (worldR = 0) falls back to Earth's calibration.
 */
export const computeKmPerUnit = (
  focusName: string,
  trueScale: boolean,
  resolve: (name: string) => { distanceKm: number; worldR: number } | undefined
): number => {
  if (trueScale) return TRUE_SCALE_KM_PER_UNIT;

  const focus = resolve(focusName);
  if (focus && focus.worldR > 1e-6) return focus.distanceKm / focus.worldR;

  const earth = resolve("Earth");
  if (earth && earth.worldR > 1e-6) return earth.distanceKm / earth.worldR;
  return 1;
};
