import { Request, Response } from "express";

import { cardRepositories } from "../composition/CardRepositories";

export class GetDatabasesController {
	async run(_request: Request, response: Response): Promise<void> {
		const [edopro, ygopro] = await Promise.all([
			cardRepositories.edopro.listSources(),
			cardRepositories.ygopro.listSources(),
		]);

		response.status(200).json({ edopro, ygopro });
	}
}
