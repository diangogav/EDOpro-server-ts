/**
 * Names of every banlist currently loaded in memory, across both server
 * protocols. Read at match time so a banlist hot-reload is reflected in
 * group-currency decisions without a restart.
 */
export interface LoadedBanListNamesProvider {
	names(): string[];
}
