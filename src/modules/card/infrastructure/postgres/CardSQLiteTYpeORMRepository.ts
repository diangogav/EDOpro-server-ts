import { dataSource } from "../../../shared/db/postgres/infrastructure/data-source";
import { Card } from "../../domain/Card";
import { CardRepository } from "../../domain/CardRepository";
import { CardEntity } from "./CardEntity";

export class CardSQLiteTYpeORMRepository implements CardRepository {
	async findByCode(code: string): Promise<Card | null> {
		const repository = dataSource.getRepository(CardEntity);
		const card = await repository.findOneBy({ id: code });
		if (!card) {
			return null;
		}

		return new Card({ code: card.id, type: card.type, category: card.category, variant: card.ot });
	}
}
