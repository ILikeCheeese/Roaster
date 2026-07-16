/// <reference lib="webworker" />
/**
 * CPU worker: runs the heavy, blocking AI (OCR + embeddings) off the UI thread.
 * The main thread handles IndexedDB, redaction, and categorization with the
 * results this worker returns.
 */

import { configureEmbeddings, embed, warmup, bytesFromVector } from '../services/embeddings';
import { configureOcr, ocrImage } from '../services/ocr';
import { preprocessForOcr } from '../services/preprocess';
import { configurePdf, extractPdf } from '../services/pdf';

export interface InitMsg {
  type: 'init';
  modelsBase: string;
  ortBase: string;
  ocr: { workerPath: string; corePath: string; langPath: string };
  pdfWorker: string;
  allowRemote: boolean;
}
export interface WarmupMsg { type: 'warmup'; id: number; }
export interface ProcessMsg { type: 'process'; id: number; blob: Blob; mime: string; }
export interface EmbedMsg { type: 'embed'; id: number; text: string; }
export type InMsg = InitMsg | WarmupMsg | ProcessMsg | EmbedMsg;

export interface ProcessResult {
  ocrText: string;
  pageCount: number;
  embedding: ArrayBuffer;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(id: number, ok: boolean, payload: unknown) {
  ctx.postMessage({ id, ok, payload });
}

async function processFile(blob: Blob, mime: string): Promise<ProcessResult> {
  let text = '';
  let pageCount = 1;

  if (mime === 'application/pdf') {
    const pages = await extractPdf(blob);
    pageCount = pages.length;
    const parts: string[] = [];
    for (const p of pages) {
      if (p.needsOcr && p.raster) {
        const pre = await preprocessForOcr(p.raster);
        parts.push(await ocrImage(pre));
      } else {
        parts.push(p.text);
      }
    }
    text = parts.join('\n\n');
  } else {
    const pre = await preprocessForOcr(blob);
    text = await ocrImage(pre);
  }

  // Embed a composite of the most informative text (truncated to model window).
  const embedding = await embed(text.slice(0, 2000));
  return { ocrText: text, pageCount, embedding: bytesFromVector(embedding) };
}

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        configureEmbeddings(msg.modelsBase, msg.ortBase, msg.allowRemote);
        configureOcr(msg.ocr);
        configurePdf(msg.pdfWorker);
        ctx.postMessage({ id: 0, ok: true, payload: 'ready' });
        break;
      case 'warmup':
        await warmup();
        post(msg.id, true, 'warm');
        break;
      case 'process':
        post(msg.id, true, await processFile(msg.blob, msg.mime));
        break;
      case 'embed':
        post(msg.id, true, bytesFromVector(await embed(msg.text)));
        break;
    }
  } catch (err) {
    post((msg as { id?: number }).id ?? 0, false, String(err instanceof Error ? err.message : err));
  }
};
