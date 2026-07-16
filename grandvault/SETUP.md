# GrandVault — Setup Guide (for the family member)

GrandVault is a **private, offline** dashboard for your grandparents' finances and
important papers. It runs as a normal website that installs like an app on a
**Windows PC** and an **iPad**. Nothing about their finances ever goes to the internet —
everything is stored on each device.

This guide is for **you** (the tech-savvy family member). Your grandparents never need
to do any of this — they just tap the GrandVault icon.

---

## What it does

- **Accounts & Contacts** — a clear list of banks/companies, accounts (last 4 digits
  only), people to call, where the physical papers are, and which password manager holds
  the real logins. **It never stores passwords, full account numbers, or Social Security
  numbers.**
- **Scan a Paper** — add a photo or PDF; GrandVault reads it, files it into a category,
  and makes it searchable — all on the device, no internet.
- **Search** — find papers by meaning ("my electric bill"), not just exact words.
- **Scam protection** — anyone can *view* freely, but **sending or saving a copy of a
  document requires today's family code** (see below), so you get a phone call before
  anything can leave the app.

---

## One-time build (on your computer)

You need [Node.js](https://nodejs.org) 20+.

```bash
cd grandvault
npm install                 # install dependencies
npm run assets              # download the offline AI + OCR models (needs internet ONCE)
npm run build               # produces the ready-to-host app in dist/
```

`npm run assets` fetches, into `public/`, everything the app needs to run with **no
internet afterward**: the OCR engine + English data, the PDF reader, the ONNX runtime,
and the ~23 MB MiniLM search model. These are intentionally **not** committed to git.

---

## Getting it onto their devices — pick the simplest option for you

The built app in `dist/` is just static files. Their **documents never leave the device**
regardless of how you serve the app — only the app's own code loads from wherever you put it.

### Option A (simplest): host the static app once
Upload `dist/` to any static host (e.g. Netlify drag-and-drop, GitHub Pages, Cloudflare
Pages). You get a link. Then on each device open the link **once while online** so it
caches, and install it (below). After that it works fully offline forever.

### Option B (fully self-contained): serve it from your own machine/network
```bash
npm run preview      # serves the app at http://<your-computer>:4173
```
Open that address on each device (same Wi-Fi) and install it. Good if you'd rather not
use any host at all.

### Install on **Windows** (Edge or Chrome)
Open the app → click the **Install** icon in the address bar (or ⋮ menu → *Install
GrandVault*). It gets a desktop icon and its own window.

### Install on **iPad** (Safari)
Open the app → tap the **Share** button → **Add to Home Screen**. It gets a Home-Screen
icon and opens full-screen like a normal app.

> After installing once online, everything is cached — the app opens and works with the
> iPad/PC offline (airplane mode).

---

## The daily family code (scam protection)

Viewing papers is always free. **Sending or saving a copy** asks for a **daily code that
only you know** — so your grandparent has to call you first, and you can confirm it isn't
a scammer on the line.

- The code is the **Wordle answer from 7 days ago**, a new 5-letter word each day.
- **How you know today's code:** open **⚙️ Setup** in the app (protected by a private PIN
  you create on first run) → it shows **today's code** and the last few days. Keep this
  PIN to yourself.
- You can change how many days back it uses (Setup → offset), or replace the built-in
  word list with the official Wordle list so it matches public Wordle archives exactly —
  see the note at the top of `public/data/wordle-answers.json`.

> When a grandparent needs to genuinely send a document, they call you, you read them
> today's code, and it unlocks sending for the rest of that day.

---

## Honest limits (please read)

- **Screenshots can't be blocked.** A website can't stop screenshots on iPad or Windows,
  and nothing can stop someone photographing the screen. GrandVault instead makes the
  *original files* impossible to send or save without your daily code, and blocks casual
  copy/right-click/drag. That's the real protection.
- **Each device is separate.** The iPad and PC each keep their own copy; they don't sync.
  Use **Setup → Back up the directory** to save a copy you can move between devices.
- **Keep the models.** If you ever move the project, re-run `npm run assets` before
  building so the offline AI is present.
