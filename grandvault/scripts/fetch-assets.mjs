/*
 * Downloads and copies the offline assets GrandVault bundles: the OCR engine,
 * English language data, the PDF worker, and the MiniLM embedding model. Run
 * once on a machine WITH internet before building/packaging:
 *
 *     npm install
 *     node scripts/fetch-assets.mjs
 *
 * After this, the app runs with no network. These files are large and are NOT
 * committed to git (see .gitignore).
 */
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const PUB = path.resolve('public');

async function ensure(dir) {
  await mkdir(dir, { recursive: true });
}
async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}
async function download(url, dest) {
  if (await exists(dest)) { console.log('  exists', path.relative(PUB, dest)); return; }
  process.stdout.write(`  fetch ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function tesseract() {
  console.log('OCR (tesseract.js)…');
  const dir = path.join(PUB, 'tesseract');
  await ensure(dir);
  // Worker + core wasm shipped inside the installed packages.
  const workerSrc = require.resolve('tesseract.js/dist/worker.min.js');
  await copyFile(workerSrc, path.join(dir, 'worker.min.js'));
  // Copy ALL core variants — tesseract.js picks one at runtime based on the
  // language data (LSTM) and CPU features (SIMD), so all must be present offline.
  const coreDir = path.resolve('node_modules/tesseract.js-core');
  const { readdir } = await import('node:fs/promises');
  for (const f of await readdir(coreDir)) {
    if (/^tesseract-core.*\.(js|wasm)$/.test(f)) {
      await copyFile(path.join(coreDir, f), path.join(dir, f));
    }
  }
}

async function tessdata() {
  console.log('English language data…');
  const dir = path.join(PUB, 'tessdata');
  await ensure(dir);
  await download(
    'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz',
    path.join(dir, 'eng.traineddata.gz'),
  );
}

async function ortRuntime() {
  console.log('ONNX Runtime (onnxruntime-web) wasm…');
  const dir = path.join(PUB, 'ort');
  await ensure(dir);
  const src = path.resolve('node_modules/onnxruntime-web/dist');
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(src);
  for (const f of files) {
    if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) {
      await copyFile(path.join(src, f), path.join(dir, f));
    }
  }
}

async function pdfWorker() {
  console.log('PDF worker…');
  const dir = path.join(PUB, 'pdf');
  await ensure(dir);
  const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
  await copyFile(src, path.join(dir, 'pdf.worker.min.mjs'));
}

async function model() {
  console.log('Embedding model (all-MiniLM-L6-v2, int8)…');
  const base = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main';
  const dir = path.join(PUB, 'models', 'all-MiniLM-L6-v2');
  await ensure(path.join(dir, 'onnx'));
  const files = [
    ['config.json', 'config.json'],
    ['tokenizer.json', 'tokenizer.json'],
    ['tokenizer_config.json', 'tokenizer_config.json'],
    ['onnx/model_quantized.onnx', 'onnx/model_quantized.onnx'],
  ];
  for (const [rel, out] of files) {
    await download(`${base}/${rel}`, path.join(dir, out));
  }
}

await tesseract();
await tessdata();
await ortRuntime();
await pdfWorker();
await model();
console.log('\nAll offline assets are in place. The app can now run with no internet.');
