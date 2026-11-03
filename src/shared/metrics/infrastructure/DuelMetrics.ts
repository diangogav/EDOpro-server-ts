import { Gauge, Histogram, Registry } from "@prometheus-io/client";

import { DuelEngineFlow } from "../domain/DuelResourceMonitor";

type DuelLabels = "flow" | "ranked";

const MEBIBYTE = 1024 * 1024;

/**
 * Per-duel Prometheus metrics. Labels stay low-cardinality (engine flow and
 * ranked flag); per-duel detail goes to the `duel.resources` log line.
 */
export class DuelMetrics {
	public readonly activeDuels: Gauge<"flow">;
	public readonly cpuSeconds: Histogram<DuelLabels>;
	public readonly peakMemoryBytes: Histogram<DuelLabels>;
	public readonly durationSeconds: Histogram<DuelLabels>;

	constructor(registry: Registry) {
		this.activeDuels = new Gauge({
			name: "evolution_duels_active",
			help: "Duel engines currently running",
			labelNames: ["flow"],
			registers: [registry],
		});
		this.activeDuels.set({ flow: "edopro" }, 0);
		this.activeDuels.set({ flow: "ygopro" }, 0);

		this.cpuSeconds = new Histogram({
			name: "evolution_duel_cpu_seconds",
			help: "CPU time one duel engine used",
			labelNames: ["flow", "ranked"],
			buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
			registers: [registry],
		});

		this.peakMemoryBytes = new Histogram({
			name: "evolution_duel_peak_memory_bytes",
			help: "Peak memory of one duel engine (process RSS for EDOPro, WASM plus V8 heap for YGOPro)",
			labelNames: ["flow", "ranked"],
			buckets: [8, 16, 32, 64, 128, 256, 512, 1024].map((mb) => mb * MEBIBYTE),
			registers: [registry],
		});

		this.durationSeconds = new Histogram({
			name: "evolution_duel_duration_seconds",
			help: "Wall-clock lifetime of one duel engine",
			labelNames: ["flow", "ranked"],
			buckets: [30, 60, 120, 300, 600, 900, 1800, 2700, 3600],
			registers: [registry],
		});
	}

	public static labels(flow: DuelEngineFlow, ranked: boolean): Record<DuelLabels, string> {
		return { flow, ranked: String(ranked) };
	}
}
