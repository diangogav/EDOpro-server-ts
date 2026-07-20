import { Request, Response } from "express";
import { z } from "zod";

import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";

export const CancelMatchmakingSchema = z.object({
	ticketId: z.string().min(1),
});

/**
 * DELETE /api/matchmaking/queue?ticketId=… — cancel the search.
 *
 * Idempotent: a ticketId that is already gone (cancelled, matched-and-cleared,
 * or TTL-dropped) returns 404 so the client can distinguish "removed now" from
 * "was never there", but never errors.
 */
export class CancelMatchmakingController {
	run(req: Request, res: Response): void {
		const validation = CancelMatchmakingSchema.safeParse(req.query);
		if (!validation.success) {
			res.status(400).json({ success: false, errors: validation.error.issues });
			return;
		}

		const removed = MatchmakingQueue.getInstance().cancel(validation.data.ticketId);
		if (!removed) {
			res.status(404).json({ success: false, error: "Unknown ticketId" });
			return;
		}

		res.status(200).json({ success: true });
	}
}
