/**
 * Offline OCR via tesseract.js v5. All asset paths point at bundled local files
 * and cacheMethod is 'none', so no network request is ever made.
 *
 * Bundled assets (see SETUP / scripts/fetch-assets.mjs):
 *   <app>/tesseract/worker.min.js
 *   <app>/tesseract/tesseract-core-simd.wasm.js  (+ .wasm)
 *   <app>/tessdata/eng.traineddata.gz
 */

import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;
let loading: Promise<Worker> | null = null;

export interface OcrPaths {
  workerPath: string;
  corePath: string; // folder containing the core wasm + js
  langPath: string; // folder containing eng.traineddata(.gz)
}

let paths: OcrPaths | null = null;

export function configureOcr(p: OcrPaths): void {
  paths = p;
}

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  if (!paths) throw new Error('OCR not configured — call configureOcr() first');
  if (!loading) {
    loading = createWorker('eng', 1, {
      workerPath: paths.workerPath,
      corePath: paths.corePath,
      langPath: paths.langPath,
      cacheMethod: 'none', // never write/read the browser cache or network
      gzip: true,
    }).then((w) => {
      worker = w;
      return w;
    });
  }
  return loading;
}

/** Recognize text from an image blob (already preprocessed). */
export async function ocrImage(blob: Blob): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(blob);
  return data.text ?? '';
}
