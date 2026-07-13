//
//  ContentView.swift
//  Roaster
//
//  The main camera screen: live preview with a top control bar (flash,
//  album destination) and a bottom bar (last-shot thumbnail, shutter,
//  flip). Ties the camera and photo-library layers together so every
//  capture is auto-saved to the chosen album.
//

import SwiftUI
import AVFoundation

struct ContentView: View {
    @StateObject private var camera = CameraManager()
    @StateObject private var library = PhotoLibraryService()

    @State private var showAlbumPicker = false
    @State private var focusIndicator: CGPoint?
    @State private var showFocusRing = false
    @State private var toast: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch camera.status {
            case .configured:
                cameraInterface
            case .unauthorized:
                permissionDenied(
                    icon: "camera.fill",
                    message: "Camera access is required. Enable it in Settings › Roaster."
                )
            case .failed:
                permissionDenied(
                    icon: "exclamationmark.triangle.fill",
                    message: "The camera could not be started."
                )
            case .unconfigured:
                ProgressView().tint(.white)
            }
        }
        .onAppear {
            camera.onPhotoCaptured = handleCapturedPhoto
            camera.checkPermissionsAndConfigure()
            library.requestAuthorization()
        }
        .onDisappear { camera.stopSession() }
        .sheet(isPresented: $showAlbumPicker) {
            AlbumPickerView(library: library)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Camera interface

    private var cameraInterface: some View {
        GeometryReader { geo in
            ZStack {
                CameraPreview(
                    session: camera.session,
                    onTapToFocus: { devicePoint, layerPoint in
                        camera.focus(at: devicePoint)
                        showFocus(at: layerPoint)
                    },
                    onPinch: { scale in
                        camera.setZoom(camera.zoomFactor * scale)
                    }
                )
                .ignoresSafeArea()

                gridOverlay

                if camera.showCapturePulse {
                    Color.black.opacity(0.6).ignoresSafeArea()
                }

                if let point = focusIndicator, showFocusRing {
                    focusRing.position(point)
                }

                VStack {
                    topBar
                    Spacer()
                    zoomBadge
                    bottomBar
                }

                if let toast {
                    toastView(toast)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack {
            Button(action: camera.cycleFlashMode) {
                Image(systemName: flashIcon)
                    .font(.title2)
                    .foregroundStyle(camera.flashMode == .off ? .white : .yellow)
                    .frame(width: 44, height: 44)
            }

            Spacer()

            Button {
                library.refreshAlbums()
                showAlbumPicker = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.stack.fill")
                    Text(library.selectedAlbumTitle ?? "Camera Roll")
                        .lineLimit(1)
                        .font(.subheadline.weight(.semibold))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
                .foregroundStyle(.white)
            }

            Spacer()

            // Balances the flash button so the album pill stays centered.
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        HStack {
            // Last-shot thumbnail.
            Group {
                if let image = camera.lastCapturedImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Color.white.opacity(0.15)
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.6), lineWidth: 1))

            Spacer()

            // Shutter.
            Button(action: camera.capturePhoto) {
                ZStack {
                    Circle().stroke(.white, lineWidth: 4).frame(width: 74, height: 74)
                    Circle().fill(.white).frame(width: 60, height: 60)
                        .scaleEffect(camera.isCapturing ? 0.85 : 1.0)
                        .animation(.easeInOut(duration: 0.15), value: camera.isCapturing)
                }
            }
            .disabled(camera.isCapturing)

            Spacer()

            // Flip camera.
            Button(action: camera.switchCamera) {
                Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                    .font(.title)
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(.white.opacity(0.15), in: Circle())
            }
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 24)
    }

    // MARK: - Overlays

    private var gridOverlay: some View {
        GeometryReader { geo in
            Path { path in
                let w = geo.size.width, h = geo.size.height
                for i in 1...2 {
                    let x = w / 3 * CGFloat(i)
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: h))
                    let y = h / 3 * CGFloat(i)
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: w, y: y))
                }
            }
            .stroke(.white.opacity(0.2), lineWidth: 0.5)
        }
        .allowsHitTesting(false)
    }

    private var zoomBadge: some View {
        Text(String(format: "%.1f×", camera.zoomFactor))
            .font(.caption.weight(.bold).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.bottom, 12)
    }

    private var focusRing: some View {
        RoundedRectangle(cornerRadius: 6)
            .stroke(.yellow, lineWidth: 1.5)
            .frame(width: 78, height: 78)
            .transition(.scale.combined(with: .opacity))
    }

    private func toastView(_ text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.bottom, 130)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Helpers

    private var flashIcon: String {
        switch camera.flashMode {
        case .on:   return "bolt.fill"
        case .off:  return "bolt.slash.fill"
        default:    return "bolt.badge.a.fill"
        }
    }

    private func showFocus(at point: CGPoint) {
        focusIndicator = point
        withAnimation(.easeOut(duration: 0.2)) { showFocusRing = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.easeIn(duration: 0.3)) { showFocusRing = false }
        }
    }

    private func handleCapturedPhoto(_ image: UIImage) {
        library.save(image: image) { result in
            switch result {
            case .success(let albumTitle):
                showToast("Saved to \(albumTitle)")
            case .noPermission:
                showToast("Photo access needed to save")
            case .albumMissing:
                showToast("Album not found — saved to Camera Roll")
            case .failed(let message):
                showToast("Save failed: \(message)")
            }
        }
    }

    private func showToast(_ text: String) {
        withAnimation { toast = text }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation { toast = nil }
        }
    }

    // MARK: - Permission / error state

    private func permissionDenied(icon: String, message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(.yellow)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(.horizontal, 40)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.yellow)
        }
    }
}

#Preview {
    ContentView()
}
