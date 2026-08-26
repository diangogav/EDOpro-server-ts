import type { CardReaderFn } from "koishipro-core.js";
import { Card } from "@shared/card/domain/Card";
import { CardRepository } from "@shared/card/domain/CardRepository";
import { YGOProResourceLoader } from "@ygopro/ygopro";
import { DEFAULT_POOL } from "@ygopro/ygopro/PoolSelection";

export class CardYGOProRepository implements CardRepository {
	constructor(private readonly cardPool: string = DEFAULT_POOL) {}

	private async getCardReader(): Promise<CardReaderFn> {
		const loader = YGOProResourceLoader.get();
		return loader.getPoolCardReader(this.cardPool);
	}

	async findByCode(code: string): Promise<Card | null> {
		const cardReader = await this.getCardReader();
		const card = cardReader(+code);
		if (
			!card ||
			card?.alias === null ||
			card?.alias === undefined ||
			card?.code === null ||
			card?.code === undefined ||
			card?.type === null ||
			card?.type === undefined ||
			card?.ot === null ||
			card?.ot === undefined ||
			card?.category === null ||
			card?.category === undefined
		) {
			return null;
		}

		return new Card({
			alias: card.alias.toString(),
			code: card.code.toString(),
			type: card.type,
			category: card.category ?? 0,
			variant: card.ot,
		});
	}
}
