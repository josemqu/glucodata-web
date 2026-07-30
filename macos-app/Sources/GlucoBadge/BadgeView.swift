import AppKit
import SwiftUI

struct BadgeView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage(SettingsKey.badgeSize) private var badgeSizeRaw = BadgeSize.normal.rawValue

    private var badgeSize: BadgeSize {
        BadgeSize(rawValue: badgeSizeRaw) ?? .normal
    }

    var body: some View {
        Group {
            if let reading = appState.reading {
                readingView(reading)
            } else {
                emptyView
            }
        }
        .padding(badgeInset)
        .frame(
            width: badgeSize.panelSize.width,
            height: badgeSize.panelSize.height
        )
        .background(
            .ultraThinMaterial,
            in: RoundedRectangle(cornerRadius: cornerRadius)
        )
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius)
                .strokeBorder(.white.opacity(0.18), lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: cornerRadius))
        .accessibilityElement(children: .combine)
        .contextMenu {
            Button("Configuración…") {
                appState.openSettings()
            }

            Divider()

            Button("Salir de GlucoBadge") {
                appState.quit()
            }
        }
    }

    private func readingView(_ reading: GlucoseReading) -> some View {
        Group {
            if badgeSize == .mini {
                HStack(alignment: .firstTextBaseline, spacing: valueArrowSpacing) {
                    Text("\(reading.value)")
                        .font(.system(size: valueFontSize, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .layoutPriority(2)

                    trendView(reading)
                }
            } else {
                VStack(spacing: badgeSize == .normal ? 2 : 1) {
                    HStack(alignment: .firstTextBaseline, spacing: valueArrowSpacing) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(reading.value)")
                                .font(.system(size: valueFontSize, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                                .layoutPriority(2)

                            Text(reading.unit)
                                .font(.system(size: unitFontSize, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: true, vertical: false)
                        }

                        trendView(reading)
                    }

                    Text(appState.readingAgeText)
                        .font(.system(size: ageFontSize, weight: .medium))
                        .foregroundStyle(appState.isReadingStale ? .orange : .secondary)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityLabel(
            "Glucemia \(reading.value) \(reading.unit), tendencia \(reading.trendState), \(appState.readingAgeText)"
        )
    }

    private func trendView(_ reading: GlucoseReading) -> some View {
        Text(reading.trendSymbol)
            .font(.system(size: arrowFontSize, weight: .bold, design: .rounded))
            .foregroundStyle(readingColor(reading))
            .frame(width: arrowWidth)
    }

    private var emptyView: some View {
        HStack(spacing: 10) {
            if appState.isLoading {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "drop.triangle")
                    .foregroundStyle(.secondary)
            }

            if badgeSize != .mini {
                Text(appState.statusText)
                    .font(.system(size: badgeSize == .compact ? 10 : 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            Button {
                appState.openSettings()
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 13, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Abrir configuración")

            Button {
                appState.quit()
            } label: {
                Image(systemName: "power")
                    .font(.system(size: 13, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.red.opacity(0.8))
            .help("Salir de GlucoBadge")
        }
    }

    private var cornerRadius: CGFloat {
        switch badgeSize {
        case .normal: return 18
        case .compact: return 15
        case .mini: return 13
        }
    }

    private var valueFontSize: CGFloat {
        switch badgeSize {
        case .normal: return 34
        case .compact: return 28
        case .mini: return 25
        }
    }

    private var unitFontSize: CGFloat {
        badgeSize == .normal ? 9 : 8
    }

    private var ageFontSize: CGFloat {
        badgeSize == .normal ? 10 : 8
    }

    private var arrowFontSize: CGFloat {
        switch badgeSize {
        case .normal: return 37
        case .compact: return 30
        case .mini: return 25
        }
    }

    private var arrowWidth: CGFloat {
        switch badgeSize {
        case .normal: return 42
        case .compact: return 34
        case .mini: return 28
        }
    }

    private var badgeInset: CGFloat {
        switch badgeSize {
        case .normal: return 12
        case .compact: return 10
        case .mini: return 8
        }
    }

    private var valueArrowSpacing: CGFloat {
        switch badgeSize {
        case .normal: return 5
        case .compact: return 4
        case .mini: return 2
        }
    }

    private func readingColor(_ reading: GlucoseReading) -> Color {
        if appState.isReadingStale { return .orange }
        switch reading.status.colorKey {
        case "critical": return .red
        case "warning": return .orange
        case "ok": return .green
        default: return .secondary
        }
    }
}
