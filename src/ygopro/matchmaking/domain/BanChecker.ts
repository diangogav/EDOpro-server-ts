/**
 * Port for checking whether a user is banned. Consulted at authentication
 * time, before a ticket holder can enter a pool.
 */
export interface BanChecker {
	isBanned(userId: string): Promise<boolean>;
}
