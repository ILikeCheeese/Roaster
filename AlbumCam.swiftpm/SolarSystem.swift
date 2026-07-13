//
//  SolarSystem.swift
//  Roaster
//
//  A realistic 8-planet solar system rendered in SwiftUI: a glowing sun,
//  faint orbit rings, and shaded planet spheres (Saturn keeps its ring).
//  The palette mirrors scripts/make_icon.py so the app icon and the
//  in-app animation match. Driven by an array of per-planet angles so the
//  splash screen can orbit them and settle them into a line.
//

import SwiftUI

// MARK: - Data

struct PlanetSpec: Identifiable {
    let id = UUID()
    let name: String
    let orbit: CGFloat          // orbit radius as a fraction of the system size
    let radius: CGFloat         // planet radius as a fraction of the system size
    let base: RGB
    let hasRing: Bool
}

struct RGB {
    let r, g, b: Double
    var color: Color { Color(red: r/255, green: g/255, blue: b/255) }
    func scaled(_ f: Double) -> Color {
        Color(red: min(r*f, 255)/255, green: min(g*f, 255)/255, blue: min(b*f, 255)/255)
    }
}

enum Solar {
    /// Order + colors match the icon generator. Sizes here favour realistic
    /// *proportions* (gas giants dominate) for the launch animation, rather
    /// than the enlarged planets used in the Home Screen icon.
    static let planets: [PlanetSpec] = [
        PlanetSpec(name: "Mercury", orbit: 0.128, radius: 0.010, base: RGB(r: 150, g: 141, b: 130), hasRing: false),
        PlanetSpec(name: "Venus",   orbit: 0.170, radius: 0.015, base: RGB(r: 222, g: 190, b: 128), hasRing: false),
        PlanetSpec(name: "Earth",   orbit: 0.213, radius: 0.016, base: RGB(r: 56,  g: 110, b: 200), hasRing: false),
        PlanetSpec(name: "Mars",    orbit: 0.256, radius: 0.011, base: RGB(r: 188, g: 78,  b: 42),  hasRing: false),
        PlanetSpec(name: "Jupiter", orbit: 0.320, radius: 0.044, base: RGB(r: 201, g: 165, b: 120), hasRing: false),
        PlanetSpec(name: "Saturn",  orbit: 0.392, radius: 0.037, base: RGB(r: 223, g: 201, b: 158), hasRing: true),
        PlanetSpec(name: "Uranus",  orbit: 0.440, radius: 0.026, base: RGB(r: 168, g: 220, b: 224), hasRing: false),
        PlanetSpec(name: "Neptune", orbit: 0.480, radius: 0.025, base: RGB(r: 58,  g: 92,  b: 205), hasRing: false),
    ]

    /// Accent colors surfaced to the rest of the UI.
    static let sunCore = Color(red: 1.0, green: 0.965, blue: 0.878)
    static let sunEdge = Color(red: 1.0, green: 0.69, blue: 0.235)
    static let earth = Color(red: 56/255, green: 110/255, blue: 200/255)
    static let space = Color(red: 7/255, green: 10/255, blue: 18/255)
}

// MARK: - Views

struct SolarSystemView: View {
    /// One angle (radians) per planet, same order as `Solar.planets`.
    var angles: [Double]
    var orbitOpacity: Double = 1.0

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                // Orbit rings.
                ForEach(Solar.planets.indices, id: \.self) { i in
                    Circle()
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                        .frame(width: Solar.planets[i].orbit * s * 2,
                               height: Solar.planets[i].orbit * s * 2)
                        .position(center)
                }
                .opacity(orbitOpacity)

                SunView(diameter: s * 0.15).position(center)

                // Planets.
                ForEach(Solar.planets.indices, id: \.self) { i in
                    let p = Solar.planets[i]
                    let ang = i < angles.count ? angles[i] : 0
                    let R = p.orbit * s
                    PlanetView(spec: p, diameter: p.radius * s * 2, angle: ang)
                        .position(x: center.x + R * cos(ang),
                                  y: center.y + R * sin(ang))
                }
            }
        }
    }
}

struct SunView: View {
    let diameter: CGFloat
    var body: some View {
        ZStack {
            Circle()
                .fill(Solar.sunEdge)
                .frame(width: diameter * 2.6, height: diameter * 2.6)
                .blur(radius: diameter * 0.7)
                .opacity(0.45)
            Circle()
                .fill(RadialGradient(
                    colors: [Solar.sunCore, Solar.sunEdge],
                    center: .center, startRadius: 0, endRadius: diameter * 0.55))
                .frame(width: diameter, height: diameter)
        }
    }
}

struct PlanetView: View {
    let spec: PlanetSpec
    let diameter: CGFloat
    let angle: Double

    var body: some View {
        // Highlight faces the sun (system center).
        let hx = 0.5 - 0.36 * cos(angle)
        let hy = 0.5 - 0.36 * sin(angle)
        ZStack {
            Circle()
                .fill(spec.base.color)
                .frame(width: diameter * 1.5, height: diameter * 1.5)
                .blur(radius: diameter * 0.28)
                .opacity(0.35)

            if spec.hasRing {
                Ellipse()
                    .stroke(spec.base.scaled(1.1).opacity(0.9), lineWidth: diameter * 0.11)
                    .frame(width: diameter * 2.2, height: diameter * 0.78)
                    .rotationEffect(.degrees(-18))
            }

            Circle()
                .fill(RadialGradient(
                    colors: [spec.base.scaled(1.45), spec.base.color, spec.base.scaled(0.35)],
                    center: UnitPoint(x: hx, y: hy),
                    startRadius: 0, endRadius: diameter * 0.72))
                .frame(width: diameter, height: diameter)
        }
    }
}
