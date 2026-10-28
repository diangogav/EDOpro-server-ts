import { Deck } from "@shared/deck/domain/Deck";
import { RequiredDeck } from "@shared/reserved-duel/domain/Reservation";

/** A built deck as the card codes per section a reservation's deck lock compares. */
export function toCardCodes(deck: Deck): RequiredDeck {
	const codes = (cards: Deck["main"]): number[] => cards.map((card) => Number(card.code));

	return { main: codes(deck.main), extra: codes(deck.extra), side: codes(deck.side) };
}
