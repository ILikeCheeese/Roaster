// swift-tools-version: 5.9

// The Package.swift for a Swift Playgrounds "App" project.
// Open this .swiftpm folder in Swift Playgrounds on iPad, or in Xcode on Mac.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "AlbumCam",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "AlbumCam",
            targets: ["AppModule"],
            bundleIdentifier: "com.albumcam.AlbumCam",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .asset("AppIcon"),
            accentColor: .presetColor(.yellow),
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait
            ],
            capabilities: [
                .camera(purposeString: "AlbumCam needs camera access to take photos."),
                .photoLibrary(purposeString: "AlbumCam needs photo library access to list your albums and save the photos you take into them.")
            ],
            appCategory: .photoAndVideo
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: ".",
            resources: [
                .process("Assets.xcassets")
            ]
        )
    ]
)
