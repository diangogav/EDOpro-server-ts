import { Logger } from "../../logger/domain/Logger";
import {
	DuelResourceContext,
	DuelResourceMonitor,
	DuelResourceWatch,
	ThreadResourceStats,
} from "../domain/DuelResourceMonitor";
import { DuelMetrics } from "./DuelMetrics";
import { ProcessResources } from "./ProcResourceReader";

type ProcessReader = {
	read(pid: number): Promise<ProcessResources | null>;
};

type Options = {
	metrics: DuelMetrics;
	reader: ProcessReader;
	logger: Logger;
	sampleIntervalMs: number;
	now?: () => number;
};

type MeasuredUsage = {
	cpuSeconds: number | null;
	peakMemoryBytes: number | null;
};

/**
 * Samples each EDOPro core process on an interval (procfs is gone once the
 * process exits, so the last sample is the final figure) and takes YGOPro
 * worker stats as reported at dispose.
 */
export class SampledDuelResourceMonitor implements DuelResourceMonitor {
	private readonly now: () => number;

	constructor(private readonly options: Options) {
		this.now = options.now ?? Date.now;
	}

	public watchProcess(pid: number | undefined, context: DuelResourceContext): DuelResourceWatch {
		const startedAt = this.start(context);
		let last: ProcessResources | null = null;
		let ended = false;

		const sample = async (): Promise<void> => {
			if (pid === undefined) {
				return;
			}
			const current = await this.options.reader.read(pid);
			if (current) {
				last = current;
			}
		};

		const interval =
			pid === undefined ? null : setInterval(() => void sample(), this.options.sampleIntervalMs);
		interval?.unref();

		return {
			end: () => {
				if (ended) {
					return;
				}
				ended = true;
				if (interval) {
					clearInterval(interval);
				}
				const durationMs = this.now() - startedAt;
				void sample().finally(() => {
					this.finish(context, durationMs, {
						cpuSeconds: last?.cpuSeconds ?? null,
						peakMemoryBytes: last?.peakMemoryBytes ?? null,
					});
				});
			},
		};
	}

	public watchThread(context: DuelResourceContext): DuelResourceWatch {
		const startedAt = this.start(context);
		let ended = false;

		return {
			end: (stats?: ThreadResourceStats | null) => {
				if (ended) {
					return;
				}
				ended = true;
				this.finish(context, this.now() - startedAt, {
					cpuSeconds: stats?.cpuSeconds ?? null,
					peakMemoryBytes: stats?.memoryBytes ?? null,
				});
			},
		};
	}

	private start(context: DuelResourceContext): number {
		this.options.metrics.activeDuels.inc({ flow: context.flow });

		return this.now();
	}

	private finish(context: DuelResourceContext, durationMs: number, usage: MeasuredUsage): void {
		const { metrics } = this.options;
		const labels = DuelMetrics.labels(context.flow, context.ranked);

		metrics.activeDuels.dec({ flow: context.flow });
		metrics.durationSeconds.observe(labels, durationMs / 1000);
		if (usage.cpuSeconds !== null) {
			metrics.cpuSeconds.observe(labels, usage.cpuSeconds);
		}
		if (usage.peakMemoryBytes !== null) {
			metrics.peakMemoryBytes.observe(labels, usage.peakMemoryBytes);
		}

		this.options.logger.info("duel.resources", {
			flow: context.flow,
			roomId: context.roomId,
			matchId: context.matchId,
			ranked: context.ranked,
			durationMs,
			cpuSeconds: usage.cpuSeconds,
			peakMemoryBytes: usage.peakMemoryBytes,
		});
	}
}
