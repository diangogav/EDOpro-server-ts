import { Request, Response } from "express";

import { toBanListDetail } from "@shared/ban-list/application/BanListDetail";
import { BanList } from "@shared/ban-list/BanList";
import EdoProBanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";

import { cardRepositories, isCardEngine } from "../composition/CardRepositories";

const findBanList = (engine: "edopro" | "ygopro", name: string): BanList | null =>
	engine === "edopro"
		? EdoProBanListMemoryRepository.findByName(name)
		: YGOProBanListMemoryRepository.findByName(name);

export class GetBanListDetailController {
	async run(request: Request, response: Response): Promise<void> {
		const engine = request.params.engine;
		const name = request.params.name;

		if (!isCardEngine(engine) || typeof name !== "string") {
			response.status(400).json({ error: "unknown engine or ban list" });

			return;
		}

		const banList = findBanList(engine, name);
		if (!banList) {
			response.status(404).json({ error: "ban list not found" });

			return;
		}

		const ids = [...banList.forbidden, ...banList.limited, ...banList.semiLimited, ...banList.all];
		const names = await cardRepositories[engine].resolveNames(ids);

		response.status(200).json({
			engine,
			...toBanListDetail(banList, (id) => names.get(id) ?? null),
		});
	}
}
