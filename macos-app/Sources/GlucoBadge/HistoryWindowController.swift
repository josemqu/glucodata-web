import AppKit
import SwiftUI

extension Notification.Name {
    static let historyWindowRequestedRefresh = Notification.Name(
        "GlucoBadge.historyWindowRequestedRefresh"
    )
}

@MainActor
final class HistoryWindowController: NSObject, NSWindowDelegate {
    static let shared = HistoryWindowController()

    private var window: NSWindow?

    func show() {
        let historyWindow: NSWindow
        let shouldRefreshExistingWindow: Bool
        if let window {
            historyWindow = window
            shouldRefreshExistingWindow = true
        } else {
            let newWindow = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 760, height: 500),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            newWindow.title = "Historial de glucemia"
            newWindow.minSize = NSSize(width: 620, height: 420)
            newWindow.isReleasedWhenClosed = false
            newWindow.center()
            newWindow.delegate = self
            newWindow.contentView = NSHostingView(rootView: HistoryView())
            window = newWindow
            historyWindow = newWindow
            shouldRefreshExistingWindow = false
        }

        NSApp.activate(ignoringOtherApps: true)
        historyWindow.makeKeyAndOrderFront(nil)

        if shouldRefreshExistingWindow {
            NotificationCenter.default.post(name: .historyWindowRequestedRefresh, object: nil)
        }
    }
}
