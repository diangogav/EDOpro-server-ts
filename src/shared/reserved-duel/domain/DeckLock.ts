import { DeckLockKind, RequiredDeck } from "./Reservation";

function counts(codes: readonly number[]): Map<number, number> {
	const result = new Map<number, number>();
	for (const code of codes) {
		result.set(code, (result.get(code) ?? 0) + 1);
	}

	return result;
}

function sameMultiset(a: readonly number[], b: readonly number[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	const left = counts(a);
	const right = counts(b);

	return [...left].every(([code, count]) => right.get(code) === count);
}

const allCards = (deck: RequiredDeck): number[] => [...deck.main, ...deck.extra, ...deck.side];

/**
 * Whether `deck` honours the seat's required deck.
 * - `exact`: every section holds exactly the required cards (order is irrelevant).
 * - `registered`: main + extra + side together hold exactly the registered cards,
 *   so cards may move between main and side between the duels of a match.
 */
export function deckHonoursLock(
	lock: DeckLockKind,
	required: RequiredDeck,
	deck: RequiredDeck,
): boolean {
	if (lock === "registered") {
		return sameMultiset(allCards(required), allCards(deck));
	}

	return (
		sameMultiset(required.main, deck.main) &&
		sameMultiset(required.extra, deck.extra) &&
		sameMultiset(required.side, deck.side)
	);
}
