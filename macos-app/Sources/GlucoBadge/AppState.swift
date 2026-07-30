import AppKit
import Combine
import SwiftUI

enum SettingsKey {
    static let apiURL = "apiURL"
    static let refreshInterval = "refreshInterval"
    static let showOverFullScreen = "showOverFullScreen"
    static let badgeSize = "badgeSize"
    static let launchAtLogin = "launchAtLogin"
}

@MainActor
final class AppState: ObservableObject {
    private enum RefreshOutcome {
        case completed
        case retryableFailure
        case configurationMissing
    }

    static let shared = AppState()

    @Published private(set) var reading: GlucoseReading?
    @Published private(set) var statusText = "Esperando datos…"
    @Published private(set) var isLoading = false
    @Published private(set) var isBadgeVisible = true
    @Published private(set) var launchAtLoginMessage = ""

    private lazy var overlayController: OverlayPanelController = {
        let rawSize = UserDefaults.standard.string(forKey: SettingsKey.badgeSize) ?? ""
        let controller = OverlayPanelController(
            initialSize: BadgeSize(rawValue: rawSize) ?? .normal
        )
        controller.setRootView(BadgeView().environmentObject(self))
        return controller
    }()
    private var refreshTimer: Timer?
    private var startupRefreshTask: Task<Void, Never>?

    private init() {
        UserDefaults.standard.register(defaults: [
            SettingsKey.apiURL: "https://glucodata-web.vercel.app/api/latest",
            SettingsKey.refreshInterval: 60.0,
            SettingsKey.showOverFullScreen: true,
            SettingsKey.badgeSize: BadgeSize.normal.rawValue,
            SettingsKey.launchAtLogin: true,
        ])
    }

    var menuBarTitle: String {
        guard let reading else { return "—" }
        return "\(reading.value) \(reading.trendSymbol)"
    }

    var readingAgeText: String {
        guard let reading else { return statusText }
        let minutes = max(0, Int(Date().timeIntervalSince(reading.date) / 60))
        if minutes == 0 { return "Ahora" }
        if minutes == 1 { return "Hace 1 minuto" }
        return "Hace \(minutes) minutos"
    }

    var isReadingStale: Bool {
        guard let reading else { return true }
        return Date().timeIntervalSince(reading.date) > 15 * 60
    }

    func start() {
        let showOverFullScreen = UserDefaults.standard.bool(forKey: SettingsKey.showOverFullScreen)
        overlayController.setShowOverFullScreen(showOverFullScreen)
        let rawSize = UserDefaults.standard.string(forKey: SettingsKey.badgeSize) ?? ""
        overlayController.setBadgeSize(BadgeSize(rawValue: rawSize) ?? .normal)
        overlayController.show()
        setLaunchAtLogin(
            UserDefaults.standard.bool(forKey: SettingsKey.launchAtLogin)
        )
        scheduleRefresh()
        startStartupRefresh()
    }

    func stop() {
        startupRefreshTask?.cancel()
        startupRefreshTask = nil
        refreshTimer?.invalidate()
        refreshTimer = nil
        overlayController.persistPosition()
    }

    func scheduleRefresh() {
        refreshTimer?.invalidate()
        let configured = UserDefaults.standard.double(forKey: SettingsKey.refreshInterval)
        let interval = max(30, configured)
        refreshTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            Task { @MainActor in
                await AppState.shared.refresh()
            }
        }
    }

    private func startStartupRefresh() {
        startupRefreshTask?.cancel()
        startupRefreshTask = Task { @MainActor [weak self] in
            guard let self else { return }

            let configured = UserDefaults.standard.double(
                forKey: SettingsKey.refreshInterval
            )
            let regularRefreshInterval = max(30, configured)
            let retryInterval = min(5, regularRefreshInterval)
            let deadline = Date().addingTimeInterval(regularRefreshInterval)

            while !Task.isCancelled {
                let outcome = await performRefresh()
                guard case .retryableFailure = outcome, Date() < deadline else {
                    return
                }

                do {
                    try await Task.sleep(
                        for: .seconds(retryInterval)
                    )
                } catch {
                    return
                }
            }
        }
    }

    @discardableResult
    private func performRefresh() async -> RefreshOutcome {
        guard !isLoading else { return .retryableFailure }
        isLoading = true
        defer { isLoading = false }

        let urlString = UserDefaults.standard.string(forKey: SettingsKey.apiURL) ?? ""
        let token = KeychainStore.readToken()

        guard let url = URL(string: urlString), !urlString.isEmpty else {
            statusText = "Configurá la URL del servicio"
            return .configurationMissing
        }
        guard !token.isEmpty else {
            statusText = "Configurá el token de acceso"
            return .configurationMissing
        }

        do {
            let response = try await GlucoseAPI.fetchLatest(from: url, token: token)
            if let reading = response {
                self.reading = reading
                statusText = "Actualizado"
            } else {
                statusText = "Sin mediciones recientes"
            }
            return .completed
        } catch {
            statusText = error.localizedDescription
            return .retryableFailure
        }
    }

    func refresh() async {
        _ = await performRefresh()
    }

    func toggleBadge() {
        isBadgeVisible.toggle()
        if isBadgeVisible {
            overlayController.show()
        } else {
            overlayController.hide()
        }
    }

    func setShowOverFullScreen(_ enabled: Bool) {
        overlayController.setShowOverFullScreen(enabled)
    }

    func setBadgeSize(_ size: BadgeSize) {
        overlayController.setBadgeSize(size)
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: SettingsKey.launchAtLogin)

        do {
            try LaunchAtLoginManager.setEnabled(enabled)
            updateLaunchAtLoginMessage()
        } catch {
            launchAtLoginMessage = "No se pudo cambiar: \(error.localizedDescription)"
        }
    }

    func refreshLaunchAtLoginStatus() {
        updateLaunchAtLoginMessage()
    }

    private func updateLaunchAtLoginMessage() {
        if LaunchAtLoginManager.isEnabled {
            launchAtLoginMessage = "GlucoBadge se abrirá al iniciar sesión."
        } else {
            launchAtLoginMessage = "Inicio automático desactivado."
        }
    }

    func openSettings() {
        SettingsWindowController.shared.show()
    }

    func closeSettings() {
        SettingsWindowController.shared.close()
    }

    func quit() {
        NSApplication.shared.terminate(nil)
    }
}
