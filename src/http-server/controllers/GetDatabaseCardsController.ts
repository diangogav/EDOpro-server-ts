import { Request, Response } from "express";

import { cardRepositories, isCardEngine } from "../composition/CardRepositories";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const parsePositive = (value: unknown, fallback: number, max: number): number => {
	if (typeof value !== "string") {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallback;
	}

	return Math.min(Math.floor(parsed), max);
};

export class GetDatabaseCardsController {
	async run(request: Request, response: Response): Promise<void> {
		const engine = request.query.engine;
		const source = request.query.source;

		if (!isCardEngine(engine) || typeof source !== "string" || source === "") {
			response.status(400).json({ error: "engine and source are required" });

			return;
		}

		const limit = parsePositive(request.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
		const offset = parsePositive(request.query.offset, 0, Number.MAX_SAFE_INTEGER);

		const page = await cardRepositories[engine].findBySource(source, limit, offset);
		response.status(200).json({ engine, source, ...page });
	}
}
