import { BanList } from "../../ban-list/domain/BanList";
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Card } from "../../card/domain/Card";
import { CardRepository } from "../../card/domain/CardRepository";
import { DeckRules } from "../../room/domain/Room";
import { Deck } from "../domain/Deck";

export class DeckCreator {
	private readonly cardRepository: CardRepository;
	private readonly deckRules: DeckRules;
	private readonly duelFlags: bigint;
	private readonly DUEL_EXTRA_DECK_RITUAL_FLAG = 0x800000000n;

	constructor(cardRepositoy: CardRepository, deckRules: DeckRules, duelFlags: bigint) {
		this.cardRepository = cardRepositoy;
		this.deckRules = deckRules;
		this.duelFlags = duelFlags;
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
		const mainDeck: Card[] = [];
		const extraDeck: Card[] = [];
		const sideDeck: Card[] = [];
		const placeRitualInExtraDeckEnabled = this.placeRitualInExtraDeckEnabled();

		for (const code of main) {
			// eslint-disable-next-line no-await-in-loop
			const card = await this.cardRepository.findByCode(code.toString());
			if (!card) {
				continue;
			}

			if (card.isExtraCard() || (card.isRitualMonster() && placeRitualInExtraDeckEnabled)) {
				extraDeck.push(card);
			} else {
				mainDeck.push(card);
			}
		}

		for (const code of side) {
			// eslint-disable-next-line no-await-in-loop
			const card = await this.cardRepository.findByCode(code.toString());
			if (!card) {
				continue;
			}
			sideDeck.push(card);
		}

		const banList = BanListMemoryRepository.findByHash(banListHash);

		return new Deck({
			main: mainDeck,
			extra: extraDeck,
			side: sideDeck,
			banList: banList ?? new BanList(),
			deckRules: this.deckRules,
		});
	}

	private placeRitualInExtraDeckEnabled(): boolean {
		return (this.duelFlags & this.DUEL_EXTRA_DECK_RITUAL_FLAG) !== 0n;
	}
}
