//
//  SplashView.swift
//  Roaster
//
//  App-open animation: the eight planets orbit the sun, then ease into a
//  perfect line (a planetary alignment) before handing off to the camera.
//

import SwiftUI

/// Single place to change the app's display name / tagline.
enum AppInfo {
    static let name = "Roaster"
    static let tagline = "Every shot, in orbit."
}

struct SplashView: View {
    var onFinished: () -> Void

    // Timeline (seconds).
    private let orbitDur = 2.4
    private let alignDur = 1.7
    private let holdDur = 0.6
    private var total: Double { orbitDur + alignDur + holdDur }

    // Per-planet motion. Inner planets orbit faster (like the real thing).
    private let startAngles: [Double] = [-50, 150, 25, -120, 68, -20, 200, 110]
        .map { $0 * .pi / 180 }
    private let speeds: [Double] = [1.7, 1.35, 1.15, 0.98, 0.78, 0.64, 0.52, 0.44]
    private let alignAngle: Double = -18 * .pi / 180   // the line they settle into

    @State private var startDate = Date()
    @State private var finished = false

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSince(startDate)
            let angles = (0..<Solar.planets.count).map { angle(index: $0, t: t) }
            let orbitFade = 1.0 - smoothstep(clamp01((t - orbitDur) / alignDur))

            ZStack {
                Solar.space.ignoresSafeArea()
                Starfield().ignoresSafeArea().opacity(0.8)

                SolarSystemView(angles: angles, orbitOpacity: orbitFade)

                VStack {
                    Spacer()
                    Text(AppInfo.name)
                        .font(.system(size: 40, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .tracking(6)
                        .opacity(smoothstep(clamp01((t - orbitDur * 0.6) / 1.2)))
                    Text(AppInfo.tagline)
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.55))
                        .tracking(2)
                        .opacity(smoothstep(clamp01((t - orbitDur) / 1.2)))
                        .padding(.top, 2)
                    Spacer().frame(height: 90)
                }
            }
            .onChange(of: t >= total) { _, reached in
                guard reached, !finished else { return }
                finished = true
                onFinished()
            }
        }
        .onAppear { startDate = Date() }
    }

    /// Orbiting, then a smooth ease into the alignment angle (always moving
    /// forward to the nearest equivalent of `alignAngle`).
    private func angle(index i: Int, t: Double) -> Double {
        let s0 = startAngles[i]
        if t <= orbitDur {
            return s0 + speeds[i] * t
        }
        let atEnd = s0 + speeds[i] * orbitDur
        var target = alignAngle
        while target < atEnd { target += 2 * .pi }
        let e = smoothstep(clamp01((t - orbitDur) / alignDur))
        return atEnd + (target - atEnd) * e
    }
}

// MARK: - Helpers

private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }
private func smoothstep(_ x: Double) -> Double { x * x * (3 - 2 * x) }

/// A cheap, static starfield drawn with Canvas.
struct Starfield: View {
    var body: some View {
        Canvas { ctx, size in
            var seed: UInt64 = 0x9E3779B97F4A7C15
            func rnd() -> Double {
                seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17
                return Double(seed % 10_000) / 10_000
            }
            for _ in 0..<160 {
                let x = rnd() * size.width
                let y = rnd() * size.height
                let r = rnd() * 1.4 + 0.3
                let b = 0.3 + rnd() * 0.6
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r, height: r)),
                         with: .color(.white.opacity(b)))
            }
        }
    }
}
