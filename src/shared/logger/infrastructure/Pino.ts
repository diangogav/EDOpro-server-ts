import pino from "pino";

import { Logger } from "../domain/Logger";

export class Pino implements Logger {
	private readonly logger = pino({
		level: "debug",
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
			},
		},
	});

	private readonly fileLogger = pino({
		level: "debug",
		transport: {
			target: "pino/file",
			options: { destination: "app.log" },
		},
	});

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
}
