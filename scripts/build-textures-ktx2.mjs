// Convert static/textures/*.jpg to KTX2 (Basis Universal) via toktx.
// Output: .ktx2 next to the sources + src/setup/texture-manifest.ts
// (the set of basenames that can be loaded through KTX2Loader).
// Usage: npm run build-textures
//
// toktx resolution order:
//   1. `toktx` on PATH — Ubuntu: `sudo apt install ktx-tools`; other OSes:
//      download the KTX-Software release from
//      https://github.com/KhronosGroup/KTX-Software/releases
//   2. .tools/ktx/toktx(.exe) — the vendored Windows binary (repo-local fallback)
// NOTE: this step is OPTIONAL. The generated .ktx2 files are committed to the
// repo, so a fresh clone can skip it entirely — just `npm install && npm run dev`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const texDir = join(root, "static", "textures");

// Resolve toktx cross-platform: prefer a PATH install (works on any OS),
// fall back to the vendored Windows binary in .tools/ktx/.
function resolveToktx() {
  const ext = process.platform === "win32" ? ".exe" : "";
  const vendored = join(root, ".tools", "ktx", `toktx${ext}`);
  const onPath = process.platform === "win32" ? "toktx.exe" : "toktx";
  try {
    execFileSync(onPath, ["--version"], { stdio: "pipe" });
    return { cmd: onPath, label: `${onPath} (PATH)` };
  } catch {
    if (existsSync(vendored)) return { cmd: vendored, label: vendored };
    return null;
  }
}

const DATA_MAP = /(-bump|-specular|-alpha|clouds-alpha)/i;

const fmtKB = (n) => `${(n / 1024).toFixed(0)} KB`;

const CHECK_MODE = process.argv.includes("--check");
const jpgs = readdirSync(texDir).filter((f) => f.toLowerCase().endsWith(".jpg"));
if (CHECK_MODE) {
  const manifestPath = join(root, "src", "setup", "texture-manifest.ts");
  if (!existsSync(manifestPath)) {
    console.error(
      `texture-manifest.ts missing at ${manifestPath} — run "npm run build-textures" once to generate it.`
    );
    process.exit(1);
  }
  // Parse both sets out of the generated module. Tolerates the
  // "AUTO-GENERATED" header; does NOT evaluate the TS (no transpiler).
  const manifestSrc = readFileSync(manifestPath, "utf8");
  const parseSet = (name) => {
    const m = manifestSrc.match(new RegExp(`export const ${name}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    if (!m) return new Set();
    return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  };
  const ktx2Available = parseSet("KTX2_AVAILABLE");
  const jpgFallback = parseSet("KTX2_JPG_FALLBACK");
  // Freshness = every JPG accounted for: either on KTX2 or a recorded
  // intentional JPG fallback (KTX2 output larger than source — ganymede/io
  // today). A JPG in neither set means the builder never ran for it.
  // Manifest entries whose .ktx2 file is gone are stale the other way.
  const ktx2Files = new Set(
    readdirSync(texDir)
      .filter((f) => f.toLowerCase().endsWith(".ktx2"))
      .map((f) => basename(f, ".ktx2"))
  );
  const jpgBaseNames = new Set(jpgs.map((f) => basename(f, ".jpg")));
  const unprocessed = [...jpgBaseNames].filter((n) => !ktx2Available.has(n) && !jpgFallback.has(n)).sort();
  const orphaned = [...ktx2Available].filter((n) => !ktx2Files.has(n)).sort();
  if (unprocessed.length === 0 && orphaned.length === 0) {
    console.log(`texture-manifest freshness: OK (${jpgBaseNames.size} JPGs accounted for, ${ktx2Available.size} on KTX2, ${jpgFallback.size} intentional JPG)`);
    process.exit(0);
  }
  if (unprocessed.length > 0) {
    console.error(
      `texture-manifest is stale: ${unprocessed.length} JPG(s) in neither KTX2_AVAILABLE nor KTX2_JPG_FALLBACK:`
    );
    for (const name of unprocessed) console.error(`  - ${name}.jpg`);
  }
  if (orphaned.length > 0) {
    console.error(
      `texture-manifest is stale: ${orphaned.length} manifest entr(ies) lack a .ktx2 file on disk:`
    );
    for (const name of orphaned) console.error(`  - ${name}.ktx2`);
  }
  console.error(
    `\nRemediation: run "npm run build-textures" locally and commit the regenerated src/setup/texture-manifest.ts (and any new .ktx2 files in static/textures/).`
  );
  process.exit(1);
}
const resolved = resolveToktx();
if (!resolved) {
  console.error(
    "toktx not found. Install it first:\n" +
      "  Ubuntu:  sudo apt install ktx-tools\n" +
      "  Windows: place toktx.exe in .tools/ktx/ (already vendored in this repo)\n" +
      "  macOS/other: download KTX-Software from https://github.com/KhronosGroup/KTX-Software"
  );
  process.exit(1);
}
const { cmd: toktx } = resolved;
console.log(`using toktx: ${resolved.label}`);

const results = [];
for (const file of jpgs) {
  const src = join(texDir, file);
  const out = src.replace(/\.jpg$/i, ".ktx2");
  const isData = DATA_MAP.test(file);
  const args = isData
    ? ["--bcmp", "--clevel", "4", "--qlevel", "200", "--assign_oetf", "linear", out, src]
    : ["--bcmp", "--clevel", "5", "--qlevel", "255", "--assign_oetf", "linear", out, src];
  try {
    execFileSync(toktx, args, { stdio: "pipe" });
    const before = statSync(src).size;
    const after = statSync(out).size;
    // Validate the KTX2 magic («KTX).
    const magic = readFileSync(out).subarray(0, 4);
    const ok = magic[0] === 0xab && magic[1] === 0x4b && magic[2] === 0x54 && magic[3] === 0x58;
    if (!ok) throw new Error("bad KTX2 magic");
    results.push({ name: basename(file, ".jpg"), before, after, ok: ok && after < before });
    if (ok && after >= before) {
      // Oversized output is dead weight: the loader falls back to JPG for
      // anything absent from the manifest, so delete it instead of shipping
      // a larger file that is never served (ganymede/io today).
      try { unlinkSync(out); } catch { /* already gone — manifest stays clean */ }
      console.log(`${file.padEnd(30)} ${fmtKB(before).padStart(8)} → ${fmtKB(after).padStart(8)} (etc1s)  [kept on JPG — ktx2 not smaller, output pruned]`);
    } else {
      console.log(`${file.padEnd(30)} ${fmtKB(before).padStart(8)} → ${fmtKB(after).padStart(8)} (etc1s)${ok ? "" : "  [kept on JPG — ktx2 not smaller]"}`);
    }
  } catch (err) {
    console.error(`FAILED ${file}: ${err.message}`);
    results.push({ name: basename(file, ".jpg"), before: statSync(src).size, after: 0, ok: false });
  }
}

const ok = results.filter((r) => r.ok);
const totalBefore = results.reduce((s, r) => s + r.before, 0);
const totalAfter = ok.reduce((s, r) => s + r.after, 0);
console.log(`\n${ok.length}/${results.length} converted · ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)} (${((1 - totalAfter / totalBefore) * 100).toFixed(0)}% smaller)`);
// Emit the sync manifest the loader imports. KTX2_JPG_FALLBACK records the
// intentional JPG-only basenames (KTX2 output larger than source) so --check
// can tell "processed, stays on JPG" apart from "never ran the builder".
const fallback = results.filter((r) => !r.ok && r.after > 0);
const ts = `// AUTO-GENERATED by scripts/build-textures-ktx2.mjs — do not edit.
// Basenames whose .ktx2 counterpart exists and can be served to KTX2Loader.
export const KTX2_AVAILABLE: Set<string> = new Set([
${ok.map((r) => `  "${r.name}",`).join("\n")}
]);
// Intentional JPG fallbacks: processed by the builder, but the KTX2 output
// was larger than the source, so the loader serves the JPG. Pruned from disk.
export const KTX2_JPG_FALLBACK: Set<string> = new Set([
${fallback.map((r) => `  "${r.name}",`).join("\n")}
]);
`;
writeFileSync(join(root, "src", "setup", "texture-manifest.ts"), ts);
console.log("wrote src/setup/texture-manifest.ts");
