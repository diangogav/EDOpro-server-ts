import { Request, Response } from "express";

import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";

// Counts change every few seconds at most; a short shared cache keeps lobby
// polling cheap without showing stale demand.
const CACHE_CONTROL = "public, max-age=5";

/**
 * GET /api/matchmaking/depth — how many players are searching in each
 * matchmaking format right now, e.g. `{ formats: { tcg: 3, jtp: 0, edison: 1 } }`.
 * Public and anonymous: it exposes counts only, never who is queued.
 */
export class MatchmakingDepthController {
	run(_req: Request, res: Response): void {
		const formats = MatchmakingQueue.getInstance().getPool().depthByFormat();

		res.set("Cache-Control", CACHE_CONTROL);
		res.status(200).json({ formats });
	}
}
