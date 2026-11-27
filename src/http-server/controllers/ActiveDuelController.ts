import { Request, Response } from "express";
import { z } from "zod";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

export const ActiveDuelSchema = z.object({ ticket: z.string().min(1) });

/**
 * POST /api/me/active-duel — whether the caller's account holds a seat in a
 * started match, so another device of the account can offer to resume it.
 *
 * The `ticket` is consumed once to learn the account. The answer is only yes or
 * no: the reconnection token never leaves the duel socket, and resuming needs a
 * fresh ticket on the WebSocket (RESUME_SEAT).
 */
export class ActiveDuelController {
	public constructor(
		private readonly tickets: TicketRepository,
		private readonly holdsSeat: (userId: string) => boolean,
	) {}

	public async run(req: Request, res: Response): Promise<void> {
		const validation = ActiveDuelSchema.safeParse(req.body);
		if (!validation.success) {
			res.status(400).json({ success: false, errors: validation.error.issues });
			return;
		}

		const userId = await this.tickets.consume(validation.data.ticket);
		if (userId === null) {
			res.status(401).json({ success: false, error: "Invalid or expired ticket" });
			return;
		}

		res.status(200).json({ inDuel: this.holdsSeat(userId) });
	}
}
