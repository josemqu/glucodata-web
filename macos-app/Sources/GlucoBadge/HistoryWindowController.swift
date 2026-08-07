import AppKit
import SwiftUI

@MainActor
final class HistoryWindowController: NSObject, NSWindowDelegate {
    static let shared = HistoryWindowController()

    private var window: NSWindow?

    func show() {
        let historyWindow: NSWindow
        if let window {
            historyWindow = window
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
        }

        NSApp.activate(ignoringOtherApps: true)
        historyWindow.makeKeyAndOrderFront(nil)
    }
}
