/**
 * The code this card pool gives a card that another pool numbers differently.
 * A card with no passcode yet carries a temporary number, and each card pool
 * assigns its own, so nothing in either database links the two.
 */
export interface ForeignCounterparts {
	/** This pool's code for the other pool's `code`, or null when none is known. */
	counterpartOf(code: number): Promise<number | null>;
}

const NONE: ForeignCounterparts = { counterpartOf: () => Promise.resolve(null) };

let registered: ForeignCounterparts = NONE;

/** Registers the lookup; boot calls it. */
export function useForeignCounterparts(counterparts: ForeignCounterparts): void {
	registered = counterparts;
}

/** The registered lookup; one that knows no card when none was registered. */
export function foreignCounterparts(): ForeignCounterparts {
	return registered;
}
