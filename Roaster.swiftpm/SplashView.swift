//
//  SplashView.swift
//  Roaster
//
//  App-open animation:
//   1. the planets spin fast around the sun (beyblade),
//   2. they decelerate and settle into a vertical line pointing up,
//   3. the scene splits down the middle and opens like curtains,
//      revealing the camera underneath.
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
    private let spinDur = 1.7        // fast beyblade spin
    private let alignDur = 1.15      // decelerate into the vertical line
    private let holdDur = 0.35       // brief pause on the aligned line
    private let curtainDur = 0.9     // curtains part

    // Fast angular speeds (rad/s); inner planets whirl faster.
    private let spinSpeeds: [Double] = [12.5, 11.3, 10.2, 9.3, 8.2, 7.4, 6.7, 6.0]
    private let startAngles: [Double] = [-40, 150, 35, -110, 70, -15, 205, 95]
        .map { $0 * .pi / 180 }
    private let alignAngle: Double = -.pi / 2   // straight up

    @State private var startDate = Date()
    @State private var opening = false          // curtain phase active
    @State private var curtainsParted = false   // drives the open animation
    @State private var finished = false

    private var alignedAngles: [Double] {
        Array(repeating: alignAngle, count: Solar.planets.count)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if opening {
                    curtains(width: geo.size.width)
                } else {
                    TimelineView(.animation) { timeline in
                        let t = timeline.date.timeIntervalSince(startDate)
                        animatingScene(t: t)
                            .onChange(of: t >= spinDur + alignDur + holdDur) { _, reached in
                                guard reached, !opening else { return }
                                beginCurtains()
                            }
                    }
                }
            }
        }
        .ignoresSafeArea()
        .onAppear { startDate = Date() }
    }

    // MARK: - Phase 1+2: spin then align

    @ViewBuilder
    private func animatingScene(t: Double) -> some View {
        let angles = (0..<Solar.planets.count).map { angle(index: $0, t: t) }
        let orbitFade = 1.0 - smoothstep(clamp01((t - spinDur) / alignDur))
        ZStack {
            sceneBackground
            SolarSystemView(angles: angles, orbitOpacity: orbitFade)
            wordmark(t: t)
        }
    }

    /// Fast spin, then ease-out into the nearest upward alignment.
    private func angle(index i: Int, t: Double) -> Double {
        let s0 = startAngles[i]
        if t <= spinDur {
            return s0 + spinSpeeds[i] * t
        }
        let atEnd = s0 + spinSpeeds[i] * spinDur
        var target = alignAngle
        while target < atEnd { target += 2 * .pi }
        let e = easeOutCubic(clamp01((t - spinDur) / alignDur))
        return atEnd + (target - atEnd) * e
    }

    private func wordmark(t: Double) -> some View {
        let appear = smoothstep(clamp01((t - 0.5) / 1.0))
        let fade = 1.0 - smoothstep(clamp01((t - (spinDur + alignDur * 0.45)) / 0.55))
        return VStack(spacing: 4) {
            Spacer()
            Text(AppInfo.name)
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .tracking(6)
            Text(AppInfo.tagline)
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.55))
                .tracking(2)
            Spacer().frame(height: 96)
        }
        .opacity(appear * fade)
    }

    // MARK: - Phase 3: curtains

    private func beginCurtains() {
        opening = true
        withAnimation(.easeInOut(duration: curtainDur)) { curtainsParted = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + curtainDur) {
            guard !finished else { return }
            finished = true
            onFinished()
        }
    }

    /// Two copies of the aligned scene, each masked to one half, sliding
    /// apart so the vertical planet line splits down the middle.
    private func curtains(width w: CGFloat) -> some View {
        let dx = curtainsParted ? w / 2 + 4 : 0
        return ZStack {
            alignedScene
                .mask { HStack(spacing: 0) { Color.black; Color.clear } }
                .offset(x: -dx)
            alignedScene
                .mask { HStack(spacing: 0) { Color.clear; Color.black } }
                .offset(x: dx)
        }
    }

    private var alignedScene: some View {
        ZStack {
            sceneBackground
            SolarSystemView(angles: alignedAngles, orbitOpacity: 0)
        }
    }

    private var sceneBackground: some View {
        ZStack {
            Solar.space
            Starfield().opacity(0.8)
        }
    }
}

// MARK: - Helpers

private func clamp01(_ x: Double) -> Double { max(0, min(1, x)) }
private func smoothstep(_ x: Double) -> Double { x * x * (3 - 2 * x) }
private func easeOutCubic(_ x: Double) -> Double { 1 - pow(1 - x, 3) }

/// A cheap, static starfield drawn with Canvas (fixed seed → stable across
/// the animating and curtain phases so the split is seamless).
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
