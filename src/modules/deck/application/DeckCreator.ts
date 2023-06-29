import { CardRepository } from "../../card/domain/CardRepository";
import { Deck } from "../domain/Deck";

export class DeckCreator {
	private readonly cardRepository: CardRepository;

	constructor(cardRepositoy: CardRepository) {
		this.cardRepository = cardRepositoy;
	}

	async build({ main, side }: { main: number[]; side: number[] }): Promise<Deck> {
		const mainDeck: number[] = [];
		const extraDeck: number[] = [];

		for (const code of main) {
			// eslint-disable-next-line no-await-in-loop
			const card = await this.cardRepository.findByCode(code.toString());
			card?.isExtraCard() ? extraDeck.push(Number(card.code)) : mainDeck.push(Number(code));
		}

		return new Deck({ main: mainDeck, extra: extraDeck, side });
	}
}
