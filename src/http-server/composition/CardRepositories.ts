import { CardEngine } from "@shared/card/application/SearchCards";
import { CdbCardSearchRepository } from "@shared/card/infrastructure/cdb/CdbCardSearchRepository";
import { EdoProCardSearchRepository } from "@edopro/card/infrastructure/EdoProCardSearchRepository";
import { YGOProCardSearchRepository } from "@ygopro/card/infrastructure/YGOProCardSearchRepository";

export const cardRepositories: Record<CardEngine, CdbCardSearchRepository> = {
	edopro: new EdoProCardSearchRepository(),
	ygopro: new YGOProCardSearchRepository(),
};

export const isCardEngine = (value: unknown): value is CardEngine =>
	value === "edopro" || value === "ygopro";
