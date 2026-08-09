import Charts
import SwiftUI

enum HistoryPeriod: Int, CaseIterable, Identifiable {
    case oneHour = 1
    case threeHours = 3
    case sixHours = 6
    case twelveHours = 12
    case oneDay = 24

    var id: Int { rawValue }
    var label: String { rawValue == 24 ? "1 d" : "\(rawValue) h" }
}

@MainActor
final class HistoryViewModel: ObservableObject {
    @Published var period: HistoryPeriod = .sixHours
    @Published private(set) var history: GlucoseHistory?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    private var latestRequestID = UUID()

    func load() async {
        let requestID = UUID()
        latestRequestID = requestID
        let requestedPeriod = period
        let urlString = UserDefaults.standard.string(forKey: SettingsKey.apiURL) ?? ""
        let token = KeychainStore.readToken()
        guard let url = URL(string: urlString), !urlString.isEmpty, !token.isEmpty else {
            isLoading = false
            errorMessage = "Configurá la URL y el token para consultar el historial."
            return
        }

        isLoading = true
        errorMessage = nil
        defer {
            if latestRequestID == requestID {
                isLoading = false
            }
        }
        do {
            let updatedHistory = try await GlucoseAPI.fetchHistory(
                from: url,
                token: token,
                hours: requestedPeriod.rawValue
            )
            guard latestRequestID == requestID else { return }
            history = updatedHistory
        } catch {
            guard latestRequestID == requestID else { return }
            errorMessage = "No se pudo cargar el historial. \(error.localizedDescription)"
        }
    }
}

struct HistoryView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var model = HistoryViewModel()
    @State private var selectedReading: GlucoseHistoryPoint?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()

            Group {
                if let history = model.history, !history.readings.isEmpty {
                    chartContent(history)
                } else if model.isLoading {
                    ProgressView("Cargando mediciones…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    emptyState
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task { await model.load() }
        .onReceive(
            NotificationCenter.default.publisher(for: .historyWindowRequestedRefresh)
        ) { _ in
            selectedReading = nil
            Task { await model.load() }
        }
        .onChange(of: model.period) { _ in
            selectedReading = nil
            Task { await model.load() }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: model.errorMessage == nil ? "chart.xyaxis.line" : "exclamationmark.triangle")
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(
                    model.errorMessage == nil
                        ? Color(nsColor: .secondaryLabelColor)
                        : Color.orange
                )
            Text(model.errorMessage == nil ? "Sin mediciones" : "No se pudo cargar")
                .font(.headline)
            Text(model.errorMessage ?? "No hay datos para este período.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 380)
            if model.errorMessage != nil {
                Button("Reintentar") {
                    Task { await model.load() }
                }
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Historial de glucemia")
                    .font(.title2.weight(.semibold))
                Text("Evolución y rango objetivo")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Picker("Período", selection: $model.period) {
                ForEach(HistoryPeriod.allCases) { period in
                    Text(period.label).tag(period)
                }
            }
            .labelsHidden()
            .pickerStyle(.segmented)
            .frame(width: 250)

            Button {
                Task { await model.load() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .help("Actualizar historial")
            .disabled(model.isLoading)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
    }

    private func chartContent(_ history: GlucoseHistory) -> some View {
        let displayed = selectedReading ?? history.readings.last

        return VStack(alignment: .leading, spacing: 16) {
            if let displayed {
                readingSummary(displayed, history: history)
            }

            Chart {
                RectangleMark(
                    yStart: .value("Mínimo objetivo", history.targets.low),
                    yEnd: .value("Máximo objetivo", history.targets.high)
                )
                .foregroundStyle(.green.opacity(0.085))

                RuleMark(y: .value("Límite bajo", history.targets.low))
                    .foregroundStyle(.green.opacity(0.34))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 5]))

                RuleMark(y: .value("Límite alto", history.targets.high))
                    .foregroundStyle(.green.opacity(0.34))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 5]))

                ForEach(history.readings) { point in
                    AreaMark(
                        x: .value("Hora", point.date),
                        yStart: .value("Base", yDomain(for: history).lowerBound),
                        yEnd: .value("Glucemia", point.value)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.accentColor.opacity(0.30), .accentColor.opacity(0.015)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("Hora", point.date),
                        y: .value("Glucemia", point.value)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(.tint)
                    .lineStyle(StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                }

                if let selectedReading {
                    RuleMark(x: .value("Hora seleccionada", selectedReading.date))
                        .foregroundStyle(.primary.opacity(0.55))
                        .lineStyle(StrokeStyle(lineWidth: 1))

                    PointMark(
                        x: .value("Hora seleccionada", selectedReading.date),
                        y: .value("Glucemia seleccionada", selectedReading.value)
                    )
                    .foregroundStyle(pointColor(selectedReading.value, targets: history.targets))
                    .symbolSize(115)

                    PointMark(
                        x: .value("Hora seleccionada", selectedReading.date),
                        y: .value("Glucemia seleccionada", selectedReading.value)
                    )
                    .foregroundStyle(Color(nsColor: .windowBackgroundColor))
                    .symbolSize(48)
                }
            }
            .chartYScale(domain: yDomain(for: history))
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                    AxisGridLine().foregroundStyle(.secondary.opacity(0.11))
                    AxisTick().foregroundStyle(.secondary.opacity(0.35))
                    AxisValueLabel(format: .dateTime.hour().minute())
                        .foregroundStyle(.secondary)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisGridLine().foregroundStyle(.secondary.opacity(0.11))
                    AxisTick().foregroundStyle(.secondary.opacity(0.35))
                    AxisValueLabel().foregroundStyle(.secondary)
                }
            }
            .chartPlotStyle { plotArea in
                plotArea
                    .background(Color.accentColor.opacity(0.025))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .chartOverlay { proxy in
                GeometryReader { geometry in
                    Rectangle()
                        .fill(.clear)
                        .contentShape(Rectangle())
                        .onContinuousHover { phase in
                            switch phase {
                            case .active(let location):
                                updateSelection(
                                    at: location,
                                    proxy: proxy,
                                    geometry: geometry,
                                    readings: history.readings
                                )
                            case .ended:
                                withAnimation(selectionAnimation) {
                                    selectedReading = nil
                                }
                            }
                        }
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    updateSelection(
                                        at: value.location,
                                        proxy: proxy,
                                        geometry: geometry,
                                        readings: history.readings
                                    )
                                }
                                .onEnded { _ in
                                    withAnimation(selectionAnimation) {
                                        selectedReading = nil
                                    }
                                }
                        )
                }
            }
            .accessibilityLabel("Gráfico interactivo de glucemia de las últimas \(model.period.label)")
            .accessibilityHint("Mové el puntero sobre el gráfico para consultar cada medición")
        }
        .padding(24)
        .background(
            Color(nsColor: .controlBackgroundColor).opacity(0.62),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.32), value: history)
    }

    private func readingSummary(_ reading: GlucoseHistoryPoint, history: GlucoseHistory) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(reading.value.formatted(.number.precision(.fractionLength(0))))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
            Text(reading.unit)
                .font(.callout.weight(.medium))
                .foregroundStyle(.secondary)
            Text(reading.date, format: .dateTime.weekday(.abbreviated).hour().minute())
                .font(.callout)
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 6) {
                Circle()
                    .fill(pointColor(reading.value, targets: history.targets))
                    .frame(width: 7, height: 7)
                Text(statusText(reading.value, targets: history.targets))
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)

            Text("Objetivo \(Int(history.targets.low))–\(Int(history.targets.high))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .transaction { transaction in
            transaction.animation = nil
        }
    }

    private var selectionAnimation: Animation? {
        reduceMotion ? nil : .interactiveSpring(response: 0.18, dampingFraction: 0.92)
    }

    private func updateSelection(
        at location: CGPoint,
        proxy: ChartProxy,
        geometry: GeometryProxy,
        readings: [GlucoseHistoryPoint]
    ) {
        let plotFrame = geometry[proxy.plotAreaFrame]
        guard plotFrame.contains(location) else {
            selectedReading = nil
            return
        }
        let xPosition = location.x - plotFrame.origin.x
        guard let date: Date = proxy.value(atX: xPosition) else { return }
        let nearest = readings.min {
            abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
        }
        guard nearest?.id != selectedReading?.id else { return }
        withAnimation(selectionAnimation) {
            selectedReading = nearest
        }
    }

    private func statusText(_ value: Double, targets: GlucoseTargets) -> String {
        if value <= targets.hypo { return "Muy baja" }
        if value < targets.low { return "Baja" }
        if value >= targets.hyper { return "Muy alta" }
        if value > targets.high { return "Alta" }
        return "En objetivo"
    }

    private func pointColor(_ value: Double, targets: GlucoseTargets) -> Color {
        if value <= targets.hypo || value >= targets.hyper { return .red }
        if value < targets.low || value > targets.high { return .orange }
        return .blue
    }

    private func yDomain(for history: GlucoseHistory) -> ClosedRange<Double> {
        let values = history.readings.map(\.value)
        let minimum = min(values.min() ?? history.targets.low, history.targets.hypo)
        let maximum = max(values.max() ?? history.targets.high, history.targets.hyper)
        return max(40, minimum - 15)...(maximum + 15)
    }
}
