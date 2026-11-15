import { DeckRules } from "@shared/room/domain/YgoRoom";
import { EdoproBanList } from "../../ban-list/domain/BanList";
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Card } from "../../../shared/card/domain/Card";
import { CardRepository } from "../../../shared/card/domain/CardRepository";
import { Deck } from "../../../shared/deck/domain/Deck";
import { foreignPrintings } from "../domain/ForeignPrintings";

/** The other printings of a card: the entries whose alias is its code. */
export interface PrintingLookup {
	findByAlias(code: string): Promise<Card[]>;
}

export class DeckCreator {
	private readonly cardRepository: CardRepository;
	private readonly deckRules: DeckRules;
	private readonly duelFlags: bigint;
	private readonly DUEL_EXTRA_DECK_RITUAL_FLAG = 0x800000000n;

	constructor(
		cardRepositoy: CardRepository,
		deckRules: DeckRules,
		duelFlags: bigint,
		private readonly printings: PrintingLookup = { findByAlias: () => Promise.resolve([]) },
	) {
		this.cardRepository = cardRepositoy;
		this.deckRules = deckRules;
		this.duelFlags = duelFlags;
	}

	async build({
		main,
		side,
		banListHash,
		fromForeignCardPool = false,
	}: {
		main: number[];
		side: number[];
		banListHash: number;
		fromForeignCardPool?: boolean;
	}): Promise<Deck> {
		const unknownCodes: number[] = [];
		const banList = BanListMemoryRepository.findByHash(banListHash) ?? new EdoproBanList();
		const listed =
			fromForeignCardPool && banList.isWhiteListed ? DeckCreator.listedCodes(banList) : null;
		const load = async (code: number): Promise<Card | null> => {
			const card = fromForeignCardPool
				? await this.findForeign(code)
				: await this.cardRepository.findByCode(code.toString());

			return card && listed ? this.listedPrinting(card, listed) : card;
		};
		const mainDeck: Card[] = [];
		const extraDeck: Card[] = [];
		const sideDeck: Card[] = [];
		const placeRitualInExtraDeckEnabled = this.placeRitualInExtraDeckEnabled();

		for (const code of main) {
			const card = await load(code);
			if (!card) {
				unknownCodes.push(code);
				continue;
			}

			if (card.isExtraCard() || (card.isRitualMonster() && placeRitualInExtraDeckEnabled)) {
				extraDeck.push(card);
			} else {
				mainDeck.push(card);
			}
		}

		for (const code of side) {
			const card = await load(code);
			if (!card) {
				unknownCodes.push(code);
				continue;
			}
			sideDeck.push(card);
		}

		return new Deck({
			main: mainDeck,
			extra: extraDeck,
			side: sideDeck,
			banList,
			deckRules: this.deckRules,
			unknownCodes: fromForeignCardPool ? unknownCodes : [],
		});
	}

	/**
	 * A code from another card pool: the card itself when this pool has it,
	 * otherwise the original that pool says it copies.
	 */
	private async findForeign(code: number): Promise<Card | null> {
		const card = await this.cardRepository.findByCode(code.toString());
		if (card) {
			return card;
		}
		const original = await foreignPrintings().originalOf(code);

		return original === null ? null : this.cardRepository.findByCode(original.toString());
	}

	private static listedCodes(banList: EdoproBanList): Set<number> {
		return new Set([
			...banList.all,
			...banList.limited,
			...banList.semiLimited,
			...banList.forbidden,
		]);
	}

	/**
	 * On a whitelist, a card the list does not name may still be playable as
	 * another printing the list does name (a pre-errata copy that points at it).
	 * A client from another card pool sends the printing it knows, so the room
	 * picks the listed one for it.
	 */
	private async listedPrinting(card: Card, listed: Set<number>): Promise<Card> {
		const isListed = (candidate: Card): boolean =>
			listed.has(Number(candidate.code)) || listed.has(Number(candidate.alias));
		if (isListed(card)) {
			return card;
		}
		const printings = await this.printings.findByAlias(card.code);

		return printings.find((printing) => listed.has(Number(printing.code))) ?? card;
	}

	private placeRitualInExtraDeckEnabled(): boolean {
		return (this.duelFlags & this.DUEL_EXTRA_DECK_RITUAL_FLAG) !== 0n;
	}
}
