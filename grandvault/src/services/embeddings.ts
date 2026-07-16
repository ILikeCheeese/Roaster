/**
 * Offline sentence embeddings via transformers.js (all-MiniLM-L6-v2, int8 ONNX).
 *
 * Designed to run inside a Web Worker (see workers/cpu.worker.ts) so inference
 * never blocks the UI. Models are loaded from a LOCAL path — no network. The
 * model files live under <app>/models/all-MiniLM-L6-v2/ and are either bundled
 * (Windows/Electron) or precached by the service worker (iPad PWA).
 */

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

const MODEL_ID = 'all-MiniLM-L6-v2';

/**
 * Configure transformers.js for fully-offline use.
 * @param modelsBaseUrl absolute URL to the folder that CONTAINS the model folder
 *                      (e.g. https://host/models/)
 * @param ortBaseUrl    absolute URL to the folder holding the onnxruntime-web
 *                      wasm/mjs files (bundled locally so nothing loads from a CDN)
 * @param allowRemote   escape hatch for first-run caching only; default false.
 */
export function configureEmbeddings(
  modelsBaseUrl: string,
  ortBaseUrl: string,
  allowRemote = false,
): void {
  env.allowLocalModels = true;
  env.allowRemoteModels = allowRemote;
  env.localModelPath = modelsBaseUrl;

  const wasm = env.backends?.onnx?.wasm;
  if (wasm) {
    // Serve the ORT wasm/glue from our own bundle — never a CDN.
    wasm.wasmPaths = ortBaseUrl;
    // Single-threaded avoids needing SharedArrayBuffer / COOP+COEP headers, so
    // the app works on any plain static host and from the Home Screen.
    wasm.numThreads = 1;
    wasm.proxy = false;
  }
}

export async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (!loading) {
    loading = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8', // int8 — small + fast, plenty for retrieval
    }).then((p) => {
      extractor = p;
      return p;
    });
  }
  return loading;
}

/** Embed one string → unit-normalized Float32Array (384 dims). */
export async function embed(text: string): Promise<Float32Array> {
  const ex = await getExtractor();
  const output = await ex(text || ' ', { pooling: 'mean', normalize: true });
  return new Float32Array(output.data as Float32Array);
}

/** A tiny warm-up inference so first-import latency and missing-model errors
 *  surface at startup, not mid-task. Part of the offline self-check. */
export async function warmup(): Promise<void> {
  await embed('warm up');
}

export function bytesFromVector(v: Float32Array): ArrayBuffer {
  return v.buffer.slice(0) as ArrayBuffer;
}

export function vectorFromBytes(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf);
}

/** Cosine similarity for unit vectors reduces to a dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
