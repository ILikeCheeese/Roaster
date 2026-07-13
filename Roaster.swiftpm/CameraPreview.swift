//
//  CameraPreview.swift
//  Roaster
//
//  SwiftUI bridge to an AVCaptureVideoPreviewLayer, plus the gesture
//  overlays for pinch-to-zoom and tap-to-focus.
//

import SwiftUI
import AVFoundation

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    /// Called with a normalized device point (0...1) when the user taps.
    var onTapToFocus: (CGPoint, CGPoint) -> Void
    /// Called continuously during a pinch with the accumulated scale.
    var onPinch: (CGFloat) -> Void

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.videoPreviewLayer.session = session
        view.videoPreviewLayer.videoGravity = .resizeAspectFill

        let pinch = UIPinchGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handlePinch(_:))
        )
        view.addGestureRecognizer(pinch)

        let tap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap(_:))
        )
        view.addGestureRecognizer(tap)

        context.coordinator.view = view
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) { }

    func makeCoordinator() -> Coordinator {
        Coordinator(onTapToFocus: onTapToFocus, onPinch: onPinch)
    }

    final class Coordinator: NSObject {
        weak var view: PreviewView?
        let onTapToFocus: (CGPoint, CGPoint) -> Void
        let onPinch: (CGFloat) -> Void

        init(onTapToFocus: @escaping (CGPoint, CGPoint) -> Void,
             onPinch: @escaping (CGFloat) -> Void) {
            self.onTapToFocus = onTapToFocus
            self.onPinch = onPinch
        }

        @objc func handlePinch(_ gesture: UIPinchGestureRecognizer) {
            // Apply the incremental scale and reset so each callback is a
            // delta relative to the current zoom — avoids compounding jumps.
            switch gesture.state {
            case .changed:
                onPinch(gesture.scale)
                gesture.scale = 1.0
            default:
                break
            }
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let view else { return }
            let location = gesture.location(in: view)
            let devicePoint = view.videoPreviewLayer.captureDevicePointConverted(
                fromLayerPoint: location
            )
            onTapToFocus(devicePoint, location)
        }
    }
}

/// Backing UIView whose layer *is* the preview layer.
final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var videoPreviewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}
