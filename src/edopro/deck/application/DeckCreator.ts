import { DeckRules } from "@shared/room/domain/YgoRoom";
import { EdoproBanList } from "../../ban-list/domain/BanList";
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Card } from "../../../shared/card/domain/Card";
import { CardRepository } from "../../../shared/card/domain/CardRepository";
import { Deck } from "../../../shared/deck/domain/Deck";

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
			banList: banList ?? new EdoproBanList(),
			deckRules: this.deckRules,
		});
	}

	private placeRitualInExtraDeckEnabled(): boolean {
		return (this.duelFlags & this.DUEL_EXTRA_DECK_RITUAL_FLAG) !== 0n;
	}
}
