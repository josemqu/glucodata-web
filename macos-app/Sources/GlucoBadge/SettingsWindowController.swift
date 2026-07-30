import AppKit
import SwiftUI

@MainActor
final class SettingsWindowController: NSObject, NSWindowDelegate {
    static let shared = SettingsWindowController()

    private var window: NSWindow?

    func show() {
        let settingsWindow: NSWindow

        if let window {
            settingsWindow = window
        } else {
            let newWindow = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 650),
                styleMask: [.titled, .closable, .miniaturizable],
                backing: .buffered,
                defer: false
            )
            newWindow.title = "Configuración de GlucoBadge"
            newWindow.isReleasedWhenClosed = false
            newWindow.center()
            newWindow.delegate = self
            newWindow.contentView = NSHostingView(
                rootView: SettingsView()
                    .environmentObject(AppState.shared)
            )
            window = newWindow
            settingsWindow = newWindow
        }

        NSApp.activate(ignoringOtherApps: true)
        settingsWindow.makeKeyAndOrderFront(nil)
    }

    func close() {
        window?.close()
    }
}
