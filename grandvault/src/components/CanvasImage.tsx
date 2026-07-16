import { useEffect, useRef } from 'react';

/**
 * Renders an image Blob onto a <canvas> rather than an <img>. There is no
 * saveable src, and combined with the app-wide context-menu/drag guards this
 * makes "save image" / drag-out unavailable. (Screenshots are still possible —
 * see SETUP — but the original file never leaves the app this way.)
 */
export default function CanvasImage({ blob, maxHeight = 720 }: { blob: Blob; maxHeight?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let revoked = false;
    (async () => {
      const bmp = await createImageBitmap(blob);
      if (revoked) return;
      const canvas = ref.current;
      if (!canvas) return;
      const scale = Math.min(1, maxHeight / bmp.height);
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
    })();
    return () => {
      revoked = true;
    };
  }, [blob, maxHeight]);

  return (
    <canvas
      ref={ref}
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 12,
        border: '2px solid var(--line)',
        background: '#fff',
      }}
    />
  );
}
