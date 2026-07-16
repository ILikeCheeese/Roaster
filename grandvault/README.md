# GrandVault

A private, **fully-offline** finance & document dashboard built for elderly users and
set up by a family member. Runs as an installable web app (PWA) on a **Windows PC** and
an **iPad** — no cloud, no accounts, no internet after setup.

> **Setting it up for your grandparents? Read [SETUP.md](./SETUP.md).**

## Why it exists

Grandparents needed one simple place that (1) documents *how to access everything* —
banks, accounts, contacts, where papers live, which password manager holds logins — and
(2) lets them scan their many physical papers, have them auto-sorted, and search them by
meaning. A core goal is **scam protection**: they must not be talked into sending
documents to a stranger.

## What it does

| Area | What it does |
| --- | --- |
| **Accounts & Contacts** | Institutions, accounts (**last-4 only**), people to call, physical document locations, reminders. **No passwords / SSNs / full account numbers — ever.** |
| **Scan a Paper** | Import a photo or PDF → offline OCR reads it → auto-filed into a category → made searchable. iPad camera supported. |
| **Search** | Hybrid **semantic + keyword** search (local MiniLM embeddings + BM25, fused with Reciprocal Rank Fusion). Finds papers by meaning. |
| **Scam gate** | Viewing is free; **sending/saving a copy needs a daily family code** (the Wordle answer from 7 days ago) that only the family member knows. |
| **Safety** | A redaction scanner strips full SSNs and card/account numbers out of scanned text before saving (keeps last-4). |

## How it works (all in the browser, all offline)

- **OCR:** `tesseract.js` (WASM) + bundled English data.
- **PDFs:** `pdfjs-dist` (text layer, falling back to rasterize-then-OCR).
- **Semantic search:** `@huggingface/transformers` running `all-MiniLM-L6-v2` (int8 ONNX)
  via `onnxruntime-web` — models served from the app's own bundle, never a CDN.
- **Storage:** IndexedDB (via `dexie`); document images and embeddings stay on-device.
- **Heavy AI** runs in a Web Worker so the UI never freezes.

## Develop

```bash
npm install
npm run assets      # one-time: download offline models into public/ (needs internet)
npm run dev         # http://localhost:5173
npm run build       # static app in dist/
npm run typecheck
```

The offline model/OCR assets under `public/{models,tessdata,tesseract,ort,pdf}` are large
and are **not** committed — regenerate them with `npm run assets`.

## Verification

The full pipeline is verified end-to-end in a headless browser (offline): AI loads
locally, Directory CRUD + last-4 enforcement, OCR → categorize → store, redaction of
SSN/card numbers, the Wordle-7-days-ago export gate (wrong code refused, correct accepted),
and meaning-based search. See the "Verification" section of the project plan.

## Known follow-ups

- Programmatic `<label>`/input association for screen readers (visible labels + large
  targets are already in place).
- Real-device iPad camera pass and installable-icon polish.
- Optional: encrypted full-document backup (directory backup is implemented).
