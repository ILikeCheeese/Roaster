//
//  CameraManager.swift
//  Roaster
//
//  Wraps AVFoundation to run the capture session and take photos.
//  Exposes the camera controls the UI needs: flip, flash, zoom, focus.
//

import AVFoundation
import UIKit

@MainActor
final class CameraManager: NSObject, ObservableObject {

    enum Status {
        case unconfigured
        case configured
        case unauthorized
        case failed
    }

    // MARK: - Published UI state

    @Published var status: Status = .unconfigured
    @Published var flashMode: AVCaptureDevice.FlashMode = .auto
    @Published var cameraPosition: AVCaptureDevice.Position = .back
    @Published var isCapturing = false
    /// Zoom as shown to the user (0.5, 1, 2 …), like the Camera app.
    @Published var displayZoom: CGFloat = 1.0
    @Published var minDisplayZoom: CGFloat = 1.0
    @Published var showCapturePulse = false
    /// Most recently captured still, handed to the save layer.
    @Published var lastCapturedImage: UIImage?

    // MARK: - Session

    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.roaster.sessionQueue")
    private let photoOutput = AVCapturePhotoOutput()
    private var videoDeviceInput: AVCaptureDeviceInput?

    /// Callback fired on the main actor when a photo finishes processing.
    var onPhotoCaptured: ((UIImage) -> Void)?

    // MARK: - Permissions

    func checkPermissionsAndConfigure() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configure()
        case .notDetermined:
            sessionQueue.suspend()
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard let self else { return }
                if !granted {
                    Task { @MainActor in self.status = .unauthorized }
                }
                self.sessionQueue.resume()
                if granted { self.configure() }
            }
        default:
            status = .unauthorized
        }
    }

    // MARK: - Configuration

    private func configure() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo

            do {
                try self.addVideoInput(position: .back)

                if self.session.canAddOutput(self.photoOutput) {
                    self.session.addOutput(self.photoOutput)
                    self.photoOutput.maxPhotoQualityPrioritization = .quality
                } else {
                    self.session.commitConfiguration()
                    Task { @MainActor in self.status = .failed }
                    return
                }

                self.session.commitConfiguration()
                Task { @MainActor in self.status = .configured }
                self.startSession()
            } catch {
                self.session.commitConfiguration()
                Task { @MainActor in self.status = .failed }
            }
        }
    }

    /// Adds (or replaces) the camera input for the given position.
    private func addVideoInput(position: AVCaptureDevice.Position) throws {
        if let current = videoDeviceInput {
            session.removeInput(current)
        }

        guard let device = Self.bestDevice(for: position) else {
            throw CameraError.deviceUnavailable
        }

        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else {
            throw CameraError.cannotAddInput
        }
        session.addInput(input)
        videoDeviceInput = input

        // Start at 1.0× (the wide lens). On a dual-wide device the wide lens
        // sits at the switch-over factor; below it is the 0.5× ultra-wide.
        let switchOver = Self.switchOverFactor(for: device)
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = switchOver
            device.unlockForConfiguration()
        } catch { }
        let minDisplay = device.minAvailableVideoZoomFactor / switchOver

        Task { @MainActor in
            self.cameraPosition = position
            self.minDisplayZoom = minDisplay
            self.displayZoom = 1.0
        }
    }

    /// The raw zoom factor that corresponds to the user-facing "1.0×".
    private static func switchOverFactor(for device: AVCaptureDevice) -> CGFloat {
        device.virtualDeviceSwitchOverVideoZoomFactors.first
            .map { CGFloat(truncating: $0) } ?? 1.0
    }

    private static func bestDevice(for position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        // Back: prefer the dual-wide virtual device so 0.5× is available.
        let types: [AVCaptureDevice.DeviceType] = position == .back
            ? [.builtInDualWideCamera, .builtInWideAngleCamera]
            : [.builtInWideAngleCamera, .builtInTrueDepthCamera]
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: types,
            mediaType: .video,
            position: position
        )
        return discovery.devices.first
    }

    // MARK: - Session lifecycle

    func startSession() {
        sessionQueue.async { [weak self] in
            guard let self, !self.session.isRunning else { return }
            self.session.startRunning()
        }
    }

    func stopSession() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    // MARK: - Controls

    func switchCamera() {
        let newPosition: AVCaptureDevice.Position = cameraPosition == .back ? .front : .back
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            do {
                try self.addVideoInput(position: newPosition)
            } catch {
                // Roll back to the previous camera if the flip fails.
                try? self.addVideoInput(position: newPosition == .back ? .front : .back)
            }
            self.session.commitConfiguration()
        }
    }

    func cycleFlashMode() {
        switch flashMode {
        case .auto: flashMode = .on
        case .on:   flashMode = .off
        default:    flashMode = .auto
        }
    }

    /// Lens presets to offer, matching the device's fixed focal lengths:
    /// 0.5×/1× on iPhone 14's dual-wide back camera, 1× on the front.
    var zoomPresets: [CGFloat] {
        minDisplayZoom <= 0.5 ? [0.5, 1.0] : [1.0]
    }

    /// Sets zoom from the user-facing value (0.5, 1, 2 …), converting to the
    /// device's raw factor via the lens switch-over point.
    func setDisplayZoom(_ display: CGFloat) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.videoDeviceInput?.device else { return }
            let switchOver = Self.switchOverFactor(for: device)
            let maxFactor = min(device.maxAvailableVideoZoomFactor, 8.0 * switchOver)
            let clamped = max(device.minAvailableVideoZoomFactor,
                              min(display * switchOver, maxFactor))
            do {
                try device.lockForConfiguration()
                device.videoZoomFactor = clamped
                device.unlockForConfiguration()
                Task { @MainActor in self.displayZoom = clamped / switchOver }
            } catch { }
        }
    }

    /// Focus + expose at a normalized point (0...1) coming from a tap.
    func focus(at point: CGPoint) {
        sessionQueue.async { [weak self] in
            guard let self, let device = self.videoDeviceInput?.device else { return }
            do {
                try device.lockForConfiguration()
                if device.isFocusPointOfInterestSupported {
                    device.focusPointOfInterest = point
                    device.focusMode = .autoFocus
                }
                if device.isExposurePointOfInterestSupported {
                    device.exposurePointOfInterest = point
                    device.exposureMode = .autoExpose
                }
                device.unlockForConfiguration()
            } catch { }
        }
    }

    // MARK: - Capture

    func capturePhoto() {
        guard status == .configured, !isCapturing else { return }
        isCapturing = true

        // Quick shutter animation cue for the UI.
        showCapturePulse = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            self.showCapturePulse = false
        }

        let position = cameraPosition
        let selectedFlash = flashMode

        sessionQueue.async { [weak self] in
            guard let self else { return }
            let settings = AVCapturePhotoSettings()
            if self.photoOutput.supportedFlashModes.contains(selectedFlash) {
                settings.flashMode = selectedFlash
            }
            settings.photoQualityPrioritization = .quality

            // Mirror front-camera stills so they match the live preview.
            if let connection = self.photoOutput.connection(with: .video),
               connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = (position == .front)
            }

            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    enum CameraError: Error {
        case deviceUnavailable
        case cannotAddInput
    }
}

// MARK: - AVCapturePhotoCaptureDelegate

extension CameraManager: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput,
                                 didFinishProcessingPhoto photo: AVCapturePhoto,
                                 error: Error?) {
        defer {
            Task { @MainActor in self.isCapturing = false }
        }
        guard error == nil,
              let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else {
            return
        }
        Task { @MainActor in
            self.lastCapturedImage = image
            self.onPhotoCaptured?(image)
        }
    }
}
