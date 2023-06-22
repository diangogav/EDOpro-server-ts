import pino from "pino";

import { Logger } from "../domain/Logger";

export class Pino implements Logger {
	private readonly logger = pino({
		transport: {
			target: "pino-pretty",
		},
	});

	debug(message: unknown): void {
		this.logger.debug(message);
	}

	error(error: string | Error): void {
		this.logger.error(error);
	}

	info(message: unknown): void {
		this.logger.info(message);
	}
}
