import AppKit
import SwiftUI

@main
struct GlucoBadgeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        if let iconURL = Bundle.main.url(
            forResource: "AppIcon",
            withExtension: "icns"
        ), let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
        AppState.shared.start()
        statusBarController = StatusBarController(appState: AppState.shared)
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppState.shared.stop()
        statusBarController = nil
    }
}
