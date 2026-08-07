import AppKit

enum BadgeSize: String, CaseIterable, Identifiable {
    case normal
    case compact
    case mini

    var id: String { rawValue }

    var label: String {
        switch self {
        case .normal: return "Normal"
        case .compact: return "Compacto"
        case .mini: return "Mini"
        }
    }

    var panelSize: NSSize {
        switch self {
        case .normal: return NSSize(width: 198, height: 80)
        case .compact: return NSSize(width: 168, height: 66)
        case .mini: return NSSize(width: 130, height: 46)
        }
    }
}
