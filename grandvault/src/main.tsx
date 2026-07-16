import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './theme/theme.css';
import App from './App';
import { installCopyGuards } from './services/security';
import { bootstrap } from './bootstrap';

// Block casual copy/right-click/drag before anything renders.
installCopyGuards();

// Register the offline service worker (PWA) — only when served over http(s).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline-first is best-effort; app still works */
    });
  });
}

// Kick off one-time setup (seed categories, init AI worker) in the background.
bootstrap();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
