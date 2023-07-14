import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { CardRepository } from "../../card/domain/CardRepository";
import { DeckRules } from "../../room/domain/Room";
import { Deck } from "../domain/Deck";

export class DeckCreator {
	private readonly cardRepository: CardRepository;
	private readonly deckRules: DeckRules;

	constructor(cardRepositoy: CardRepository, deckRules: DeckRules) {
		this.cardRepository = cardRepositoy;
		this.deckRules = deckRules;
	}

	async build({
		main,
		side,
		banListHash,
	}: {
		main: number[];
		side: number[];
		banListHash: number;
	}): Promise<Deck> {
		const mainDeck: number[] = [];
		const extraDeck: number[] = [];

		for (const code of main) {
			// eslint-disable-next-line no-await-in-loop
			const card = await this.cardRepository.findByCode(code.toString());
			card?.isExtraCard() ? extraDeck.push(Number(card.code)) : mainDeck.push(Number(code));
		}

		const banList = BanListMemoryRepository.findByHash(banListHash);

		if (!banList) {
			throw new Error("BanList not found");
		}

		return new Deck({ main: mainDeck, extra: extraDeck, side, banList, deckRules: this.deckRules });
	}
}
