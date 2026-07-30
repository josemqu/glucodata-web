import AppKit

@MainActor
final class StatusBarController: NSObject, NSMenuDelegate {
    private let appState: AppState
    private let statusItem: NSStatusItem
    private let statusMenu = NSMenu()
    private let readingItem = NSMenuItem()
    private let visibilityItem = NSMenuItem()
    private let fullScreenItem = NSMenuItem()
    private let sizeMenu = NSMenu()

    init(appState: AppState) {
        self.appState = appState
        statusItem = NSStatusBar.system.statusItem(
            withLength: NSStatusItem.squareLength
        )
        super.init()

        configureButton()
        configureMenu()
    }

    private func configureButton() {
        guard let button = statusItem.button else { return }
        let configuration = NSImage.SymbolConfiguration(
            pointSize: 15,
            weight: .semibold
        )
        let image = NSImage(
            systemSymbolName: "drop.fill",
            accessibilityDescription: "GlucoBadge"
        )?.withSymbolConfiguration(configuration)
        image?.isTemplate = true
        button.image = image
        button.imagePosition = .imageOnly
        button.toolTip = "GlucoBadge"
        button.setAccessibilityLabel("GlucoBadge")
    }

    private func configureMenu() {
        statusMenu.delegate = self

        readingItem.isEnabled = false
        statusMenu.addItem(readingItem)
        statusMenu.addItem(.separator())

        visibilityItem.target = self
        visibilityItem.action = #selector(toggleBadge)
        statusMenu.addItem(visibilityItem)

        fullScreenItem.title = "Mostrar sobre pantalla completa"
        fullScreenItem.target = self
        fullScreenItem.action = #selector(toggleFullScreen)
        statusMenu.addItem(fullScreenItem)

        for size in BadgeSize.allCases {
            let item = NSMenuItem(
                title: size.label,
                action: #selector(selectSize(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = size.rawValue
            sizeMenu.addItem(item)
        }
        let sizeItem = NSMenuItem(title: "Tamaño", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizeMenu
        statusMenu.addItem(sizeItem)

        statusMenu.addItem(.separator())

        let refreshItem = NSMenuItem(
            title: "Actualizar ahora",
            action: #selector(refresh),
            keyEquivalent: "r"
        )
        refreshItem.target = self
        statusMenu.addItem(refreshItem)

        let settingsItem = NSMenuItem(
            title: "Configuración…",
            action: #selector(openSettings),
            keyEquivalent: ","
        )
        settingsItem.target = self
        statusMenu.addItem(settingsItem)

        statusMenu.addItem(.separator())

        let quitItem = NSMenuItem(
            title: "Salir de GlucoBadge",
            action: #selector(quit),
            keyEquivalent: "q"
        )
        quitItem.target = self
        statusMenu.addItem(quitItem)

        statusItem.menu = statusMenu
        updateMenu()
    }

    func menuWillOpen(_ menu: NSMenu) {
        updateMenu()
    }

    private func updateMenu() {
        if let reading = appState.reading {
            readingItem.title =
                "\(reading.value) \(reading.trendSymbol) · \(appState.readingAgeText)"
        } else {
            readingItem.title = appState.statusText
        }

        visibilityItem.title = appState.isBadgeVisible
            ? "Ocultar badge"
            : "Mostrar badge"

        let defaults = UserDefaults.standard
        fullScreenItem.state = defaults.bool(
            forKey: SettingsKey.showOverFullScreen
        ) ? .on : .off

        let selectedSize = defaults.string(forKey: SettingsKey.badgeSize)
            ?? BadgeSize.normal.rawValue
        for item in sizeMenu.items {
            item.state = (item.representedObject as? String) == selectedSize
                ? .on
                : .off
        }
    }

    @objc private func toggleBadge() {
        appState.toggleBadge()
        updateMenu()
    }

    @objc private func toggleFullScreen() {
        let enabled = fullScreenItem.state != .on
        UserDefaults.standard.set(
            enabled,
            forKey: SettingsKey.showOverFullScreen
        )
        appState.setShowOverFullScreen(enabled)
        updateMenu()
    }

    @objc private func selectSize(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let size = BadgeSize(rawValue: rawValue)
        else {
            return
        }
        UserDefaults.standard.set(rawValue, forKey: SettingsKey.badgeSize)
        appState.setBadgeSize(size)
        updateMenu()
    }

    @objc private func refresh() {
        Task { await appState.refresh() }
    }

    @objc private func openSettings() {
        appState.openSettings()
    }

    @objc private func quit() {
        appState.quit()
    }
}
