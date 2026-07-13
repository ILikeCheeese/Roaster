# Roaster 📷

A full-featured iPhone/iPad camera app built with SwiftUI + AVFoundation.
Every photo you take is **automatically saved into an album you choose**, and
that choice is **remembered across launches** so you never have to re-pick it.

Packaged as a **Swift Playgrounds app** (`.swiftpm`), so it builds and runs on
an **iPad** (Swift Playgrounds) *or* a **Mac** (Xcode) — no `.xcodeproj` needed.

## Features

- **Live camera preview** with tap-to-focus and pinch-to-zoom
- **Shutter capture** with a quick shutter animation and last-shot thumbnail
- **Front / back camera flip** (front stills are mirrored to match the preview)
- **Flash control** — Auto / On / Off, cycled from the top bar
- **Rule-of-thirds grid** overlay and a live **zoom badge**
- **Choose a destination album** — tap the album pill up top to pick any of
  your existing albums, or create a brand-new one on the spot
- **Auto-save to that album** after every shot (falls back to Camera Roll if
  no album is chosen)
- **Persistent selection** — the chosen album is stored in `UserDefaults`
  (`roaster.selectedAlbumID`) and restored on the next launch

## Project layout

```
Roaster.swiftpm/            ← open this in Swift Playgrounds or Xcode
├── Package.swift           App metadata, icon, accent color, capabilities
├── RoasterApp.swift        App entry point
├── ContentView.swift       Main camera screen + all on-screen controls
├── CameraManager.swift     AVFoundation session: capture/flip/flash/zoom/focus
├── CameraPreview.swift     Preview layer + pinch/tap gestures
├── PhotoLibraryService.swift  Album listing, creation, saving, persistence
├── AlbumPickerView.swift   Album selection sheet
└── Assets.xcassets/        App icon + accent color
scripts/make_icon.py        Regenerates the app icon / logo (Pillow)
```

## Run it on an iPad (no Mac needed)

1. Get `Roaster.swiftpm` onto the iPad — e.g. put it in iCloud Drive / Files,
   or AirDrop the folder.
2. Install **Swift Playgrounds** (free, App Store) and open `Roaster.swiftpm`.
3. Tap **▶ Run**. Grant camera and photo-library permission when asked.
4. Tap the album pill at the top to choose (or create) a destination album,
   then start shooting — photos land in that album automatically.
5. To keep it on the Home Screen, use Swift Playgrounds' **"Add to Home
   Screen / App Store Connect"** options.

> Note: Swift Playgrounds installs the app onto the **iPad** it runs on. Putting
> it on an iPhone specifically still requires App Store submission (possible
> from Swift Playgrounds on iPad with a paid developer account) or a Mac.

## Run it on a Mac

Open `Roaster.swiftpm` directly in **Xcode 15+**, set your signing Team, pick a
connected device, and press **Run**. (A real device is required — the Simulator
has no camera.)

## Branding

The app icon is a camera **aperture** in a warm amber→orange gradient on
charcoal, matching the app's yellow accent. Regenerate it any time with:

```
python3 scripts/make_icon.py
```
