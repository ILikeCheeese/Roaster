/**
 * PDF handling with pdfjs-dist, fully offline. For each page we first try the
 * embedded text layer; if a page has too little text (i.e. it's a scan), we
 * rasterize it and hand it back for OCR.
 */

import * as pdfjs from 'pdfjs-dist';

// The worker is bundled locally (configured at startup, no CDN).
export function configurePdf(workerSrc: string): void {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

const MIN_TEXT_CHARS = 40; // below this a page is treated as a scan needing OCR

export interface PdfPage {
  pageNumber: number;
  text: string; // from the text layer (may be empty)
  needsOcr: boolean;
  raster?: Blob; // present when needsOcr
}

export async function extractPdf(blob: Blob): Promise<PdfPage[]> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: PdfPage[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length >= MIN_TEXT_CHARS) {
      pages.push({ pageNumber: n, text, needsOcr: false });
      continue;
    }

    // Scanned page — rasterize at 2x for OCR.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d')! as unknown as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const raster = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    pages.push({ pageNumber: n, text: '', needsOcr: true, raster });
  }

  return pages;
}
