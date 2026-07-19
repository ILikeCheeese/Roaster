// Assemble the portable, double-click "GrandVault-App/" folder from a build.
// Contents:
//   GrandVault-App/
//     app/                     <- the built web app + all offline assets (dist)
//     Start GrandVault.bat     <- Windows launcher (double-click)
//     server.ps1               <- tiny dependency-free local server (Windows)
//     Add Desktop Icon.bat     <- creates a Desktop shortcut with the icon
//     Start GrandVault.command <- macOS launcher (double-click)
//     grandvault.ico           <- app icon
//     READ ME FIRST.txt, SETUP.md
//
// Run:  npm run pack   (this builds first, then packs)
import { cp, rm, mkdir, chmod, access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'GrandVault-App');

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

if (!(await exists(path.join(DIST, 'index.html')))) {
  console.error('No build found. Run "npm run build" first (or use "npm run pack").');
  process.exit(1);
}
if (!(await exists(path.join(ROOT, 'public', 'models', 'all-MiniLM-L6-v2', 'config.json')))) {
  console.error('Offline models are missing. Run "npm run assets" first.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1) App + assets.
await cp(DIST, path.join(OUT, 'app'), { recursive: true });

// 2) Trim runtimes we don't use, to save space.
// ORT: the app runs the jsep build, so drop the plain threaded one.
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await rm(path.join(OUT, 'app', 'ort', f), { force: true });
}
// Tesseract: we OCR with LSTM English data, so keep only the LSTM cores
// (SIMD build + a non-SIMD fallback) and the worker; drop the rest.
const tessDir = path.join(OUT, 'app', 'tesseract');
for (const f of await readdir(tessDir)) {
  const keep = f === 'worker.min.js' || /^tesseract-core(-simd)?-lstm\.wasm(\.js)?$/.test(f);
  if (!keep) await rm(path.join(tessDir, f), { force: true });
}

// 3) Launchers + icon + docs.
const launcher = path.join(ROOT, 'launcher');
for (const f of await readdir(launcher)) {
  await cp(path.join(launcher, f), path.join(OUT, f));
}
await cp(path.join(ROOT, 'public', 'icons', 'grandvault.ico'), path.join(OUT, 'grandvault.ico'));
if (await exists(path.join(ROOT, 'SETUP.md'))) {
  await cp(path.join(ROOT, 'SETUP.md'), path.join(OUT, 'SETUP.md'));
}

// 4) Make the macOS launcher executable.
await chmod(path.join(OUT, 'Start GrandVault.command'), 0o755).catch(() => {});

// Report size.
async function dirSize(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}
const mb = ((await dirSize(OUT)) / 1e6).toFixed(0);
console.log(`\nPacked GrandVault-App/  (${mb} MB)`);
console.log('Give the WHOLE folder to the family. They double-click "Start GrandVault".');
