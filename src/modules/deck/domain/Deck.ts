import { BanList } from "../../ban-list/domain/BanList";

enum DECK_ERROR {
	CARD_BANLISTED = 0x01,
}
interface DeckError {
	cardId: number;
	type: DECK_ERROR;
}
export class Deck {
	readonly main: number[];
	readonly side: number[];
	readonly extra: number[];
	private readonly banList: BanList;

	constructor({
		main = [],
		side = [],
		extra = [],
		banList,
	}: {
		main?: number[];
		side?: number[];
		extra?: number[];
		banList: BanList;
	}) {
		this.main = main;
		this.side = side;
		this.extra = extra;
		this.banList = banList;
		this.validate();
	}

	isSideDeckValid(mainDeck: number[]): boolean {
		return mainDeck.length === this.main.length + this.extra.length;
	}

	public validate(): DeckError | null {
		const cardCountMap: Map<number, number> = new Map();
		const allCards = [...this.main, ...this.side, ...this.extra];

		for (const cardId of allCards) {
			if (!this.banList.all.includes(cardId)) {
				return {
					type: DECK_ERROR.CARD_BANLISTED,
					cardId,
				};
			}
		}

		for (const cardId of allCards) {
			const count = cardCountMap.get(cardId) ?? 0;
			cardCountMap.set(cardId, count + 1);
		}

		for (const forbiddenCard of this.banList.forbidden) {
			const count = cardCountMap.get(forbiddenCard) ?? 0;
			if (count > 0) {
				return {
					type: DECK_ERROR.CARD_BANLISTED,
					cardId: forbiddenCard,
				};
			}
		}

		for (const limitedCard of this.banList.limited) {
			const count = cardCountMap.get(limitedCard) ?? 0;
			if (count > 1) {
				return {
					type: DECK_ERROR.CARD_BANLISTED,
					cardId: limitedCard,
				};
			}
		}

		for (const semilimitedCard of this.banList.semiLimited) {
			const count = cardCountMap.get(semilimitedCard) ?? 0;
			if (count > 2) {
				return {
					type: DECK_ERROR.CARD_BANLISTED,
					cardId: semilimitedCard,
				};
			}
		}

		return null;
	}
}
