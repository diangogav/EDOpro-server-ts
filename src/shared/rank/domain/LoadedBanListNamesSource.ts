/**
 * Names of the banlists one server protocol currently has loaded in memory.
 * Each protocol implements it over its own banlist repository.
 */
export interface LoadedBanListNamesSource {
	names(): string[];
}
