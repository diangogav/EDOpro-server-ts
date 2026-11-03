import { Gauge, Registry } from "@prometheus-io/client";

import { ProcessLiveness } from "./ProcLivenessReader";

type LivenessReader = {
	read(): Promise<ProcessLiveness | null>;
};

/**
 * Gauges read from procfs on each scrape. Compared with
 * `evolution_duels_active`, they show YGOPro workers or EDOPro cores that
 * outlive their duel.
 */
export class ProcessLivenessMetrics {
	public readonly threads: Gauge;
	public readonly childProcesses: Gauge;
	private pending: Promise<ProcessLiveness | null> | null = null;

	constructor(
		registry: Registry,
		private readonly reader: LivenessReader,
	) {
		this.threads = new Gauge({
			name: "evolution_process_threads",
			help: "Threads of the server process (each YGOPro ocgcore worker is one)",
			registers: [registry],
			collect: async () => {
				const liveness = await this.readOnce();
				if (liveness) {
					this.threads.set(liveness.threads);
				}
			},
		});
		this.childProcesses = new Gauge({
			name: "evolution_child_processes",
			help: "Live child processes of the server (EDOPro cores)",
			registers: [registry],
			collect: async () => {
				const liveness = await this.readOnce();
				if (liveness) {
					this.childProcesses.set(liveness.childProcesses);
				}
			},
		});
	}

	/** Both gauges collect in the same scrape; procfs is read once for both. */
	private readOnce(): Promise<ProcessLiveness | null> {
		if (!this.pending) {
			this.pending = this.reader.read().finally(() => {
				this.pending = null;
			});
		}

		return this.pending;
	}
}
