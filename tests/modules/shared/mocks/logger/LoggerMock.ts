import { Logger } from "../../../../../src/shared/logger/domain/Logger";

export class LoggerMock implements Logger {
	debug(_message: unknown, _context?: Record<string, unknown>): void {
		/* no-op */
	}

	error(_error: string | Error, _context?: Record<string, unknown>): void {
		/* no-op */
	}

	info(_message: unknown, _context?: Record<string, unknown>): void {
		/* no-op */
	}

	child(_bindings: Record<string, unknown>): Logger {
		/* no-op */
		return this;
	}
}
