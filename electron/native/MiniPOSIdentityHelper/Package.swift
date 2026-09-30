// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MiniPOSIdentityHelper",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "MiniPOSIdentityHelper",
            path: "Sources/MiniPOSIdentityHelper"
        )
    ]
)
