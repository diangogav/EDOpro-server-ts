import { Request, Response } from "express";
import { z } from "zod";

import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";

export const MatchmakingStatusSchema = z.object({
	ticketId: z.string().min(1),
});

/**
 * GET /api/matchmaking/status?ticketId=… — poll for the outcome.
 *
 * This poll doubles as the client heartbeat: it refreshes the entry's lastPollAt
 * (inside queue.poll) so the TTL sweep keeps the entry alive. An unknown ticketId
 * (never queued, cancelled, or TTL-dropped) returns 404.
 */
export class MatchmakingStatusController {
	run(req: Request, res: Response): void {
		const validation = MatchmakingStatusSchema.safeParse(req.query);
		if (!validation.success) {
			res.status(400).json({ success: false, errors: validation.error.issues });
			return;
		}

		const status = MatchmakingQueue.getInstance().poll(validation.data.ticketId);
		if (status === null) {
			res.status(404).json({ success: false, error: "Unknown ticketId" });
			return;
		}

		res.status(200).json(status);
	}
}
