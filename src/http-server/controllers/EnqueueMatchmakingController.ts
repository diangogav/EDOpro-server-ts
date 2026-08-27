import { randomUUID } from "crypto";

import { Request, Response } from "express";
import { z } from "zod";

import { Logger } from "@shared/logger/domain/Logger";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

import { DisplayNameResolver } from "@ygopro/matchmaking/domain/DisplayNameResolver";
import {
	DuplicateQueueEntryError,
	MatchmakingQueue,
} from "@ygopro/matchmaking/domain/MatchmakingQueue";
import { MATCHMAKING_FORMATS, SUPPORTED_QUEUE } from "@ygopro/matchmaking/domain/QueueEntry";

export const EnqueueMatchmakingSchema = z.object({
	format: z.enum(MATCHMAKING_FORMATS),
	queue: z.literal(SUPPORTED_QUEUE),
	ticket: z.string().min(1),
});

/**
 * POST /api/matchmaking/queue — enter the auto-pairing queue.
 *
 * The auth `ticket` is consumed once to derive the player identity (userId).
 * NOTE: the ticket is single-use; the WS handshake performed on `matched` needs
 * a FRESH ticket. The returned `ticketId` is an opaque queue handle for the
 * status/cancel calls, NOT an auth token.
 */
export class EnqueueMatchmakingController {
	constructor(
		private readonly logger: Logger,
		private readonly tickets: TicketRepository,
		private readonly displayNames: DisplayNameResolver,
	) {}

	async run(req: Request, res: Response): Promise<void> {
		const validation = EnqueueMatchmakingSchema.safeParse(req.body);
		if (!validation.success) {
			res.status(400).json({ success: false, errors: validation.error.issues });
			return;
		}

		const userId = await this.tickets.consume(validation.data.ticket);
		if (userId === null) {
			res.status(401).json({ success: false, error: "Invalid or expired ticket" });
			return;
		}

		// Cheap synchronous pre-check: a user already in the pool never needs the
		// display-name round-trip below. The guard inside enqueue() remains the
		// atomic authority for the race between this check and insertion.
		if (MatchmakingQueue.getInstance().isUserQueued(userId)) {
			res.status(409).json({ success: false, error: "Already in queue" });
			return;
		}

		// Resolved here, at the async HTTP boundary, so the synchronous pairing tick
		// never touches the database. A failed lookup degrades to a null name — the
		// matched payload must carry a public name or nothing, never the userId.
		let displayName: string | null = null;
		try {
			displayName = await this.displayNames.resolve(userId);
		} catch (error) {
			this.logger.error(
				`Matchmaking display-name resolution failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}

		const ticketId = randomUUID();
		try {
			MatchmakingQueue.getInstance().enqueue({
				ticketId,
				userId,
				format: validation.data.format,
				displayName,
			});
		} catch (error) {
			if (error instanceof DuplicateQueueEntryError) {
				// One active entry per user. The client should keep polling its existing
				// ticketId; a fresh enqueue is a no-op it must not proceed with.
				res.status(409).json({ success: false, error: "Already in queue" });
				return;
			}
			this.logger.error(
				`Matchmaking enqueue failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			res.status(500).json({ success: false, error: "Failed to enqueue" });
			return;
		}

		res.status(200).json({ ticketId });
	}
}
