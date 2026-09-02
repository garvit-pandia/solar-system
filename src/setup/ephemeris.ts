import planetData from "../planets.json";

const J2000_EPOCH = Date.UTC(2000, 0, 1, 12); // 2000-01-01T12:00Z
const MILLISECONDS_PER_DAY = 86400000;

// Computed once at module load, so it is deterministic within a session.
const daysSinceJ2000 = (Date.now() - J2000_EPOCH) / MILLISECONDS_PER_DAY;

/**
 * Initial value for the simulation clock, in elapsed-time units, so the
 * clock starts at the REAL current date. The ephemeris below places every
 * planet at its mean longitude for `daysSinceJ2000`; at ×1 speed one
 * elapsed unit = 8 sim hours (planetary-object.ts timeFactor), i.e. 3 units
 * per sim day — seeding the clock with daysSinceJ2000 × 3 keeps the HUD
 * date and the planet positions describing the same instant ("now").
 */
export const initialElapsedTime = daysSinceJ2000 * 3;

// Mean longitude at the J2000 epoch, in degrees, for the eight planets.
const MEAN_LONGITUDE_AT_EPOCH: Record<string, number> = {
  Mercury: 252.25084,
  Venus: 181.97973,
  Earth: 100.46435,
  Mars: 355.45332,
  Jupiter: 34.40438,
  Saturn: 49.94432,
  Uranus: 313.23218,
  Neptune: 304.88003,
  // Dwarf planets: mean longitude at the J2000 epoch (JPL small-body values).
  Pluto: 238.96,
};

/**
 * Approximate current mean longitude of a planet, in radians.
 *
 * L = (L0 + n * daysSinceJ2000) mod 360, with daily motion n = 360 / period.
 * Returns undefined for any body that is not one of the eight planets
 * (Sun, moons and rings fall through, keeping their existing offsets).
 *
 * @param name - name of the celestial body
 * @returns initial orbital angle in radians, or undefined
 */
export const initialOrbitAngle = (name: string): number | undefined => {
  const l0 = MEAN_LONGITUDE_AT_EPOCH[name];
  if (l0 === undefined) {
    return undefined;
  }

  const body = planetData.find((planet) => planet.name === name);
  if (!body || body.period === 0) {
    return undefined;
  }

  const dailyMotion = 360 / body.period;
  const longitude = (l0 + dailyMotion * daysSinceJ2000) % 360;

  return (longitude * Math.PI) / 180;
};
