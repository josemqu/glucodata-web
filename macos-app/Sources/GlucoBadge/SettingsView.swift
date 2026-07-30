import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage(SettingsKey.apiURL) private var apiURL =
        "https://glucodata-web.vercel.app/api/latest"
    @AppStorage(SettingsKey.refreshInterval) private var refreshInterval = 60.0
    @AppStorage(SettingsKey.showOverFullScreen) private var showOverFullScreen = true
    @AppStorage(SettingsKey.badgeSize) private var badgeSizeRaw = BadgeSize.normal.rawValue
    @AppStorage(SettingsKey.launchAtLogin) private var launchAtLogin = true

    @State private var token = ""
    @State private var savedConfirmation = false
    @State private var isTestingConnection = false
    @State private var connectionTestMessage: String?
    @State private var connectionTestSucceeded = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 58, height: 58)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    Text("GlucoBadge")
                        .font(.title2.weight(.semibold))
                    Text("Glucemia y tendencia siempre visibles")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 8)

            Form {
                Section("Conexión") {
                TextField("URL del servicio", text: $apiURL)
                    .textFieldStyle(.roundedBorder)

                SecureField("Token de acceso", text: $token)
                    .textFieldStyle(.roundedBorder)

                HStack {
                    if isTestingConnection {
                        ProgressView()
                            .controlSize(.small)
                        Text("Probando conexión…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if let connectionTestMessage {
                        Label(
                            connectionTestMessage,
                            systemImage: connectionTestSucceeded
                                ? "checkmark.circle.fill"
                                : "xmark.circle.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(connectionTestSucceeded ? .green : .red)
                        .lineLimit(1)
                    }

                    Spacer()

                    Button("Probar clave API") {
                        testConnection()
                    }
                    .disabled(isTestingConnection)
                }

                Picker("Actualizar cada", selection: $refreshInterval) {
                    Text("30 segundos").tag(30.0)
                    Text("1 minuto").tag(60.0)
                    Text("2 minutos").tag(120.0)
                    Text("5 minutos").tag(300.0)
                }
            }

                Section("Badge flotante") {
                Picker("Tamaño", selection: $badgeSizeRaw) {
                    ForEach(BadgeSize.allCases) { size in
                        Text(size.label).tag(size.rawValue)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: badgeSizeRaw) { rawValue in
                    appState.setBadgeSize(BadgeSize(rawValue: rawValue) ?? .normal)
                }

                Toggle(
                    "Mostrar sobre aplicaciones en pantalla completa",
                    isOn: $showOverFullScreen
                )
                .onChange(of: showOverFullScreen) { newValue in
                    appState.setShowOverFullScreen(newValue)
                }

                Toggle("Abrir al iniciar sesión en la Mac", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { newValue in
                        appState.setLaunchAtLogin(newValue)
                    }

                Text(appState.launchAtLoginMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("Podés arrastrar el badge desde cualquier parte de su fondo.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

                HStack {
                if savedConfirmation {
                    Label("Configuración guardada", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                }

                Spacer()

                Button("Guardar y cerrar") {
                    save()
                }
                .buttonStyle(.borderedProminent)
                }
            }
            .formStyle(.grouped)
        }
        .frame(width: 480, height: 650)
        .onAppear {
            token = KeychainStore.readToken()
            appState.refreshLaunchAtLoginStatus()
        }
    }

    private func save() {
        KeychainStore.saveToken(token)
        appState.scheduleRefresh()
        appState.setShowOverFullScreen(showOverFullScreen)
        appState.setBadgeSize(BadgeSize(rawValue: badgeSizeRaw) ?? .normal)
        appState.setLaunchAtLogin(launchAtLogin)
        Task { await appState.refresh() }
        appState.closeSettings()

        savedConfirmation = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            savedConfirmation = false
        }
    }

    private func testConnection() {
        connectionTestMessage = nil
        connectionTestSucceeded = false

        let trimmedURL = apiURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let url = URL(string: trimmedURL), !trimmedURL.isEmpty else {
            connectionTestMessage = "La URL no es válida"
            return
        }
        guard !trimmedToken.isEmpty else {
            connectionTestMessage = "Ingresá una clave API"
            return
        }

        isTestingConnection = true
        Task { @MainActor in
            defer { isTestingConnection = false }
            do {
                if let reading = try await GlucoseAPI.fetchLatest(
                    from: url,
                    token: trimmedToken
                ) {
                    connectionTestSucceeded = true
                    connectionTestMessage = "Correcta · \(reading.value) \(reading.unit)"
                } else {
                    connectionTestSucceeded = true
                    connectionTestMessage = "Correcta · sin mediciones"
                }
            } catch {
                connectionTestMessage = error.localizedDescription
            }
        }
    }
}
