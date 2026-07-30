import AppKit
import SwiftUI

private final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class OverlayPanelController {
    private static let positionXKey = "GlucoBadgeOverlayPositionX"
    private static let positionYKey = "GlucoBadgeOverlayPositionY"
    private static let hasPositionKey = "GlucoBadgeOverlayHasPosition"

    private let panel: FloatingPanel
    private var currentSize: BadgeSize
    private var moveObserver: NSObjectProtocol?

    init(initialSize: BadgeSize) {
        currentSize = initialSize
        panel = FloatingPanel(
            contentRect: NSRect(origin: .zero, size: initialSize.panelSize),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.animationBehavior = .utilityWindow

        panel.setFrameOrigin(Self.restoredOrigin(for: initialSize.panelSize))

        moveObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didMoveNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.persistPosition()
            }
        }
    }

    func setRootView<Content: View>(_ view: Content) {
        let hostingView = NSHostingView(rootView: view)
        hostingView.translatesAutoresizingMaskIntoConstraints = false
        panel.contentView = hostingView
    }

    func setShowOverFullScreen(_ enabled: Bool) {
        if enabled {
            panel.collectionBehavior = [
                .canJoinAllSpaces,
                .fullScreenAuxiliary,
                .stationary,
            ]
        } else {
            panel.collectionBehavior = [
                .canJoinAllSpaces,
                .stationary,
            ]
        }

        if panel.isVisible {
            panel.orderFrontRegardless()
        }
    }

    func setBadgeSize(_ size: BadgeSize) {
        guard size != currentSize else { return }

        let oldFrame = panel.frame
        let newSize = size.panelSize
        let newOrigin = NSPoint(
            x: oldFrame.midX - newSize.width / 2,
            y: oldFrame.midY - newSize.height / 2
        )
        panel.setFrame(
            NSRect(origin: newOrigin, size: newSize),
            display: true,
            animate: panel.isVisible
        )
        currentSize = size
        persistPosition()
    }

    func show() {
        panel.orderFrontRegardless()
    }

    func hide() {
        panel.orderOut(nil)
    }

    func persistPosition() {
        let origin = panel.frame.origin
        let defaults = UserDefaults.standard
        defaults.set(origin.x, forKey: Self.positionXKey)
        defaults.set(origin.y, forKey: Self.positionYKey)
        defaults.set(true, forKey: Self.hasPositionKey)
    }

    private static func restoredOrigin(for size: NSSize) -> NSPoint {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: hasPositionKey) else {
            return defaultOrigin(for: size)
        }

        let saved = NSPoint(
            x: defaults.double(forKey: positionXKey),
            y: defaults.double(forKey: positionYKey)
        )
        let proposedFrame = NSRect(origin: saved, size: size)
        let isVisible = NSScreen.screens.contains { screen in
            screen.visibleFrame.intersection(proposedFrame).width >= 40
                && screen.visibleFrame.intersection(proposedFrame).height >= 40
        }
        return isVisible ? saved : defaultOrigin(for: size)
    }

    private static func defaultOrigin(for size: NSSize) -> NSPoint {
        guard let screen = NSScreen.main else {
            return NSPoint(x: 40, y: 40)
        }
        let visible = screen.visibleFrame
        return NSPoint(
            x: visible.maxX - size.width - 24,
            y: visible.maxY - size.height - 24
        )
    }
}
