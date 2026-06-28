import { Request, Response } from "express";

import { SearchCards } from "@shared/card/application/SearchCards";
import { cardRepositories, isCardEngine } from "../composition/CardRepositories";

const searchCards = new SearchCards(cardRepositories);

export class SearchCardsController {
	async run(request: Request, response: Response): Promise<void> {
		const query = typeof request.query.q === "string" ? request.query.q : "";
		const engine = isCardEngine(request.query.engine) ? request.query.engine : undefined;
		const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : undefined;

		const results = await searchCards.run({ query, engine, limit });
		response.status(200).json({ results });
	}
}
