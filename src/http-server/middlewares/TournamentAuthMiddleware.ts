import { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { Logger } from "@shared/logger/domain/Logger";

/** Fresh evolution-api tickets only; bearer values are never placed in URLs or logs. */
export function createTournamentAuthMiddleware(tickets: TicketRepository, logger: Logger) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const authorization = req.get("Authorization");
		const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
		if (!z.uuid().safeParse(token).success) {
			res.status(401).json({ success: false, error: "A fresh authentication ticket is required" });
			return;
		}
		try {
			const userId = await tickets.consume(token);
			if (!userId?.trim()) {
				res.status(401).json({ success: false, error: "Invalid or expired ticket" });
				return;
			}
			res.locals.tournamentUserId = userId;
			next();
		} catch {
			logger.error("Tournament authentication store is unavailable");
			res.status(503).json({ success: false, error: "Authentication is temporarily unavailable" });
		}
	};
}
