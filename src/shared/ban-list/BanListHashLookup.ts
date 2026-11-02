/**
 * Resolves a ban list name to the hash that identifies the list in match
 * results and stats for both engines. The EDOPro catalog owns that identity
 * (EdoproBanListHashLookup); YGOPro rooms resolve their list through this port.
 */
export interface BanListHashLookup {
	hashByName(name: string): number | undefined;
}
