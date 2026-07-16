/**
 * Image preprocessing before OCR. Runs in a worker using OffscreenCanvas.
 * Grayscale + contrast normalization + upscaling markedly improves Tesseract
 * accuracy on phone photos and flatbed scans.
 */

const TARGET_MIN_DIM = 1600; // upscale small captures toward ~300 DPI equivalent

/** Decode a Blob to an ImageBitmap (worker-safe). */
export async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/**
 * Returns a processed grayscale, contrast-normalized bitmap suitable for OCR.
 */
export async function preprocessForOcr(blob: Blob): Promise<Blob> {
  const bmp = await decode(blob);
  const scale = Math.max(1, TARGET_MIN_DIM / Math.min(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Grayscale + track min/max for a simple contrast stretch.
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  return canvas.convertToBlob({ type: 'image/png' });
}
