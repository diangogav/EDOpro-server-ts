import { getCardDataSource } from "../../../../shared/db/sqlite/infrastructure/data-source";
import { Card } from "../../../../shared/card/domain/Card";
import { CardRepository } from "../../../../shared/card/domain/CardRepository";
import { CardEntity } from "@shared/db/sqlite/infrastructure/CardEntity";
import { PrintingLookup } from "@edopro/deck/application/DeckCreator";

export class CardSQLiteTYpeORMRepository implements CardRepository, PrintingLookup {
	async findByCode(code: string): Promise<Card | null> {
		const repository = getCardDataSource().getRepository(CardEntity);
		const card = await repository.findOneBy({ id: code });
		if (!card) {
			return null;
		}

		return new Card({
			alias: card.alias,
			code: card.id,
			type: card.type,
			category: card.category,
			variant: card.ot,
		});
	}

	async findByAlias(code: string): Promise<Card[]> {
		const cards = await getCardDataSource().getRepository(CardEntity).findBy({ alias: code });

		return cards.map(
			(card) =>
				new Card({
					alias: card.alias,
					code: card.id,
					type: card.type,
					category: card.category,
					variant: card.ot,
				}),
		);
	}
}
