import winston, { Logger as WinstonLogger } from "winston";

import { Logger } from "../domain/Logger";

export class Winston implements Logger {
	private readonly logger: WinstonLogger;
	private readonly debugLogger: WinstonLogger;

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

		this.debugLogger = winston.createLogger({
			format: winston.format.combine(winston.format.json()),
			transports: [new winston.transports.Console({ level: "debug" })],
		});
	}

	child(bindings: Record<string, unknown>): Logger {
		throw new Error("Method not implemented.");
	}

	debug(message: unknown, context?: Record<string, unknown>): void {
		const meta = context ?? {};
		const msg = typeof message === "string" ? message : JSON.stringify(message);
		this.debugLogger.debug(msg, meta);
	}

	error(error: string | Error, context?: Record<string, unknown>): void {
		const meta = context ?? {};
		const errObj = error instanceof Error ? error : new Error(String(error));
		this.logger.error(errObj.message, { ...meta, stack: errObj.stack });
	}

	info(message: unknown, context?: Record<string, unknown>): void {
		const meta = context ?? {};
		const msg = typeof message === "string" ? message : JSON.stringify(message);
		this.logger.info(msg, meta);
	}
}
