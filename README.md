# Roaster 📷

A full-featured iPhone camera app built with SwiftUI + AVFoundation. Every
photo you take is **automatically saved into an album you choose**, and that
choice is **remembered across launches** so you never have to re-pick it.

Built for **iPhone 14 / iOS 26.5** (deployment target iOS 18.0, so it runs on
anything from iOS 18 upward).

## Features

- **Live camera preview** with tap-to-focus and pinch-to-zoom
- **Shutter capture** with a quick shutter animation and last-shot thumbnail
- **Front / back camera flip** (front stills are mirrored to match the preview)
- **Flash control** — Auto / On / Off, cycled from the top bar
- **Rule-of-thirds grid** overlay
- **Zoom badge** showing the current zoom factor
- **Choose a destination album** — tap the album pill up top to pick any of
  your existing albums, or create a brand-new one on the spot
- **Auto-save to that album** after every shot (falls back to Camera Roll if
  no album is chosen)
- **Persistent selection** — the chosen album is stored in `UserDefaults`
  (`roaster.selectedAlbumID`) and restored on the next launch

## Project layout

| File | Purpose |
|------|---------|
| `RoasterApp.swift` | App entry point |
| `ContentView.swift` | Main camera screen + all on-screen controls |
| `CameraManager.swift` | AVFoundation capture session, flip/flash/zoom/focus/capture |
| `CameraPreview.swift` | `UIViewRepresentable` preview layer + pinch/tap gestures |
| `PhotoLibraryService.swift` | Album listing, creation, saving, and persistence |
| `AlbumPickerView.swift` | Album selection sheet |

## Build & run

1. Open `Roaster.xcodeproj` in **Xcode 16 or later**.
2. Select your iPhone 14 as the run destination (a camera needs a real
   device — the Simulator has no camera).
3. Set your Apple ID **Team** under *Signing & Capabilities* (the bundle ID
   is `com.roaster.Roaster` — change it if it collides).
4. Press **Run** (⌘R). Grant camera and photo-library permission when asked.
5. Tap the album pill at the top to choose (or create) a destination album,
   then start shooting. Photos land in that album automatically.

## Notes

- Privacy usage strings (`NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`) are
  set via build settings in the project — no separate `Info.plist` needed.
- The app is portrait-only and hides the status bar for a full-screen
  viewfinder.
