export interface Logger {
	debug(message: unknown): void;
	error(error: string | Error): void;
	info(message: string): void;
}
