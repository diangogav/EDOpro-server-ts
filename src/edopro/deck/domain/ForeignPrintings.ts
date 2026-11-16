/**
 * What another card pool knows about a card this one lacks: the code of the
 * original it is a copy of. A client of that pool puts its own alternate
 * artworks and copies in a deck, and this pool only has the original.
 */
export interface ForeignPrintings {
	/** The original of `code` in the other pool, or null when it has none. */
	originalOf(code: number): Promise<number | null>;
}

const NONE: ForeignPrintings = { originalOf: () => Promise.resolve(null) };

let registered: ForeignPrintings = NONE;

/** Registers the other pool's lookup; boot calls it when that pool exists. */
export function useForeignPrintings(printings: ForeignPrintings): void {
	registered = printings;
}

/** The registered lookup; one that knows no card when none was registered. */
export function foreignPrintings(): ForeignPrintings {
	return registered;
}
