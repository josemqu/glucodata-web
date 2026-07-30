// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "GlucoBadge",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "GlucoBadge", targets: ["GlucoBadge"])
    ],
    targets: [
        .executableTarget(
            name: "GlucoBadge",
            path: "Sources/GlucoBadge"
        )
    ]
)
