import { Logger } from "../domain/Logger";
import { Pino } from "./Pino";

/**
 * Simple factory/singleton that returns a shared logger instance.
 * Callers should pass context per-call instead of creating new logger instances per room/duel.
 */
class LoggerFactory {
	private static instance: Logger | null = null;

	public static getLogger(context?: Record<string, unknown>): Logger {
		if (!LoggerFactory.instance) {
			// default to Pino; could be made configurable later
			LoggerFactory.instance = new Pino();
		}

		if (context) {
			return LoggerFactory.instance.child(context);
		}

		return LoggerFactory.instance;
	}
}

export default LoggerFactory;
