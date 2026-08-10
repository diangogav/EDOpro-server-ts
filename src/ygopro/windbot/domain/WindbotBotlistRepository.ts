import { WindbotData } from "./WindbotData";

export interface WindbotBotlistRepository {
	findAll(): WindbotData[];
	findByName(name: string): WindbotData | null;
	/**
	 * No format → CURRENT behavior: visible bots only (hidden excluded).
	 * With a format → pool is every bot whose `format` matches, INCLUDING
	 * hidden ones (format-scoped random is an explicit opt-in, so hiding a
	 * bot from the generic pool must not also hide it from its own format).
	 * Empty pool → null.
	 */
	pickRandom(format?: string): WindbotData | null;
}
