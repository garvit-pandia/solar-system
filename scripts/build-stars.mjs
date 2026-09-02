#!/usr/bin/env node
/**
 * build-stars.mjs — generate static star-sky data for the solar-system simulator.
 *
 * Outputs (terse JSON, served from static/data/):
 *   stars.json          naked-eye star catalog (apparent mag <= 6.5) built from the
 *                       HYG database v3 (ra/dec in DEGREES, B-V -> approximate RGB)
 *   constellations.json constellation stick figures, RA normalized to 0-360 deg
 *
 * Inputs are large working downloads in .tmp-stars/ (git-ignored, NOT committed):
 *   hygdata_v3.csv             HYG v3 from astronexus/HYG-Database, pinned commit
 *                              71a24ceb97aa8fe6f13753a2d090c23fdacbe20c — the file no
 *                              longer exists on the default branch (`main`), so the
 *                              raw URL must reference that historical commit:
 *                              https://raw.githubusercontent.com/astronexus/HYG-Database/71a24ceb97aa8fe6f13753a2d090c23fdacbe20c/hygdata_v3.csv
 *                              NOTE: in this archived file `ra` is decimal HOURS
 *                              (0..24) and `dec` is degrees — verified against Sirius
 *                              (6.7525 h = 101.29 deg) and the file's own rarad column.
 *                              The unit is auto-detected below and hours are converted
 *                              to degrees, so stars.json always carries degree RAs.
 *   constellations.lines.json  ofrohn/d3-celestial (MIT):
 *                              https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json
 *                              GeoJSON, geometry type MultiLineString; each point is
 *                              [ra, dec] with ra in DEGREES in the -180..180
 *                              convention (normalized below) — measured max |ra|
 *                              decides hours-vs-degrees at build time anyway. Some
 *                              d3-celestial data encodes dec as [sign, value] pairs;
 *                              this file does not, but it is handled defensively.
 *   constellations.json        same repo (data/constellations.json) — used ONLY for
 *                              the id -> proper name lookup, because the lines file
 *                              carries no names in its properties.
 *
 * Usage: node scripts/build-stars.mjs
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = join(root, ".tmp-stars");
const outDir = join(root, "static", "data");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const kb = (bytes) => (bytes / 1024).toFixed(1) + " KB";

function requireInput(name) {
  const p = join(tmpDir, name);
  if (!existsSync(p)) {
    throw new Error(`Missing input ${p} — download it into .tmp-stars/ first (see the header comment of this script for URLs).`);
  }
  return p;
}

/* ------------------------------------------------------------------ *
 * 1. Star catalog: HYG v3 CSV -> static/data/stars.json
 * ------------------------------------------------------------------ */

// B-V color index -> linear RGB, piecewise-linear over standard anchor stops.
const BV_STOPS = [
  [-0.4, [0.61, 0.7, 1.0]],
  [0.0, [0.78, 0.84, 1.0]],
  [0.3, [1.0, 0.98, 0.96]],
  [0.6, [1.0, 0.93, 0.82]],
  [1.0, [1.0, 0.83, 0.67]],
  [1.5, [1.0, 0.72, 0.51]],
  [2.0, [1.0, 0.61, 0.44]],
];

function bvToRgb(ci) {
  if (!Number.isFinite(ci)) return [1, 1, 1]; // missing/NaN color index -> white
  const x = Math.min(2.0, Math.max(-0.4, ci)); // clamp to the table range
  for (let i = 0; i < BV_STOPS.length - 1; i++) {
    const [a, ca] = BV_STOPS[i];
    const [b, cb] = BV_STOPS[i + 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      return [
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
      ];
    }
  }
  return BV_STOPS[BV_STOPS.length - 1][1].slice();
}

// Quote-aware CSV row parser. HYG v3 rows are unquoted, but this never treats a
// comma inside double quotes as a separator, so the parser survives any quoted
// field (e.g. a proper name containing a comma) without a dependency.
function parseCsvRow(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++; // escaped ""
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function buildStars() {
  const csvPath = requireInput("hygdata_v3.csv");
  const rows = readFileSync(csvPath, "utf8").split("\n");

  // HYG v3: `mag` is apparent magnitude, `ci` is B-V (may be empty/NaN),
  // `proper` is the common name (often empty). `dec` is degrees; the unit of
  // `ra` depends on the file version — auto-detected below and normalized to
  // degrees either way.
  const header = parseCsvRow(rows[0].replace(/\r$/, "")).map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const need of ["id", "hip", "hd", "hr", "gl", "bf", "proper", "ra", "dec", "mag", "ci"]) {
    if (col[need] === undefined) {
      throw new Error(`hygdata_v3.csv header is missing column "${need}" — got: ${header.join(",")}`);
    }
  }

  const MAG_LIMIT = 6.5; // naked-eye limit
  let maxAbsRa = 0;
  const picked = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    if (!line || line === "\r") continue;
    const f = parseCsvRow(line.endsWith("\r") ? line.slice(0, -1) : line);
    const mag = parseFloat(f[col.mag]);
    const ra = parseFloat(f[col.ra]);
    const a = Math.abs(ra);
    if (Number.isFinite(a) && a > maxAbsRa) maxAbsRa = a;
    if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
    picked.push({
      ra,
      dec: parseFloat(f[col.dec]),
      mag,
      ci: parseFloat(f[col.ci]),
      name: (f[col.proper] || "").trim(),
    });
  }

  // Decimal hours stay <= 24; degrees reach up to 360. The archived file at the
  // pinned commit is hours (max |ra| ~ 23.999, i.e. Sirius at 6.7525 h).
  const raIsHours = maxAbsRa <= 24.0001;
  const raFactor = raIsHours ? 15 : 1;
  console.log(
    `hygdata_v3.csv: RA treated as ${raIsHours ? "decimal HOURS (x15 -> degrees)" : "DEGREES"} (max |ra| = ${r3(maxAbsRa)})`
  );

  const stars = picked.map((o) => {
    const star = {
      ra: r3((((o.ra * raFactor) % 360) + 360) % 360),
      dec: r3(o.dec),
      mag: r2(o.mag),
      c: bvToRgb(o.ci).map(r3),
    };
    if (o.name) star.n = o.name;
    return star;
  });

  const outPath = join(outDir, "stars.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify({ count: stars.length, stars }));
  console.log(`stars.json: ${stars.length} stars (mag <= ${MAG_LIMIT}), ${kb(statSync(outPath).size)}`);
}

/* ------------------------------------------------------------------ *
 * 2. Constellation lines: d3-celestial -> static/data/constellations.json
 * ------------------------------------------------------------------ */

function buildConstellations() {
  const geo = readJson(requireInput("constellations.lines.json"));

  // Decide the RA unit from the data itself: decimal hours stay <= 24; degrees
  // reach up to 180/360. (Measured on this file: degrees in the -180..180 range.)
  let maxAbsRa = 0;
  let hasSignPairs = false;
  for (const f of geo.features) {
    for (const line of f.geometry?.coordinates ?? []) {
      for (const [ra, dec] of line) {
        const a = Math.abs(ra);
        if (a > maxAbsRa) maxAbsRa = a;
        if (Array.isArray(dec)) hasSignPairs = true;
      }
    }
  }
  const raIsHours = maxAbsRa <= 24.0001;
  const raFactor = raIsHours ? 15 : 1;
  // Normalize RA to 0-360 (handles the -180..180 convention and hours alike).
  const normRa = (ra) => r2((((ra * raFactor) % 360) + 360) % 360);
  // d3-celestial sometimes encodes dec as [sign, value]; plain numbers otherwise.
  const normDec = (dec) => r2(Array.isArray(dec) ? dec[0] * dec[1] : dec);
  console.log(
    `constellations.lines.json: RA treated as ${raIsHours ? "decimal HOURS (x15)" : "DEGREES"}` +
      ` (max |ra| = ${r3(maxAbsRa)})${hasSignPairs ? "; dec uses [sign, value] pairs" : "; dec is plain numbers"}`
  );

  // The lines file has no `name` property — join proper names by feature id
  // (3-letter IAU abbreviation) from d3-celestial's constellations.json.
  const names = new Map();
  const namesPath = join(tmpDir, "constellations.json");
  if (existsSync(namesPath)) {
    for (const f of readJson(namesPath).features ?? []) {
      const id = f.id ?? f.properties?.id;
      if (id && f.properties?.name) names.set(id, f.properties.name);
    }
  } else {
    console.warn("constellations.json (names) not found in .tmp-stars/ — output will fall back to ids for names");
  }

  const constellations = geo.features.map((f) => {
    const id = f.id ?? f.properties?.id;
    return {
      id,
      name: names.get(id) ?? "",
      lines: (f.geometry?.coordinates ?? []).map((poly) =>
        poly.map(([ra, dec]) => [normRa(ra), normDec(dec)])
      ),
    };
  });

  const outPath = join(outDir, "constellations.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify({ constellations }));
  const points = constellations.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.length, 0), 0);
  console.log(`constellations.json: ${constellations.length} constellations, ${points} points, ${kb(statSync(outPath).size)}`);
}

buildStars();
buildConstellations();
