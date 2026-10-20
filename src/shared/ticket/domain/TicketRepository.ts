/**
 * Port for single-use ticket consumption.
 *
 * A ticket is a short-lived token stored in Redis that maps to a userId.
 * Consuming it atomically reads and deletes the entry so it can only be
 * used once. Callers that receive a non-null value MAY trust the userId
 * returned; callers that receive null MUST reject the authenticated action.
 */
export interface TicketRepository {
	/**
	 * Consumes the ticket identified by the given UUID.
	 *
	 * Returns the userId associated with the ticket if it exists, or null if:
	 * - the uuid fails UUID format validation (no storage operation issued)
	 * - no ticket with that key exists in the store
	 * - the backing store is unavailable (fail-closed)
	 */
	consume(uuid: string): Promise<string | null>;
}

/**
 * Outcome of consuming a ticket, telling a bad ticket apart from a store that
 * could not answer:
 * - `consumed`: valid ticket, `userId` is trustworthy
 * - `invalid`: malformed, unknown, expired or already consumed
 * - `unavailable`: the backing store errored, timed out or is not configured
 */
export type TicketConsumeResult =
	| { readonly status: "consumed"; readonly userId: string }
	| { readonly status: "invalid" }
	| { readonly status: "unavailable" };

/**
 * Port for callers that can degrade gracefully when the store is down (the WS
 * handshake treats the socket as anonymous). Callers that must stay fail-closed
 * use `TicketRepository.consume`.
 */
export interface HandshakeTicketStore {
	consumeWithStatus(uuid: string): Promise<TicketConsumeResult>;
}
