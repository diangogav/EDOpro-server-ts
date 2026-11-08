import { Logger } from "../domain/Logger";
import { parseLogFormat, parseLogLevel, Pino } from "./Pino";

/**
 * Simple factory/singleton that returns a shared logger instance.
 * Callers should pass context per-call instead of creating new logger instances per room/duel.
 */
class LoggerFactory {
	private static instance: Logger | null = null;

	public static getLogger(context?: Record<string, unknown>): Logger {
		if (!LoggerFactory.instance) {
			LoggerFactory.instance = Pino.create(
				parseLogFormat(process.env.LOG_FORMAT),
				undefined,
				parseLogLevel(process.env.LOG_LEVEL),
			);
		}

		if (context) {
			return LoggerFactory.instance.child(context);
		}

		return LoggerFactory.instance;
	}
}

export default LoggerFactory;
