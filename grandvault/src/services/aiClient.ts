/**
 * Main-thread client for the CPU worker. Owns the worker lifecycle, resolves the
 * bundled-asset URLs relative to the app base (so it works under both file:// in
 * Electron and https:// as a PWA), and exposes a small promise-based API.
 */

import type { InMsg, ProcessResult } from '../workers/cpu.worker';
import { getSetting } from '../db/dexie';

let worker: Worker | null = null;
let seq = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let readyResolve: (() => void) | null = null;
const ready = new Promise<void>((r) => (readyResolve = r));

function assetUrl(rel: string): string {
  return new URL(rel, document.baseURI).toString();
}

export async function initAi(): Promise<void> {
  if (worker) return ready;
  worker = new Worker(new URL('../workers/cpu.worker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, payload } = e.data as { id: number; ok: boolean; payload: unknown };
    if (id === 0) {
      readyResolve?.();
      return;
    }
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(payload) : p.reject(new Error(String(payload)));
  };

  const allowRemote = await getSetting<boolean>('ai.allowRemote', false);
  const init: InMsg = {
    type: 'init',
    modelsBase: assetUrl('models/'),
    ortBase: assetUrl('ort/'),
    ocr: {
      workerPath: assetUrl('tesseract/worker.min.js'),
      corePath: assetUrl('tesseract/'),
      langPath: assetUrl('tessdata/'),
    },
    pdfWorker: assetUrl('pdf/pdf.worker.min.mjs'),
    allowRemote,
  };
  worker.postMessage(init);
  return ready;
}

function call<T>(msg: Omit<InMsg, 'id'> & { id?: number }): Promise<T> {
  const id = seq++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ ...msg, id });
  });
}

export function warmupAi(): Promise<void> {
  return call<void>({ type: 'warmup' } as InMsg);
}

export async function processFile(blob: Blob, mime: string): Promise<ProcessResult> {
  return call<ProcessResult>({ type: 'process', blob, mime } as InMsg);
}

export async function embedText(text: string): Promise<Float32Array> {
  const buf = await call<ArrayBuffer>({ type: 'embed', text } as InMsg);
  return new Float32Array(buf);
}
