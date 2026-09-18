/**
 * Thrown when a user already has an active matchmaking entry — either still
 * searching or newly matched and not yet reaped. The HTTP enqueue path maps
 * this to 409 Conflict; a poll arrival at the pool level throws it too.
 */
export class DuplicateQueueEntryError extends Error {
	constructor(userId: string) {
		super(`User ${userId} already has an active matchmaking entry`);
		this.name = "DuplicateQueueEntryError";
	}
}
