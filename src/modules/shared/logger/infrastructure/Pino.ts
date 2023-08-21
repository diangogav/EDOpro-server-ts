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

	debug(_message: unknown): void {
		// this.logger.debug(message);
		// this.fileLogger.debug(message);
	}

	error(error: string | Error): void {
		this.logger.error(error);
		// this.fileLogger.error(error);
	}

	info(message: unknown): void {
		this.logger.info(message);
		// this.fileLogger.info(message);
	}
}
