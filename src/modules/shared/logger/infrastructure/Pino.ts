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

	debug(_message: unknown): void {
		// this.logger.debug(message);
	}

	error(error: string | Error): void {
		this.logger.error(error);
	}

	info(message: unknown): void {
		this.logger.info(message);
	}
}
