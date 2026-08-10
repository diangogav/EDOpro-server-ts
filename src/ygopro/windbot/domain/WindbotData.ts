export type WindbotData = {
	name: string;
	deck: string;
	dialog?: string;
	/**
	 * Excludes this bot from the GENERIC random pool (pickRandom() called with
	 * no format) only. A hidden bot stays reachable by explicit name
	 * (findByName) and by format-scoped random (pickRandom(format) when this
	 * bot's `format` matches) — see WindbotBotlistRepository.pickRandom.
	 */
	hidden?: boolean;
	deckcode?: string;
	/**
	 * Optional format tag (e.g. "jtp", "tcg", "edison") used to scope
	 * pickRandom(format) to a themed pool. Bots without a format are only
	 * reachable through the generic pool or by explicit name.
	 */
	format?: string;
};
