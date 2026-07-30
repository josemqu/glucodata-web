import Foundation

struct GlucoseReading: Equatable {
    let value: Int
    let trendState: String
    let date: Date
    let unit: String
    let status: GlucoseStatus

    var trendSymbol: String {
        switch trendState {
        case "DoubleDown": return "⇊"
        case "Down": return "↓"
        case "DownAngledLarge", "DownAngled": return "↘"
        case "DownSlight": return "↘"
        case "Flat": return "→"
        case "UpSlight": return "↗"
        case "UpAngled", "UpAngledLarge": return "↗"
        case "Up": return "↑"
        case "DoubleUp": return "⇈"
        default: return "→"
        }
    }
}

struct GlucoseStatus: Equatable {
    let label: String
    let colorKey: String
}

enum GlucoseAPI {
    private struct Envelope: Decodable {
        let success: Bool
        let data: Payload?
        let error: String?
    }

    private struct Payload: Decodable {
        let value: Double
        let trendState: String?
        let trend: Int?
        let timestamp: String
        let unit: String?
        let status: StatusPayload?
    }

    private struct StatusPayload: Decodable {
        let label: String
        let colorKey: String
    }

    static func fetchLatest(from url: URL, token: String) async throws -> GlucoseReading? {
        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        let envelope = try JSONDecoder().decode(Envelope.self, from: data)
        guard (200...299).contains(httpResponse.statusCode), envelope.success else {
            throw APIError.server(envelope.error ?? "Error HTTP \(httpResponse.statusCode)")
        }
        guard let payload = envelope.data else { return nil }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: payload.timestamp)
            ?? ISO8601DateFormatter().date(from: payload.timestamp)
            ?? Date()

        return GlucoseReading(
            value: Int(payload.value.rounded()),
            trendState: payload.trendState ?? legacyTrend(payload.trend),
            date: date,
            unit: payload.unit ?? "mg/dL",
            status: GlucoseStatus(
                label: payload.status?.label ?? "SIN ESTADO",
                colorKey: payload.status?.colorKey ?? "unknown"
            )
        )
    }

    private static func legacyTrend(_ trend: Int?) -> String {
        switch trend {
        case 1: return "DoubleUp"
        case 2: return "Up"
        case 3: return "UpAngled"
        case 4: return "Flat"
        case 5: return "DownAngled"
        case 6: return "Down"
        case 7: return "DoubleDown"
        default: return "Flat"
        }
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Respuesta inválida del servicio"
        case .server(let message):
            return message
        }
    }
}
