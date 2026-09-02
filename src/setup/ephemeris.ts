import * as THREE from "three";

/**
 * Planetary ephemeris — J2000 Keplerian elements + Kepler solver.
 *
 * Positions come from JPL's "Keplerian Elements for Approximate Positions
 * of the Major Planets" (Table 1, ssd.jpl.nasa.gov/planets/approx_pos.html),
 * valid 1800–2050, including the per-century element rates so the date
 * picker stays accurate across the whole interval. Pluto is from the same
 * JPL series (pre-2021 edition of the table). The remaining dwarf planets
 * keep stylised circular orbits — their view-mode orbits are heavily
 * stylised anyway (see AGENTS.md).
 *
 * Coordinate frame: the solver returns heliocentric ECLIPTIC coordinates
 * (x, y in the ecliptic plane, z toward the north ecliptic pole). The scene
 * is right-handed Y-up, so scene = (x_ecl, z_ecl, −y_ecl) — the map has
 * determinant +1 and puts the north ecliptic pole on scene +Y, making
 * planets orbit counter-clockwise seen from above (the real direction).
 */

const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12); // 2000-01-01T12:00 TT ≈ UTC
const MILLISECONDS_PER_DAY = 86400000;
const DEG = Math.PI / 180;

/** Sim-clock coupling: 3 elapsed units = 1 sim day (×1 speed = 8 h/s). */
export const ELAPSED_UNITS_PER_DAY = 3;

/** One astronomical unit, in km. */
export const AU_KM = 149597870.7;

// Computed once at module load, so the clock seed is deterministic per session.
const daysSinceJ2000Now = (Date.now() - J2000_EPOCH_MS) / MILLISECONDS_PER_DAY;

/**
 * Initial value for the simulation clock, in elapsed-time units, so the
 * clock starts at the REAL current date and the planets describe "now".
 */
export const initialElapsedTime = daysSinceJ2000Now * ELAPSED_UNITS_PER_DAY;

export const simDateMsFromElapsed = (elapsed: number): number =>
  J2000_EPOCH_MS + (elapsed / ELAPSED_UNITS_PER_DAY) * MILLISECONDS_PER_DAY;

export const elapsedFromSimDateMs = (ms: number): number =>
  ((ms - J2000_EPOCH_MS) / MILLISECONDS_PER_DAY) * ELAPSED_UNITS_PER_DAY;

export const daysSinceJ2000FromElapsed = (elapsed: number): number =>
  elapsed / ELAPSED_UNITS_PER_DAY;

/** Elements: a in AU, angles in degrees; rates are per Julian century. */
interface ElementSet {
  a: number;
  aDot: number;
  e: number;
  eDot: number;
  i: number;
  iDot: number;
  L: number;
  LDot: number;
  peri: number; // longitude of perihelion ϖ
  periDot: number;
  node: number; // longitude of ascending node Ω
  nodeDot: number;
}

const ELEMENTS: Record<string, ElementSet> = {
  Mercury:  { a: 0.38709927,  aDot: 0.00000037,  e: 0.20563593, eDot: 0.00001906,  i: 7.00497902,  iDot: -0.00594749, L: 252.25032350,  LDot: 149472.67411175, peri: 77.45779628,  periDot: 0.16047689,  node: 48.33076593,  nodeDot: -0.12534081 },
  Venus:    { a: 0.72333566,  aDot: 0.00000390,  e: 0.00677672, eDot: -0.00004107, i: 3.39467605,  iDot: -0.00078890, L: 181.97909950,  LDot: 58517.81538729,  peri: 131.60246718, periDot: 0.00268329,  node: 76.67984255,  nodeDot: -0.27769418 },
  Earth:    { a: 1.00000261,  aDot: 0.00000562,  e: 0.01671123, eDot: -0.00004392, i: -0.00001531, iDot: -0.01294668, L: 100.46457166,  LDot: 35999.37244981,  peri: 102.93768193, periDot: 0.32327364,  node: 0.0,          nodeDot: 0.0 },
  Mars:     { a: 1.52371034,  aDot: 0.00001847,  e: 0.09339410, eDot: 0.00007882,  i: 1.84969142,  iDot: -0.00813131, L: -4.55343205,   LDot: 19140.30268499,  peri: -23.94362959, periDot: 0.44441088,  node: 49.55953891,  nodeDot: -0.29257343 },
  Jupiter:  { a: 5.20288700,  aDot: -0.00011607, e: 0.04838624, eDot: -0.00013253, i: 1.30439695,  iDot: -0.00183714, L: 34.39644051,   LDot: 3034.74612775,   peri: 14.72847983,  periDot: 0.21252668,  node: 100.47390909, nodeDot: 0.20469106 },
  Saturn:   { a: 9.53667594,  aDot: -0.00125060, e: 0.05386179, eDot: -0.00050991, i: 2.48599187,  iDot: 0.00193609,  L: 49.95424423,   LDot: 1222.49362201,   peri: 92.59887831,  periDot: -0.41897216, node: 113.66242448, nodeDot: -0.28867794 },
  Uranus:   { a: 19.18916464, aDot: -0.00196176, e: 0.04725744, eDot: -0.00004397, i: 0.77263783,  iDot: -0.00242939, L: 313.23810451,  LDot: 428.48202785,    peri: 170.95427630, periDot: 0.40805281,  node: 74.01692503,  nodeDot: 0.04240589 },
  Neptune:  { a: 30.06992276, aDot: 0.00026291,  e: 0.00859048, eDot: 0.00005105,  i: 1.77004347,  iDot: 0.00035372,  L: -55.12002969,  LDot: 218.45945325,    peri: 44.96476227,  periDot: -0.32241464, node: 131.78422574, nodeDot: -0.00508664 },
  Pluto:    { a: 39.48211675, aDot: 0.0,         e: 0.24882730, eDot: 0.00005165,  i: 17.14001206, iDot: 0.00004818,  L: 238.92903833,  LDot: 145.20780515,    peri: 224.06891629, periDot: -0.04062942, node: 110.30393684, nodeDot: -0.01183482 },
};

export const hasElements = (name: string): boolean => name in ELEMENTS;

/** Mean semi-major axis at J2000, in AU (anchors stylised-unit factors). */
export const semiMajorAxisAU = (name: string): number =>
  ELEMENTS[name]?.a ?? NaN;

export interface OrbitFrame {
  a: number; // AU
  e: number;
  argPeri: number; // ω, radians
  node: number;    // Ω, radians
  inc: number;     // i, radians
}

/** Elements propagated to `daysSinceJ2000`, angles in radians. */
export const orbitFrameAt = (name: string, daysSinceJ2000: number): OrbitFrame | null => {
  const el = ELEMENTS[name];
  if (!el) return null;
  const T = daysSinceJ2000 / 36525;
  return {
    a: el.a + el.aDot * T,
    e: el.e + el.eDot * T,
    argPeri: (el.peri + el.periDot * T) * DEG - (el.node + el.nodeDot * T) * DEG,
    node: (el.node + el.nodeDot * T) * DEG,
    inc: (el.i + el.iDot * T) * DEG,
  };
};

/**
 * Solve Kepler's equation M = E − e·sin E (JPL recipe, degrees; e·57.29578
 * seeds Newton–Raphson). Returns E in degrees. Converges in ~4 iterations
 * for planetary eccentricities.
 */
const solveKepler = (M: number, e: number): number => {
  const eStar = 57.29578 * e;
  let E = M + eStar * Math.sin(M * DEG);
  for (let iter = 0; iter < 10; iter++) {
    const dM = M - (E - eStar * Math.sin(E * DEG));
    const dE = dM / (1 - e * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) < 1e-6) break;
  }
  return E;
};

/** Rotate perifocal (x', y') into ecliptic coordinates (JPL recipe). */
const perifocalToEcliptic = (
  frame: OrbitFrame,
  xPeri: number,
  yPeri: number,
  out: THREE.Vector3
): void => {
  const cosW = Math.cos(frame.argPeri);
  const sinW = Math.sin(frame.argPeri);
  const cosO = Math.cos(frame.node);
  const sinO = Math.sin(frame.node);
  const cosI = Math.cos(frame.inc);
  const sinI = Math.sin(frame.inc);

  const x =
    (cosW * cosO - sinW * sinO * cosI) * xPeri +
    (-sinW * cosO - cosW * sinO * cosI) * yPeri;
  const y =
    (cosW * sinO + sinW * cosO * cosI) * xPeri +
    (-sinW * sinO + cosW * cosO * cosI) * yPeri;
  const z = sinW * sinI * xPeri + cosW * sinI * yPeri;

  // Ecliptic → scene frame (see module doc): (x, z, −y).
  out.set(x, z, -y);
};

/**
 * Heliocentric position of `name` at `daysSinceJ2000`, in AU, written into
 * `out` in the SCENE frame. Zero-allocation (reuses nothing, writes straight
 * into the caller's vector). Returns false for bodies without elements.
 */
export const heliocentricSceneAU = (
  name: string,
  daysSinceJ2000: number,
  out: THREE.Vector3
): boolean => {
  const el = ELEMENTS[name];
  if (!el) return false;

  const T = daysSinceJ2000 / 36525;
  const a = el.a + el.aDot * T;
  const e = el.e + el.eDot * T;
  const frame: OrbitFrame = {
    a,
    e,
    argPeri: (el.peri + el.periDot * T) * DEG - (el.node + el.nodeDot * T) * DEG,
    node: (el.node + el.nodeDot * T) * DEG,
    inc: (el.i + el.iDot * T) * DEG,
  };

  // Mean anomaly M = L − ϖ, wrapped to (−180°, 180°].
  let M = el.L + el.LDot * T - (el.peri + el.periDot * T);
  M = ((M % 360) + 540) % 360 - 180;

  const E = solveKepler(M, e) * DEG;
  const xPeri = a * (Math.cos(E) - e);
  const yPeri = a * Math.sqrt(1 - e * e) * Math.sin(E);

  perifocalToEcliptic(frame, xPeri, yPeri, out);
  return true;
};

/**
 * Sample the orbit ellipse at `daysSinceJ2000` (elements drift over
 * centuries) as `count` scene-frame AU points, normalised by the semi-major
 * axis so the geometry is a unit ellipse the caller scales uniformly.
 * Returns a flat [x,y,z × count] array (caller closes the loop).
 */
export const orbitEllipsePointsAU = (
  name: string,
  daysSinceJ2000: number,
  count: number
): Float32Array | null => {
  const el = ELEMENTS[name];
  if (!el) return null;

  const T = daysSinceJ2000 / 36525;
  const a = el.a + el.aDot * T;
  const e = el.e + el.eDot * T;
  const frame: OrbitFrame = {
    a,
    e,
    argPeri: (el.peri + el.periDot * T) * DEG - (el.node + el.nodeDot * T) * DEG,
    node: (el.node + el.nodeDot * T) * DEG,
    inc: (el.i + el.iDot * T) * DEG,
  };

  const points = new Float32Array(count * 3);
  const scratch = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const E = (k / count) * Math.PI * 2;
    const xPeri = a * (Math.cos(E) - e);
    const yPeri = a * Math.sqrt(1 - e * e) * Math.sin(E);
    perifocalToEcliptic(frame, xPeri, yPeri, scratch);
    points[k * 3] = scratch.x / a;
    points[k * 3 + 1] = scratch.y / a;
    points[k * 3 + 2] = scratch.z / a;
  }
  return points;
};
