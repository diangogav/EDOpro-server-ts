/**
 * Port that maps an internal userId to a public display name.
 *
 * Matchmaking payloads must never expose internal ids: the queue stores the
 * resolved name at enqueue time (the only async boundary in the flow) so the
 * synchronous pairing tick can read it without blocking on I/O. A null result
 * means "no public name" and the matched payload carries null.
 */
export interface DisplayNameResolver {
	resolve(userId: string): Promise<string | null>;
}
