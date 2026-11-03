import { ChildProcessWithoutNullStreams } from "child_process";

import { Logger } from "@shared/logger/domain/Logger";

/** The part of the CoreIntegrator child process the channel writes to. */
export type CoreProcess = Pick<ChildProcessWithoutNullStreams, "stdin">;

type IpcMetricsSnapshot = {
	uptimeMs: number;
	queueDepth: number;
	maxQueueDepth: number;
	commandsEnqueued: number;
	commandsWritten: number;
	stdinWriteErrors: number;
	drainCount: number;
	totalDrainWaitMs: number;
	stdoutChunks: number;
	stdoutBytes: number;
	framesProcessed: number;
	parseErrors: number;
	deferredProcessTicks: number;
};

const IPC_METRICS_INTERVAL_MS = 60_000;

/**
 * Sends JSON-line commands to the EDOPro core process of one room. Each
 * command is written once; after a write() that returns false, the rest wait
 * in the queue until "drain". It also counts IPC metrics and, with
 * IPC_METRICS_ENABLED=true, logs them every minute.
 *
 * The logger is read on each use because the room replaces its logger after
 * construction.
 */
export class CoreChannel {
	private core: CoreProcess | null;
	private readonly pending: string[] = [];
	private isWaitingDrain = false;
	private metricsStartedAt = Date.now();
	private metricsInterval: NodeJS.Timeout | null = null;
	private lastDrainStartAt: bigint | null = null;
	private readonly metrics = {
		maxQueueDepth: 0,
		commandsEnqueued: 0,
		commandsWritten: 0,
		stdinWriteErrors: 0,
		drainCount: 0,
		totalDrainWaitNs: 0n,
		stdoutChunks: 0,
		stdoutBytes: 0,
		framesProcessed: 0,
		parseErrors: 0,
		deferredProcessTicks: 0,
	};

	constructor(
		private readonly logger: () => Logger,
		core?: CoreProcess,
	) {
		this.core = core ?? null;
	}

	get isAttached(): boolean {
		return this.core !== null;
	}

	attach(core: CoreProcess): void {
		this.core = core;
		this.isWaitingDrain = false;
		this.pending.length = 0;
		core.stdin.on("error", (error) => {
			this.metrics.stdinWriteErrors += 1;
			this.logger().error("Error writing to the child process");
			this.logger().error(error);
		});

		this.startMetricsReporting();
	}

	send(message: string): void {
		this.pending.push(`${message}\n`);
		this.metrics.commandsEnqueued += 1;
		if (this.pending.length > this.metrics.maxQueueDepth) {
			this.metrics.maxQueueDepth = this.pending.length;
		}
		this.flush();
	}

	recordStdoutChunk(byteLength: number): void {
		this.metrics.stdoutChunks += 1;
		this.metrics.stdoutBytes += byteLength;
	}

	recordFrameProcessed(): void {
		this.metrics.framesProcessed += 1;
	}

	recordParseError(): void {
		this.metrics.parseErrors += 1;
	}

	recordDeferredProcessTick(): void {
		this.metrics.deferredProcessTicks += 1;
	}

	stopMetricsReporting(): void {
		if (!this.metricsInterval) {
			return;
		}

		clearInterval(this.metricsInterval);
		this.metricsInterval = null;
	}

	private flush(): void {
		if (this.isWaitingDrain) {
			return;
		}

		const core = this.core;

		if (!core) {
			this.pending.length = 0;

			return;
		}

		while (this.pending.length > 0) {
			const message = this.pending.shift() as string;
			// stdin accepts the line even when write() returns false; false only
			// asks to wait for "drain" before writing the next one.
			const writeSuccess = core.stdin.write(message);
			this.metrics.commandsWritten += 1;

			if (!writeSuccess) {
				this.isWaitingDrain = true;
				this.metrics.drainCount += 1;
				this.lastDrainStartAt = process.hrtime.bigint();
				core.stdin.once("drain", () => {
					if (this.lastDrainStartAt !== null) {
						this.metrics.totalDrainWaitNs += process.hrtime.bigint() - this.lastDrainStartAt;
						this.lastDrainStartAt = null;
					}
					this.isWaitingDrain = false;
					this.flush();
				});

				return;
			}
		}
	}

	private startMetricsReporting(): void {
		if (process.env.IPC_METRICS_ENABLED !== "true") {
			return;
		}

		if (this.metricsInterval) {
			return;
		}

		this.metricsStartedAt = Date.now();
		this.metricsInterval = setInterval(() => {
			this.logger().info("IPC_METRICS", this.snapshot());
		}, IPC_METRICS_INTERVAL_MS);
	}

	private snapshot(): IpcMetricsSnapshot {
		return {
			uptimeMs: Date.now() - this.metricsStartedAt,
			queueDepth: this.pending.length,
			maxQueueDepth: this.metrics.maxQueueDepth,
			commandsEnqueued: this.metrics.commandsEnqueued,
			commandsWritten: this.metrics.commandsWritten,
			stdinWriteErrors: this.metrics.stdinWriteErrors,
			drainCount: this.metrics.drainCount,
			totalDrainWaitMs: Number(this.metrics.totalDrainWaitNs) / 1e6,
			stdoutChunks: this.metrics.stdoutChunks,
			stdoutBytes: this.metrics.stdoutBytes,
			framesProcessed: this.metrics.framesProcessed,
			parseErrors: this.metrics.parseErrors,
			deferredProcessTicks: this.metrics.deferredProcessTicks,
		};
	}
}
