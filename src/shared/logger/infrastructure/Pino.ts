import pino, { type DestinationStream, Logger as PinoLogger } from "pino";
import pretty, { type PrettyOptions } from "pino-pretty";
import type { Transform } from "stream";

import { Logger } from "../domain/Logger";

const color =
	(number: number) =>
	(value: unknown): string =>
		`\x1b[${number}m${String(value)}\x1b[0m`;

function createPrettyStream(opts?: PrettyOptions): Transform {
	return pretty({
		...(opts ?? {}),
		customPrettifiers: {
			...(opts?.customPrettifiers as Record<string, (v: unknown) => string>),
			roomId: color(33), // yellow
			clientId: color(36), // cyan
			clientName: color(35), // magenta
			socketId: color(34), // blue
			remoteAddress: color(90), // gray
			file: color(34), // blue
		},
	});
}

export type LogFormat = "pretty" | "json";

export function parseLogFormat(value: string | undefined): LogFormat {
	return value?.trim().toLowerCase() === "json" ? "json" : "pretty";
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export function parseLogLevel(value: string | undefined): LogLevel {
	const level = value?.trim().toLowerCase();

	return LOG_LEVELS.find((candidate) => candidate === level) ?? "info";
}

function createFileLogger(level: LogLevel): PinoLogger {
	return pino({
		level,
		transport: {
			target: "pino/file",
			options: { destination: "app.log" },
		},
	});
}

export class Pino implements Logger {
	private readonly logger: PinoLogger;
	private readonly fileLogger: PinoLogger;

	constructor(logger?: PinoLogger, fileLogger?: PinoLogger, level: LogLevel = "info") {
		if (logger && fileLogger) {
			this.logger = logger;
			this.fileLogger = fileLogger;
		} else {
			this.logger = pino({ level }, createPrettyStream({ colorize: true }));
			this.fileLogger = createFileLogger(level);
		}
	}

	/**
	 * Builds the root logger. "json" writes one JSON object per line so a log
	 * collector (Loki) can filter by field; "pretty" keeps the colored output.
	 */
	public static create(
		format: LogFormat,
		destination?: DestinationStream,
		level: LogLevel = "info",
	): Pino {
		if (format === "pretty") {
			return new Pino(undefined, undefined, level);
		}

		const logger = pino({ level }, destination ?? pino.destination(1));

		return new Pino(logger, createFileLogger(level));
	}

	debug(message: unknown, context?: Record<string, unknown>): void {
		const msg = typeof message === "string" ? message : JSON.stringify(message);

		if (context && typeof context === "object") {
			this.logger.debug({ ...context }, msg);

			// this.fileLogger.debug({ ...context }, msg);
			return;
		}

		this.logger.debug(msg);
	}

	error(error: string | Error, context?: Record<string, unknown>): void {
		const errObj = error instanceof Error ? error : new Error(String(error));

		if (context && typeof context === "object") {
			this.logger.error({ ...context, err: errObj.stack ?? errObj.message }, errObj.message);

			// this.fileLogger.error({ ...context, err: errObj.stack ?? errObj.message }, errObj.message);
			return;
		}

		this.logger.error(errObj.message);
	}

	info(message: unknown, context?: Record<string, unknown>): void {
		const msg = typeof message === "string" ? message : JSON.stringify(message);

		if (context && typeof context === "object") {
			this.logger.info({ ...context }, msg);

			// this.fileLogger.info({ ...context }, msg);
			return;
		}

		this.logger.info(msg);
	}

	warn(message: unknown, context?: Record<string, unknown>): void {
		const msg = typeof message === "string" ? message : JSON.stringify(message);

		if (context && typeof context === "object") {
			this.logger.warn({ ...context }, msg);

			// this.fileLogger.warn({ ...context }, msg);
			return;
		}

		this.logger.warn(msg);
	}

	child(bindings: Record<string, unknown>): Logger {
		const childLogger = this.logger.child(bindings);
		const childFileLogger = this.fileLogger.child(bindings);

		return new Pino(childLogger, childFileLogger);
	}
}
