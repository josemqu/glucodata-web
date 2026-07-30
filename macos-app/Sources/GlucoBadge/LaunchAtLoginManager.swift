import Foundation

enum LaunchAtLoginManager {
    private static let label = "com.glucodata.GlucoBadge.login"

    private static var agentURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents", isDirectory: true)
            .appendingPathComponent("\(label).plist")
    }

    static var isEnabled: Bool {
        FileManager.default.fileExists(atPath: agentURL.path)
    }

    static func setEnabled(_ enabled: Bool) throws {
        let fileManager = FileManager.default

        if enabled {
            try fileManager.createDirectory(
                at: agentURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            let appPath = Bundle.main.bundleURL.path
            let propertyList: [String: Any] = [
                "Label": label,
                "ProgramArguments": [
                    "/usr/bin/open",
                    appPath,
                ],
                "RunAtLoad": true,
                "ProcessType": "Interactive",
                "LimitLoadToSessionType": "Aqua",
            ]
            let data = try PropertyListSerialization.data(
                fromPropertyList: propertyList,
                format: .xml,
                options: 0
            )
            try data.write(to: agentURL, options: .atomic)
        } else if fileManager.fileExists(atPath: agentURL.path) {
            try fileManager.removeItem(at: agentURL)
        }
    }
}
