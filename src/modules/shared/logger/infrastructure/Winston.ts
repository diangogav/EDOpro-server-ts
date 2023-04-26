import winston, { Logger as WinstonLogger } from "winston";

import { Logger } from "../domain/Logger";

export class Winston implements Logger {
	private readonly logger: WinstonLogger;

	constructor() {
		this.logger = winston.createLogger({
			format: winston.format.combine(
				winston.format.prettyPrint(),
				winston.format.errors({ stack: true }),
				winston.format.splat(),
				winston.format.colorize(),
				winston.format.simple()
			),
			transports: [new winston.transports.Console()],
		});
	}

	debug(message: unknown): void {
		this.logger.debug(message);
	}

	error(error: string | Error): void {
		this.logger.error(error);
	}

	info(message: string): void {
		this.logger.info(message);
	}
}
