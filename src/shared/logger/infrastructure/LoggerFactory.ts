import { Logger } from "../domain/Logger";
import { Pino } from "./Pino";

/**
 * Simple factory/singleton that returns a shared logger instance.
 * Callers should pass context per-call instead of creating new logger instances per room/duel.
 */
class LoggerFactory {
	private static instance: Logger | null = null;

	public static getLogger(): Logger {
		if (!LoggerFactory.instance) {
			// default to Pino; could be made configurable later
			LoggerFactory.instance = new Pino();
		}

		return LoggerFactory.instance;
	}
}

export default LoggerFactory;
