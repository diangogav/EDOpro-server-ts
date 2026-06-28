import { Request, Response } from "express";

import { toBanListViews } from "@shared/ban-list/application/BanListView";
import EdoProBanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";

export class GetBanListsController {
	run(_req: Request, response: Response): void {
		response.status(200).json({
			edopro: toBanListViews(EdoProBanListMemoryRepository.get()),
			ygopro: toBanListViews(YGOProBanListMemoryRepository.get()),
		});
	}
}
