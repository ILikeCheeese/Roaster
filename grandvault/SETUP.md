# GrandVault — Setup Guide (for the family member)

GrandVault is a **private, offline** dashboard for your grandparents' finances and
important papers. It runs as a **double-click app** on a **Windows PC** or **Mac** — no
install, no accounts, and no internet after setup. Nothing about their finances ever
leaves the device.

This guide is for **you** (the tech-savvy family member). Your grandparents just
double-click the GrandVault icon.

---

## What it does

- **Accounts & Contacts** — banks/companies, accounts (**last 4 digits only**), people to
  call, where the physical papers are, and which password manager holds the real logins.
  It never stores passwords, full account numbers, or Social Security numbers.
- **Scan a Paper** — add a photo or PDF; GrandVault reads it (offline OCR), files it into
  a category, and makes it searchable.
- **Search** — find papers by meaning ("my electric bill"), not just exact words.
- **Scam protection** — anyone can *view* freely, but **sending or saving a copy of a
  document requires today's family code** (see below), so you get a phone call before
  anything can leave the app.

---

## 1. Build the app folder (once, on your computer)

You need [Node.js](https://nodejs.org) 20+.

```bash
cd grandvault
npm install          # dependencies
npm run assets       # download the offline AI + OCR models (needs internet ONCE)
npm run pack         # builds everything into the GrandVault-App/ folder
```

`npm run pack` produces a **`GrandVault-App/`** folder (~110 MB) containing the whole app,
all the offline AI, and the double-click launchers. This is the folder you give to your
grandparents (copy it to their PC/Mac via USB stick, file share, etc.).

---

## 2. Put it on their computer

Copy the whole **`GrandVault-App/`** folder anywhere on their machine (e.g. their Desktop
or Documents).

### Windows
1. Open the folder and double-click **`Add Desktop Icon.bat`** once → a **GrandVault**
   icon appears on the Desktop (you can right-click it → *Pin to taskbar*).
2. From then on they just double-click **GrandVault** to open it.
   - A small window titled *"GrandVault (keep open - close to quit)"* appears — that's the
     tiny local engine; leave it be. Closing it quits GrandVault.
   - First run may show a blue *"Windows protected your PC"* box → **More info → Run
     anyway** (normal for a local app).

### Mac
1. Double-click **`Start GrandVault.command`**. First time: right-click it → **Open →
   Open** (macOS asks because it's not from the App Store).
2. Drag that file onto the Dock to keep it handy.
   - It uses the python3/ruby/php that already ships with macOS. If it says none is found,
     run `xcode-select --install` once.

> It opens in an app-style window (Edge/Chrome if present, otherwise the default browser).
> Everything runs locally — airplane mode is fine.

### iPad (optional)
The double-click launcher is for computers. To also use it on an iPad, serve the `app/`
folder from your computer (`npm run preview`) or any static host, open the link in Safari
once, and tap **Share → Add to Home Screen**. (See the app's own behavior notes below.)

---

## 3. The daily family code (scam protection)

Viewing papers is always free. **Sending or saving a copy** asks for a **daily code that
only you know** — so your grandparent has to call you first, and you can confirm it isn't
a scammer on the line.

- The code is the **Wordle answer from 7 days ago**, a new 5-letter word each day.
- **How you know today's code:** open **⚙️ Setup** in the app (protected by a private PIN
  you create on first run) → it shows **today's code** and the last few days.
- You can change how many days back it uses (Setup → offset), or align the built-in word
  list with the official Wordle list — see the note atop
  `app/data/wordle-answers.json` (or `public/data/wordle-answers.json` in the source).

> When a grandparent genuinely needs to send a document, they call you, you read them
> today's code, and it unlocks sending for the rest of that day.

---

## Honest limits (please read)

- **Screenshots can't be blocked.** A browser can't stop screenshots, and nothing can stop
  someone photographing the screen. GrandVault instead makes the *original files*
  impossible to send or save without your daily code, and blocks casual copy/right-click/
  drag. That's the real protection.
- **Each computer is separate.** They don't sync. Use **Setup → Back up the directory** to
  save a copy you can move between machines.
- **Keep the models.** If you rebuild on a new machine, run `npm run assets` before
  `npm run pack` so the offline AI is included.
