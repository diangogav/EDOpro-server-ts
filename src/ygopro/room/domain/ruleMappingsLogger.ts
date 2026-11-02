import { Logger } from "@shared/logger/domain/Logger";

let registered: Logger | null = null;

/** Sets where RuleMappings sends alias-miss warnings; boot registers the server logger. */
export function useRuleMappingsLogger(logger: Logger): void {
	registered = logger;
}

export function ruleMappingsLogger(): Logger {
	if (!registered) {
		throw new Error(
			"RuleMappings logger is not registered: call registerBanListCatalogs() at boot",
		);
	}

	return registered;
}
