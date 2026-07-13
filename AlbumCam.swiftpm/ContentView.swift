//
//  ContentView.swift
//  Roaster
//
//  The camera screen. A dark, Apple-Camera-style viewfinder: a top row of
//  translucent controls (flash, grid, self-timer) above the album
//  destination pill, and a bottom bar with the last shot, shutter, and
//  flip. Zoom presets sit just above the shutter. Active states use the
//  solar accent. Every capture auto-saves to the chosen album.
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
    @State private var gridOn = true
    @State private var timerIndex = 0
    @State private var countdown: Int?

    private let timerOptions = [0, 3, 10]
    private let accent = Solar.sunEdge

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch camera.status {
            case .configured:
                cameraInterface
            case .unauthorized:
                permissionDenied(icon: "camera.fill",
                                 message: "Camera access is required. Enable it in Settings › \(AppInfo.name).")
            case .failed:
                permissionDenied(icon: "exclamationmark.triangle.fill",
                                 message: "The camera could not be started.")
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

    // MARK: - Interface

    private var cameraInterface: some View {
        GeometryReader { geo in
            ZStack {
                CameraPreview(
                    session: camera.session,
                    onTapToFocus: { devicePoint, layerPoint in
                        camera.focus(at: devicePoint)
                        showFocus(at: layerPoint)
                    },
                    onPinch: { scale in camera.setDisplayZoom(camera.displayZoom * scale) }
                )
                .ignoresSafeArea()

                if gridOn { gridOverlay }
                if camera.showCapturePulse { Color.black.opacity(0.6).ignoresSafeArea() }
                if let point = focusIndicator, showFocusRing { focusRing.position(point) }

                scrims

                VStack(spacing: 0) {
                    topControls
                    Spacer()
                    VStack(spacing: 18) {
                        zoomBar
                        bottomBar
                    }
                }

                if let n = countdown { countdownView(n) }
                if let toast { toastView(toast) }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    private var scrims: some View {
        VStack {
            LinearGradient(colors: [.black.opacity(0.55), .clear],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 170)
            Spacer()
            LinearGradient(colors: [.clear, .black.opacity(0.6)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 230)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Top controls

    private var topControls: some View {
        VStack(spacing: 14) {
            HStack(spacing: 20) {
                circleButton(active: camera.flashMode == .on, action: camera.cycleFlashMode) {
                    Image(systemName: flashIcon)
                }
                circleButton(active: gridOn, action: { gridOn.toggle() }) {
                    Image(systemName: "square.grid.3x3")
                }
                circleButton(active: timerIndex != 0,
                             action: { timerIndex = (timerIndex + 1) % timerOptions.count }) {
                    if timerIndex == 0 {
                        Image(systemName: "timer")
                    } else {
                        Text("\(timerOptions[timerIndex])")
                    }
                }
            }
            albumPill
        }
        .padding(.top, 6)
    }

    private func circleButton<Content: View>(
        active: Bool,
        action: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Button(action: action) {
            content()
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(active ? .black : .white)
                .frame(width: 44, height: 44)
                .background(active ? accent : Color.white.opacity(0.14), in: Circle())
        }
    }

    private var albumPill: some View {
        Button {
            library.refreshAlbums()
            showAlbumPicker = true
        } label: {
            HStack(spacing: 8) {
                Circle().fill(accent).frame(width: 8, height: 8)
                Text(library.selectedAlbumTitle ?? "Camera Roll")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.bold))
                    .opacity(0.8)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(.ultraThinMaterial, in: Capsule())
            .foregroundStyle(.white)
        }
    }

    // MARK: - Zoom presets

    private var zoomBar: some View {
        HStack(spacing: 10) {
            ForEach(camera.zoomPresets, id: \.self) { preset in
                zoomButton(preset)
            }
        }
    }

    private func zoomButton(_ preset: CGFloat) -> some View {
        let active = abs(camera.displayZoom - preset) < 0.06
        return Button {
            camera.setDisplayZoom(preset)
        } label: {
            Text(zoomLabel(active ? camera.displayZoom : preset))
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(active ? accent : .white)
                .frame(minWidth: 46, minHeight: 34)
                .background(.black.opacity(active ? 0.55 : 0.3), in: Capsule())
        }
    }

    /// "0.5×" below 1×, whole numbers as "1×", others as "1.5×".
    private func zoomLabel(_ z: CGFloat) -> String {
        if z < 1 { return String(format: "%.1f×", z) }
        return z == z.rounded() ? String(format: "%.0f×", z) : String(format: "%.1f×", z)
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        HStack {
            Group {
                if let image = camera.lastCapturedImage {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    Color.white.opacity(0.12)
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.6), lineWidth: 1))

            Spacer()

            Button(action: onShutter) {
                ZStack {
                    Circle().stroke(.white, lineWidth: 4).frame(width: 74, height: 74)
                    Circle().fill(.white).frame(width: 60, height: 60)
                        .scaleEffect(camera.isCapturing ? 0.85 : 1.0)
                        .animation(.easeInOut(duration: 0.15), value: camera.isCapturing)
                }
            }
            .disabled(camera.isCapturing || countdown != nil)

            Spacer()

            Button(action: camera.switchCamera) {
                Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(.white.opacity(0.14), in: Circle())
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
                    path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: h))
                    let y = h / 3 * CGFloat(i)
                    path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: w, y: y))
                }
            }
            .stroke(.white.opacity(0.2), lineWidth: 0.5)
        }
        .allowsHitTesting(false)
    }

    private var focusRing: some View {
        RoundedRectangle(cornerRadius: 6)
            .stroke(accent, lineWidth: 1.5)
            .frame(width: 78, height: 78)
            .transition(.scale.combined(with: .opacity))
    }

    private func countdownView(_ n: Int) -> some View {
        Text("\(n)")
            .font(.system(size: 96, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .shadow(radius: 12)
            .transition(.scale.combined(with: .opacity))
    }

    private func toastView(_ text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.bottom, 150)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Actions

    private func onShutter() {
        let secs = timerOptions[timerIndex]
        if secs > 0 { startCountdown(from: secs) } else { camera.capturePhoto() }
    }

    private func startCountdown(from n: Int) {
        withAnimation { countdown = n }
        func tick() {
            guard let c = countdown else { return }
            if c <= 1 {
                withAnimation { countdown = nil }
                camera.capturePhoto()
            } else {
                withAnimation { countdown = c - 1 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: tick)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: tick)
    }

    private var flashIcon: String {
        switch camera.flashMode {
        case .on: return "bolt.fill"
        case .off: return "bolt.slash.fill"
        default: return "bolt.badge.a.fill"
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
            case .success(let albumTitle): showToast("Saved to \(albumTitle)")
            case .noPermission: showToast("Photo access needed to save")
            case .albumMissing: showToast("Album not found — saved to Camera Roll")
            case .failed(let message): showToast("Save failed: \(message)")
            }
        }
    }

    private func showToast(_ text: String) {
        withAnimation { toast = text }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation { toast = nil }
        }
    }

    private func permissionDenied(icon: String, message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: icon).font(.system(size: 48)).foregroundStyle(accent)
            Text(message).multilineTextAlignment(.center).foregroundStyle(.white).padding(.horizontal, 40)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            .buttonStyle(.borderedProminent).tint(accent)
        }
    }
}

#Preview {
    ContentView()
}
