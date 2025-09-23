export interface Logger {
	/**
	 * Log a debug message with optional structured context.
	 * Prefer passing context per-call to avoid creating per-room logger instances.
	 */
	debug(message: unknown, context?: Record<string, unknown>): void;
	/**
	 * Log an error (string or Error) with optional structured context.
	 */
	error(error: string | Error, context?: Record<string, unknown>): void;
	/**
	 * Log an info message with optional structured context.
	 */
	info(message: unknown, context?: Record<string, unknown>): void;
}
