import { randomUUID } from "crypto";

import { Request, Response } from "express";
import { z } from "zod";

import { Logger } from "@shared/logger/domain/Logger";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

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

		const ticketId = randomUUID();
		try {
			MatchmakingQueue.getInstance().enqueue({
				ticketId,
				userId,
				format: validation.data.format,
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
