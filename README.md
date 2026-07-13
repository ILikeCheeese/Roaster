# AlbumCam 📷

A full-featured iPhone/iPad camera app built with SwiftUI + AVFoundation.
Every photo you take is **automatically saved into an album you choose**, and
that choice is **remembered across launches** so you never have to re-pick it.

Packaged as a **Swift Playgrounds app** (`.swiftpm`), so it builds and runs on
an **iPad** (Swift Playgrounds) *or* a **Mac** (Xcode) — no `.xcodeproj` needed.

## Features

- **Live camera preview** with tap-to-focus and pinch-to-zoom
- **Shutter capture** with a quick shutter animation and last-shot thumbnail
- **Front / back camera flip** (front stills are mirrored to match the preview)
- **Flash control** — Auto / On / Off
- **Self-timer** — Off / 3s / 10s, with an on-screen countdown
- **Lens zoom presets** — 0.5× (ultra-wide) and 1× (wide) on iPhone 14, plus
  pinch to fine-tune
- **Rule-of-thirds grid** toggle
- **Choose a destination album** — tap the album pill up top to pick any of
  your existing albums (with cover thumbnails) or create a brand-new one
- **Auto-save to that album** after every shot (falls back to Camera Roll if
  no album is chosen)
- **Persistent selection** — the chosen album is stored in `UserDefaults`
  (`albumcam.selectedAlbumID`) and restored on the next launch

## Project layout

```
AlbumCam.swiftpm/           ← open this in Swift Playgrounds or Xcode
├── Package.swift           App metadata, icon, accent color, capabilities
├── AlbumCamApp.swift       App entry point + splash→camera root
├── SplashView.swift        Orbit→align launch animation + app name
├── SolarSystem.swift       Reusable solar-system view (sun, orbits, planets)
├── ContentView.swift       Main camera screen + all on-screen controls
├── CameraManager.swift     AVFoundation session: capture/flip/flash/zoom/focus
├── CameraPreview.swift     Preview layer + pinch/tap gestures
├── PhotoLibraryService.swift  Album listing, thumbnails, saving, persistence
├── AlbumPickerView.swift   Album picker sheet (thumbnails + current selection)
└── Assets.xcassets/        App icon + accent color
scripts/make_icon.py        Regenerates the app icon (Pillow)
```

## Run it on an iPad (no Mac needed)

1. Get `AlbumCam.swiftpm` onto the iPad — e.g. put it in iCloud Drive / Files,
   or AirDrop the folder.
2. Install **Swift Playgrounds** (free, App Store) and open `AlbumCam.swiftpm`.
3. Tap **▶ Run**. Grant camera and photo-library permission when asked.
4. Tap the album pill at the top to choose (or create) a destination album,
   then start shooting — photos land in that album automatically.
5. To keep it on the Home Screen, use Swift Playgrounds' **"Add to Home
   Screen / App Store Connect"** options.

> Note: Swift Playgrounds installs the app onto the **iPad** it runs on. Putting
> it on an iPhone specifically still requires App Store submission (possible
> from Swift Playgrounds on iPad with a paid developer account) or a Mac.
> Also, **0.5× and the camera itself need a real device** — the Simulator has
> no camera, and iPads without an ultra-wide lens will show 1× only.

## Run it on a Mac

Open `AlbumCam.swiftpm` directly in **Xcode 15+**, set your signing Team, pick a
connected device, and press **Run**.

## Branding & launch animation

The identity is a **realistic 8-planet solar system** — the sun doubles as the
lens and the orbit rings echo lens rings. On launch, `SplashView` spins the
planets fast, settles them into a **vertical line**, then **splits down the
middle and opens like curtains** into the camera.

- `SolarSystem.swift` — the reusable solar-system view (sun, orbits, shaded
  planet spheres, Saturn's ring). Its palette mirrors the icon generator.
- `SplashView.swift` — the spin→line→curtains animation and wordmark.
- App name/tagline live in `AppInfo` (in `SplashView.swift`) for easy edits.

Regenerate the app icon any time with:

```
python3 scripts/make_icon.py
```
