import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GrandVault is a single browser-based app. On Windows it is wrapped in Electron
// (loaded from ./dist via file://), on iPad it is installed as a PWA. Using a
// relative base keeps asset URLs working under both file:// and https://.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Keep the large ML deps in their own chunks so the app shell loads instantly.
    rollupOptions: {
      output: {
        manualChunks: {
          transformers: ['@huggingface/transformers'],
          tesseract: ['tesseract.js'],
          pdf: ['pdfjs-dist'],
        },
      },
    },
  },
  optimizeDeps: {
    // These ship their own workers/wasm; let them be served as-is in dev.
    exclude: ['@huggingface/transformers', 'tesseract.js', 'pdfjs-dist'],
  },
});
