/**
 * Names of every banlist currently loaded in memory, one set per server
 * protocol, so group currency can tell a server lagging behind the other.
 * Read at match time so a banlist hot-reload is reflected in group-currency
 * decisions without a restart.
 */
export interface LoadedBanListNamesProvider {
	nameSets(): string[][];
}
