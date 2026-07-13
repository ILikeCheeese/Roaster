//
//  RoasterApp.swift
//  Roaster
//
//  Entry point for the Roaster camera app.
//

import SwiftUI

@main
struct RoasterApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .statusBarHidden(true)
        }
    }
}

/// Shows the solar-system splash on launch, then reveals the camera.
struct RootView: View {
    @State private var showSplash = true

    var body: some View {
        ZStack {
            ContentView()
            if showSplash {
                SplashView {
                    withAnimation(.easeInOut(duration: 0.6)) { showSplash = false }
                }
                .transition(.opacity)
                .zIndex(1)
            }
        }
    }
}
