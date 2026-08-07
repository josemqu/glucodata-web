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

struct GlucoseHistoryPoint: Identifiable, Equatable {
    let value: Double
    let date: Date
    let unit: String

    var id: Date { date }
}

struct GlucoseTargets: Equatable {
    let low: Double
    let high: Double
    let hypo: Double
    let hyper: Double
}

struct GlucoseHistory: Equatable {
    let readings: [GlucoseHistoryPoint]
    let targets: GlucoseTargets
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

    private struct HistoryEnvelope: Decodable {
        let success: Bool
        let data: HistoryPayload?
        let error: String?
    }

    private struct HistoryPayload: Decodable {
        let targets: TargetsPayload
        let readings: [HistoryReadingPayload]
    }

    private struct HistoryReadingPayload: Decodable {
        let value: Double
        let timestamp: String
        let unit: String?
    }

    private struct TargetsPayload: Decodable {
        let low: Double
        let high: Double
        let hypo: Double
        let hyper: Double
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

    static func fetchHistory(from latestURL: URL, token: String, hours: Int) async throws -> GlucoseHistory {
        let baseURL = latestURL.deletingLastPathComponent()
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent("history"),
            resolvingAgainstBaseURL: false
        ) else {
            throw APIError.invalidResponse
        }
        components.queryItems = [URLQueryItem(name: "hours", value: String(hours))]
        guard let url = components.url else { throw APIError.invalidResponse }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        let envelope = try JSONDecoder().decode(HistoryEnvelope.self, from: data)
        guard (200...299).contains(httpResponse.statusCode), envelope.success,
              let payload = envelope.data
        else {
            throw APIError.server(envelope.error ?? "Error HTTP \(httpResponse.statusCode)")
        }

        let readings = payload.readings.compactMap { item -> GlucoseHistoryPoint? in
            guard let date = parseDate(item.timestamp) else { return nil }
            return GlucoseHistoryPoint(value: item.value, date: date, unit: item.unit ?? "mg/dL")
        }
        return GlucoseHistory(
            readings: readings,
            targets: GlucoseTargets(
                low: payload.targets.low,
                high: payload.targets.high,
                hypo: payload.targets.hypo,
                hyper: payload.targets.hyper
            )
        )
    }

    private static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
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
